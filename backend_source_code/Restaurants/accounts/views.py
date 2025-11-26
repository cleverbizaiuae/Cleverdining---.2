from django.shortcuts import render
from .models import User,ChefStaff,PasswordResetOTP
from rest_framework.generics import CreateAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import RegisterSerializer,ChefStaffCreateSerializer,ChefStaffDetailSerializer,SendOTPSerializer, VerifyOTPSerializer, ResetPasswordSerializer,UserWithRestaurantSerializer,UserSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied, ValidationError, AuthenticationFailed
from rest_framework import filters
from .permissions import IsOwnerRole
from .pagination import ChefAndStaffPagination
from django.core.mail import send_mail
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging
# jwt
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import OutstandingToken,BlacklistedToken,RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from .utils import get_restaurant_owner_id
from rest_framework.exceptions import NotFound
from django.contrib.auth import authenticate

logger = logging.getLogger(__name__)
# Create your views here.

class RegisterApiView(CreateAPIView):
    queryset= User.objects.all()
    serializer_class=RegisterSerializer
    permission_classes = [AllowAny]




class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom serializer that handles email-based authentication.
    BULLETPROOF: Handles all edge cases and never crashes.
    """
    
    @classmethod
    def get_token(cls, user):
        """
        Generate JWT token with minimal user data.
        Avoids complex database queries that can fail.
        """
        token = super().get_token(user)
        
        # Extract minimal user data without complex queries
        first_restaurant_id = None
        first_device_id = None
        
        # Safely get owner_id
        try:
            from .utils import get_restaurant_owner_id
            owner_id = get_restaurant_owner_id(user)
        except Exception:
            owner_id = None
        
        # Get first restaurant ID safely (if exists)
        try:
            if user.role == 'owner':
                first_restaurant = user.restaurants.first()
                if first_restaurant:
                    first_restaurant_id = first_restaurant.id
        except Exception:
            pass
        
        # Get first device ID safely (if exists)
        try:
            first_device = user.devices.first()
            if first_device:
                first_device_id = first_device.id
        except Exception:
            pass
        
        # Build token payload with safe, minimal data
        token['user'] = {
            'id': user.id,
            'username': getattr(user, 'username', ''),
            'email': getattr(user, 'email', ''),
            'role': getattr(user, 'role', ''),
            'restaurants_id': first_restaurant_id,
            'device_id': first_device_id,
            'subscription': {
                'package_name': None,
                'status': None,
                'current_period_end': None,
            },
            'owner_id': owner_id
        }
        
        return token

    def validate(self, attrs):
        """
        BULLETPROOF login validation.
        Manually authenticates user before calling parent to avoid any issues.
        """
        try:
            # Extract email/username and password
            email_or_username = None
            password = attrs.get('password', '').strip()
            
            # Handle 'email' field (frontend sends this)
            if 'email' in attrs:
                email_or_username = attrs.pop('email', '').strip()
            elif 'username' in attrs:
                email_or_username = attrs.get('username', '').strip()
            
            # Validate inputs
            if not email_or_username:
                logger.error("Login attempt without email/username")
                raise ValidationError({"email": "Email or username is required."})
            
            if not password:
                logger.error("Login attempt without password")
                raise ValidationError({"password": "Password is required."})
            
            logger.info(f"Login attempt: {email_or_username}")
            
            # MANUALLY AUTHENTICATE USER - This is the key fix
            # Try email first (since USERNAME_FIELD = 'email')
            user = None
            try:
                user = User.objects.get(email=email_or_username)
                logger.info(f"User found by email: {user.email}")
            except User.DoesNotExist:
                try:
                    user = User.objects.get(username=email_or_username)
                    logger.info(f"User found by username: {user.username}")
                except User.DoesNotExist:
                    logger.warning(f"User not found: {email_or_username}")
                    raise AuthenticationFailed("Invalid email or password.")
            
            # Check if user is active
            if not user.is_active:
                logger.warning(f"Inactive user attempted login: {email_or_username}")
                raise AuthenticationFailed("This account is inactive.")
            
            # Verify password
            if not user.check_password(password):
                logger.warning(f"Invalid password for user: {email_or_username}")
                raise AuthenticationFailed("Invalid email or password.")
            
            logger.info(f"Password verified for user: {user.email}")
            
            # Set the user for the parent serializer
            self.user = user
            
            # Now call parent validate with username set to email (for token generation)
            # This ensures the token is generated correctly
            attrs['username'] = user.email  # Use email as username for token
            data = super().validate(attrs)
            
            # Build user data response
            user_data = {
                'id': user.id,
                'username': getattr(user, 'username', ''),
                'email': getattr(user, 'email', ''),
                'role': getattr(user, 'role', ''),
                'restaurants': [],
                'owner_id': None,
                'image': None
            }
            
            # Safely get image URL
            try:
                if hasattr(user, 'image') and user.image:
                    user_data['image'] = user.image.url
            except Exception:
                user_data['image'] = None
            
            # Safely get owner_id
            try:
                user_data['owner_id'] = get_restaurant_owner_id(user)
            except Exception:
                user_data['owner_id'] = None
            
            # Only load restaurants for owners
            if user.role == 'owner':
                try:
                    first_restaurant = user.restaurants.first()
                    if first_restaurant:
                        user_data['restaurants'] = [{
                            'id': first_restaurant.id,
                            'resturent_name': getattr(first_restaurant, 'resturent_name', ''),
                            'location': getattr(first_restaurant, 'location', ''),
                            'source': 'owner',
                            'device_id': None,
                            'table_name': None,
                            'subscription': {
                                'package_name': 'Basic',
                                'status': 'active',
                                'current_period_end': None
                            }
                        }]
                except Exception as rest_error:
                    logger.warning(f"Could not load restaurants for owner {user.email}: {str(rest_error)}")
            
            data['user'] = user_data
            logger.info(f"Login successful for user: {user.email} (role: {user.role})")
            return data

        except (AuthenticationFailed, ValidationError) as auth_error:
            # Re-raise authentication/validation errors as-is
            logger.warning(f"Authentication failed: {str(auth_error)}")
            raise
        
        except Exception as e:
            # Catch ANY other error and log it
            logger.error(f"CRITICAL: Unexpected login error: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Return a safe error message
            raise AuthenticationFailed("Login failed. Please try again.")


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    
    def dispatch(self, request, *args, **kwargs):
        """
        ABSOLUTE CATCH-ALL: Ensures no 500 errors leak through.
        """
        try:
            return super().dispatch(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"CRITICAL: Login view dispatch exception: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Return proper JSON error response
            from rest_framework.response import Response
            from rest_framework import status
            
            # If it's an authentication error, return 401
            if isinstance(e, (AuthenticationFailed, ValidationError)):
                error_detail = str(e.detail) if hasattr(e, 'detail') else str(e)
                if isinstance(error_detail, list):
                    error_detail = error_detail[0] if error_detail else "Invalid credentials."
                return Response(
                    {
                        "detail": error_detail,
                        "error": "Authentication failed"
                    },
                    status=status.HTTP_401_UNAUTHORIZED,
                    content_type='application/json'
                )
            
            # For any other error, return 401 with generic message (not 500!)
            return Response(
                {
                    "detail": "Login failed. Please check your credentials and try again.",
                    "error": "Authentication error"
                },
                status=status.HTTP_401_UNAUTHORIZED,
                content_type='application/json'
            )


# Test endpoint to verify user exists
class TestUserView(APIView):
    """Test endpoint to check if a user exists (for debugging)"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        email = request.data.get('email', '').strip()
        if not email:
            return Response({"error": "Email required"}, status=400)
        
        try:
            user = User.objects.get(email=email)
            return Response({
                "exists": True,
                "email": user.email,
                "username": user.username,
                "role": user.role,
                "is_active": user.is_active,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser
            })
        except User.DoesNotExist:
            return Response({"exists": False, "email": email})


# Logout view 
class LogoutApiView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": "Error logging out."}, status=status.HTTP_400_BAD_REQUEST)
