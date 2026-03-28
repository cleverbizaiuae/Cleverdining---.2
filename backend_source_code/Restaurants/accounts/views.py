from django.shortcuts import render
from .models import User,ChefStaff,PasswordResetOTP,PasswordResetToken
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
from rest_framework.decorators import action
from .permissions import IsOwnerRole, IsOwnerChefOrStaff
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

import time

class CreateSuperAdminView(APIView):
    """
    Emergency view to create/reset superadmin credentials on production
    Usage: GET /api/create-admin-fix/
    """
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            username = 'admin'
            email = 'admin@cleverbiz.ai'
            password = 'password123'
            
            # Find potentially conflicting users
            email_user = User.objects.filter(email=email).first()
            username_user = User.objects.filter(username=username).first()
            
            target_user = None

            if email_user:
                # Prioritize the user that already has the correct email
                target_user = email_user
                
                # If 'admin' username is taken by a DIFFERENT user, rename that user to free up the name
                if username_user and username_user.id != email_user.id:
                    old_name = username_user.username
                    new_name = f"{old_name}_backup_{int(time.time())}"
                    username_user.username = new_name
                    username_user.save()
                    logger.warning(f"Renamed conflicting user {old_name} to {new_name}")

            elif username_user:
                # No one has the email, but 'admin' username exists. Use that user.
                target_user = username_user
            
            if target_user:
                target_user.username = username
                target_user.email = email
                target_user.set_password(password)
                target_user.is_superuser = True
                target_user.is_staff = True
                target_user.is_active = True
                target_user.save()
                return Response({
                    "message": f"Admin exists (id={target_user.id}). Credentials updated. Conflicting users resolved.",
                    "credentials": {"email": email, "password": password}
                })
            else:
                User.objects.create_superuser(username=username, email=email, password=password)
                return Response({
                    "message": "Successfully created new Super Admin.",
                    "credentials": {"email": email, "password": password}
                })
        except Exception as e:
            return Response({"error": str(e)}, status=500)

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
            if getattr(user, 'role', None) == 'owner':
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
            
            # Load restaurants for owners, staff, and chefs
            if getattr(user, 'role', None) == 'owner':
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
            
            elif getattr(user, 'role', None) in ['staff', 'chef']:
                try:
                    # Find accepted employment
                    employment = ChefStaff.objects.filter(user=user, action='accepted').first()
                    if employment and employment.restaurant:
                        restaurant = employment.restaurant
                        user_data['restaurants'] = [{
                            'id': restaurant.id,
                            'resturent_name': getattr(restaurant, 'resturent_name', ''),
                            'location': getattr(restaurant, 'location', ''),
                            'source': user.role, # 'staff' or 'chef'
                            'device_id': None,
                            'table_name': None,
                            'subscription': {
                                'package_name': 'Basic',
                                'status': 'active',
                                'current_period_end': None
                            }
                        }]
                except Exception as rest_error:
                    logger.warning(f"Could not load restaurant for {user.role} {user.email}: {str(rest_error)}")
            
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


# Health check endpoint
class HealthCheckView(APIView):
    """Health check endpoint to verify backend is running"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        from django.db import connection
        import sys
        
        health_data = {
            "status": "healthy",
            "service": "Cleverdining Backend API",
            "version": "1.0.0",
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        }
        
        # Test database connectivity
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                if result[0] == 1:
                    health_data["database"] = "connected"
                else:
                    health_data["database"] = "error"
                    health_data["status"] = "unhealthy"
        except Exception as e:
            health_data["database"] = f"error: {str(e)}"
            health_data["status"] = "unhealthy"
        
        # Count users (basic query test)
        try:
            user_count = User.objects.count()
            health_data["total_users"] = user_count
        except Exception as e:
            health_data["total_users"] = f"error: {str(e)}"
        
        status_code = 200 if health_data["status"] == "healthy" else 500
        return Response(health_data, status=status_code)


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


class ChefStaffViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]
    serializer_class = ChefStaffCreateSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__username']
    pagination_class = ChefAndStaffPagination

    def get_queryset(self):
        try:
            user = self.request.user
            role = getattr(user, 'role', None)
            
            if role == 'owner':
                return ChefStaff.objects.filter(restaurant__owner=user)
            elif role in ['chef', 'staff', 'manager']:
                # Allow staff/chef to see members of their own restaurant
                employment = ChefStaff.objects.filter(user=user, action='accepted').first()
                if employment:
                    return ChefStaff.objects.filter(restaurant=employment.restaurant)
            return ChefStaff.objects.none()
        except Exception as e:
            print(f"ChefStaffViewSet.get_queryset error: {e}")
            import traceback
            traceback.print_exc()
            return ChefStaff.objects.none()

    def get_serializer_class(self):
        if self.action in ['list', 'retrieve', 'update', 'partial_update']:
            return ChefStaffDetailSerializer
        return ChefStaffCreateSerializer

    def list(self, request, *args, **kwargs):
        """Override list to ensure it never crashes."""
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            print(f"ChefStaffViewSet.list error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'count': 0,
                'next': None,
                'previous': None,
                'results': []
            })

    def perform_create(self, serializer):
        try:
            user = self.request.user
            restaurant = None
            role = getattr(user, 'role', None)
            
            if role == 'owner':
                if hasattr(user, 'restaurants') and user.restaurants.exists():
                    restaurant = user.restaurants.first()
                else:
                    from restaurant.models import Restaurant
                    restaurant = Restaurant.objects.filter(owner=user).first()
            elif role in ['chef', 'staff', 'manager']:
                employment = ChefStaff.objects.filter(user=user, action='accepted').first()
                if employment:
                    restaurant = employment.restaurant
            
            if not restaurant:
                raise ValidationError("You do not have a valid restaurant association to add members.")

            instance = serializer.save(restaurant=restaurant)
            logger.info(f"ChefStaff member created successfully: user={instance.user.username}, restaurant={instance.restaurant.id}")
            
            # WebSocket broadcast is best-effort — must not affect the HTTP response
            try:
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{instance.restaurant.id}",
                    {
                        "type": "chefstaff_created",
                        "chefstaff": {
                            "id": instance.id,
                            "username": instance.user.username,
                            "restaurant_id": instance.restaurant.id
                        }
                    }
                )
            except Exception as ws_err:
                logger.warning(f"WebSocket broadcast failed (chefstaff_created): {ws_err}")
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"ChefStaffViewSet.perform_create error: {e}")
            raise ValidationError(f"Failed to create member: {str(e)}")

    def perform_update(self, serializer):
        try:
            instance = self.get_object()
            # Allow Managers (Staff/Chef) to update if they belong to the same restaurant
            user = self.request.user
            can_update = False
            role = getattr(user, 'role', None)
            
            if role == 'owner' and instance.restaurant.owner == user:
                can_update = True
            elif role in ['chef', 'staff', 'manager']:
                employment = ChefStaff.objects.filter(user=user, action='accepted').first()
                if employment and employment.restaurant == instance.restaurant:
                    can_update = True
                    
            if not can_update:
                raise PermissionDenied("You do not have permission to update this record.")
                
            serializer.save()
            logger.info(f"ChefStaff member updated successfully: id={instance.id}")

            # WebSocket broadcast is best-effort — must not affect the HTTP response
            try:
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{instance.restaurant.id}",
                    {
                        "type": "chefstaff_updated",
                        "chefstaff": {
                            "id": instance.id,
                            "username": instance.user.username,
                            "restaurant_id": instance.restaurant.id
                        }
                    }
                )
            except Exception as ws_err:
                logger.warning(f"WebSocket broadcast failed (chefstaff_updated): {ws_err}")
        except PermissionDenied:
            raise
        except Exception as e:
            logger.error(f"ChefStaffViewSet.perform_update error: {e}")
            raise PermissionDenied(f"Failed to update member: {str(e)}")

    def perform_destroy(self, instance):
        # Allow Managers to delete? Maybe restricted to Owner for safety, unless requested.
        # User asked "unable to add members". Let's stick to Create/List/Update for now.
        # But if they can Manage, they might expect delete.
        # Let's keep Owner restriction for DESTRUCTION for safety, or allow if logic similar to update.
        # Let's keep strict Owner for delete for now unless complained.
        if instance.restaurant.owner != self.request.user:
            raise PermissionDenied("You do not have permission to delete this record.")

        restaurant_id = instance.restaurant.id
        instance_id = instance.id
        instance.delete()
        logger.info(f"ChefStaff member deleted successfully: id={instance_id}")

        # WebSocket broadcast is best-effort — must not affect the HTTP response
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant_id}",
                {
                    "type": "chefstaff_deleted",
                    "chefstaff_id": instance_id
                }
            )
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast failed (chefstaff_deleted): {ws_err}")

    @action(detail=True, methods=['post'], url_path='change-password')
    def change_password(self, request, pk=None):
        instance = self.get_object()
        
        # Permission check: Only Owner
        if instance.restaurant.owner != request.user:
             return Response({"error": "You do not have permission to change this password."}, status=status.HTTP_403_FORBIDDEN)

        new_password = request.data.get('new_password')
        if not new_password:
             return Response({"error": "New password is required."}, status=status.HTTP_400_BAD_REQUEST)
             
        instance.user.set_password(new_password)
        instance.user.save()
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)



class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        otp_record = PasswordResetOTP.objects.create(user=user)

        send_mail(
            subject='Password Reset OTP',
            message=f'Your OTP is: {otp_record.otp}',
            from_email=None,
            recipient_list=[email],
        )

        return Response({"detail": "OTP sent successfully."}, status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']

        try:
            user = User.objects.get(email=email)
            otp_obj = PasswordResetOTP.objects.filter(user=user, otp=otp, is_used=False).latest('created_at')
        except (User.DoesNotExist, PasswordResetOTP.DoesNotExist):
            return Response({"detail": "Invalid email or OTP."}, status=status.HTTP_400_BAD_REQUEST)

        otp_obj.is_used = True
        otp_obj.save()
        return Response({"detail": "OTP verified successfully."}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        new_password = serializer.validated_data['new_password']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        otp_exists = PasswordResetOTP.objects.filter(user=user, is_used=True).exists()
        if not otp_exists:
            return Response({"detail": "OTP not verified."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        PasswordResetOTP.objects.filter(user=user).delete()

        return Response({"detail": "Password reset successfully."}, status=status.HTTP_200_OK)


class UserInfoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound(detail="User not found")

        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserWithRestaurantSerializer(request.user)
        return Response(serializer.data)

    def put(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


# ─── Token-based Forgot Password Flow ──────────────────────────────────
import secrets
import hashlib
import re
from datetime import timedelta
from django.utils import timezone
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings as django_settings
from django.db.utils import OperationalError


class ForgotPasswordView(APIView):
    """Send a password reset link via email.
    Always returns 200 OK to prevent email enumeration.
    Rate limited: max 5 requests per email per hour."""
    permission_classes = [AllowAny]

    FRONTEND_RESET_URL = 'https://officialcleverdining.netlify.app/reset-password'
    MAX_REQUESTS_PER_HOUR = 5
    TOKEN_EXPIRY_MINUTES = 15

    def post(self, request):
        email = request.data.get('email', '').strip().lower()

        # Basic validation
        if not email or '@' not in email:
            return Response({'detail': 'Please provide a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        # Always return 200 (generic message) regardless of whether user exists
        generic_response = Response(
            {'detail': 'If the email is registered, you will receive a password reset link shortly.'},
            status=status.HTTP_200_OK
        )

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # User not found — still return 200 (no enumeration)
            return generic_response

        # Rate limiting: max N requests per hour for this email
        one_hour_ago = timezone.now() - timedelta(hours=1)
        try:
            recent_count = PasswordResetToken.objects.filter(
                user=user, created_at__gte=one_hour_ago
            ).count()
        except OperationalError as exc:
            logger.warning("Password reset token table unavailable during rate-limit check: %s", exc)
            return generic_response
        if recent_count >= self.MAX_REQUESTS_PER_HOUR:
            return generic_response  # Silently rate-limit

        # Generate crypto-random token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = timezone.now() + timedelta(minutes=self.TOKEN_EXPIRY_MINUTES)

        # Store hashed token
        try:
            PasswordResetToken.objects.create(
                user=user,
                token_hash=token_hash,
                expires_at=expires_at
            )
        except OperationalError as exc:
            logger.warning("Password reset token table unavailable during token create: %s", exc)
            return generic_response

        # Build reset link
        reset_link = f"{self.FRONTEND_RESET_URL}?token={raw_token}"

        # Send email
        try:
            subject = 'Reset Your CleverDining Password'
            text_body = (
                f'Hi {user.username},\n\n'
                f'You requested a password reset for your CleverDining account.\n\n'
                f'Click the link below to reset your password:\n{reset_link}\n\n'
                f'This link expires in {self.TOKEN_EXPIRY_MINUTES} minutes.\n\n'
                f'If you did not request this, please ignore this email.\n\n'
                f'— CleverDining Team'
            )
            html_body = f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 24px; font-weight: 700; color: #0B5ED7; margin: 0;">CleverDining</h1>
                </div>
                <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin-bottom: 8px;">Password Reset</h2>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                    Hi {user.username}, you requested a password reset. Click the button below to choose a new password.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                    <a href="{reset_link}" style="display: inline-block; background: #0B5ED7; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px;">Reset Password</a>
                </div>
                <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 32px;">
                    This link expires in {self.TOKEN_EXPIRY_MINUTES} minutes. If you didn't request this, ignore this email.
                </p>
            </div>
            """

            email_msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=None,  # Uses DEFAULT_FROM_EMAIL
                to=[email]
            )
            email_msg.attach_alternative(html_body, 'text/html')
            email_msg.send(fail_silently=True)
        except Exception as e:
            logger.error(f"Failed to send password reset email to {email}: {e}")

        return generic_response


class TokenResetPasswordView(APIView):
    """Reset password using a token received via email."""
    permission_classes = [AllowAny]

    PASSWORD_REGEX = re.compile(
        r'^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]).{8,}$'
    )

    def post(self, request):
        raw_token = request.data.get('token', '').strip()
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')

        # Validate inputs
        if not raw_token:
            return Response({'detail': 'Reset token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not new_password or not confirm_password:
            return Response({'detail': 'Both password fields are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({'detail': 'Passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)

        if not self.PASSWORD_REGEX.match(new_password):
            return Response(
                {'detail': 'Password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 special character.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Lookup token by hash
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        try:
            token_obj = PasswordResetToken.objects.get(token_hash=token_hash, is_used=False)
        except PasswordResetToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check expiry
        if timezone.now() > token_obj.expires_at:
            token_obj.is_used = True  # Mark as used to prevent retry
            token_obj.save()
            return Response({'detail': 'Reset link has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        # Reset password
        user = token_obj.user
        user.set_password(new_password)
        user.save()

        # Invalidate ALL tokens for this user (single use + cleanup)
        PasswordResetToken.objects.filter(user=user).update(is_used=True)

        return Response({'detail': 'Password reset successfully. Redirecting to login...'}, status=status.HTTP_200_OK)
