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

logger = logging.getLogger(__name__)
# Create your views here.

class RegisterApiView(CreateAPIView):
    queryset= User.objects.all()
    serializer_class=RegisterSerializer
    permission_classes = [AllowAny]




class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    
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
        Validate login credentials and return user data.
        Comprehensive error handling ensures no 500 errors.
        """
        try:
            # Handle 'email' field (frontend sends this)
            # Since USERNAME_FIELD = 'email', we need to map email to username field
            # that TokenObtainPairSerializer expects, but it will use email for auth
            if 'email' in attrs:
                email_value = attrs.pop('email', '').strip()
                if email_value:
                    # Map email to username field (TokenObtainPairSerializer expects 'username')
                    # But since USERNAME_FIELD='email', Django will use this as email for auth
                    attrs['username'] = email_value
                    logger.info(f"Login attempt with email: {email_value}")
            elif 'username' in attrs:
                attrs['username'] = attrs['username'].strip()
                logger.info(f"Login attempt with username: {attrs['username']}")
            
            # Ensure password is present
            if 'password' not in attrs or not attrs.get('password'):
                logger.error("Login attempt without password")
                raise ValidationError({"password": "Password is required."})

            # Call parent validate which handles authentication
            # Wrap in try-except to catch ANY exception from parent
            try:
                # Log what we're trying to authenticate
                logger.info(f"Attempting login with username/email: {attrs.get('username', 'N/A')}")
                
                data = super().validate(attrs)
                user = self.user
                
                logger.info(f"Authentication successful for user: {user.email}")
            except Exception as auth_error:
                # Log the actual error details
                logger.error(f"Authentication failed: {str(auth_error)}", exc_info=True)
                logger.error(f"Error type: {type(auth_error).__name__}")
                logger.error(f"Attempted username/email: {attrs.get('username', 'N/A')}")
                
                # If parent validate fails, check if it's an auth error
                if isinstance(auth_error, (AuthenticationFailed, ValidationError)):
                    # Log the actual error detail
                    error_detail = str(auth_error.detail) if hasattr(auth_error, 'detail') else str(auth_error)
                    logger.error(f"Auth error detail: {error_detail}")
                    raise  # Re-raise auth errors as-is
                
                # If it's any other error, log and convert to auth error
                logger.error(f"Parent validate() failed with unexpected error: {str(auth_error)}", exc_info=True)
                raise AuthenticationFailed("Invalid credentials.")

            # Build minimal user data with comprehensive error handling
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
                from .utils import get_restaurant_owner_id
                user_data['owner_id'] = get_restaurant_owner_id(user)
            except Exception:
                user_data['owner_id'] = None

            # Only load restaurants for owners, and only if they exist
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
                    # Continue with empty restaurants array - user can still login

            data['user'] = user_data
            logger.info(f"Login successful for user: {user.email} (role: {user.role})")
            return data

        except Exception as e:
            logger.error(f"CRITICAL: Login error: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Re-raise authentication errors (wrong password, user not found, etc.)
            if isinstance(e, (AuthenticationFailed, ValidationError)):
                raise
            
            # For unexpected errors, raise with clear message
            raise AuthenticationFailed("Login failed. Please try again.")




class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    
    def dispatch(self, request, *args, **kwargs):
        """
        Catch all exceptions and return proper JSON responses.
        Ensures no 500 errors leak through.
        """
        try:
            return super().dispatch(request, *args, **kwargs)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"CRITICAL: Login view exception: {str(e)}", exc_info=True)
            
            # Return proper JSON error response
            from rest_framework.response import Response
            from rest_framework import status
            from rest_framework.exceptions import AuthenticationFailed
            
            # If it's an authentication error, return 401
            if isinstance(e, AuthenticationFailed):
                return Response(
                    {
                        "detail": str(e.detail) if hasattr(e, 'detail') else "Invalid credentials.",
                        "error": "Authentication failed"
                    },
                    status=status.HTTP_401_UNAUTHORIZED,
                    content_type='application/json'
                )
            
            # For any other error, return 401 with generic message
            return Response(
                {
                    "detail": "Login failed. Please check your credentials and try again.",
                    "error": "Authentication error"
                },
                status=status.HTTP_401_UNAUTHORIZED,
                content_type='application/json'
            )




# Logout view 
class LogoutApiView(APIView):

    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            # Get the current token from the request
            token = request.headers.get('Authorization').split(' ')[1]
            
            # Check if the token exists in the OutstandingToken list
            outstanding_token = OutstandingToken.objects.filter(token=token).first()
            if outstanding_token:
                # Blacklist the token to invalidate it
                BlacklistedToken.objects.create(token=outstanding_token)
            
            return Response({"detail": "Successfully logged out."}, status=200)
        
        except Exception as e:
            return Response({"detail": "Error logging out."}, status=400)




    
class ChefStaffViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated,IsOwnerRole]
    serializer_class = ChefStaffCreateSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__username']
    pagination_class = ChefAndStaffPagination

    def get_queryset(self):
        return ChefStaff.objects.filter(restaurant__owner=self.request.user)
    

    def get_serializer_class(self):
        if self.action in ['list', 'retrieve', 'update', 'partial_update']:
            return ChefStaffDetailSerializer
        return ChefStaffCreateSerializer


    def perform_create(self, serializer):
        instance = serializer.save()
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

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.restaurant.owner != self.request.user:
            raise PermissionDenied("You do not have permission to update this record.")
        serializer.save()

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
    

    def perform_destroy(self, instance):
        if instance.restaurant.owner != self.request.user:
            raise PermissionDenied("You do not have permission to delete this record.")

        restaurant_id = instance.restaurant.id
        instance_id = instance.id
        instance.delete()

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{restaurant_id}",
            {
                "type": "chefstaff_deleted",
                "chefstaff_id": instance_id
            }
        )




class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        user = User.objects.get(email=email)
        otp_record = PasswordResetOTP.objects.create(user=user)

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        refresh['email'] = user.email
        refresh['username'] = user.username

        access_token = str(refresh.access_token)

        # Send OTP via email
        send_mail(
            subject='Your OTP Code',
            message=f'Your OTP is: {otp_record.otp}',
            from_email='no-reply@example.com',
            recipient_list=[email],
        )

        return Response({
            "message": "OTP sent to your email.",
            "access_token": access_token,
            "refresh_token": str(refresh),
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username
            }
        })


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']

        try:
            user = User.objects.get(email=email)
            otp_record = PasswordResetOTP.objects.filter(user=user, otp=otp, is_verified=False).latest('created_at')
        except (User.DoesNotExist, PasswordResetOTP.DoesNotExist):
            return Response({"error": "Invalid email or OTP."}, status=400)

        otp_record.is_verified = True
        otp_record.save()

        return Response({"message": "OTP verified successfully."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny] 

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = request.query_params.get('email')
        if not email:
            return Response({"error": "Email is required."}, status=400)

        try:
            user = User.objects.get(email=email)
            otp_record = PasswordResetOTP.objects.filter(user=user, is_verified=True).latest('created_at')
        except (User.DoesNotExist, PasswordResetOTP.DoesNotExist):
            return Response({"error": "OTP not verified."}, status=400)

        user.set_password(serializer.validated_data['new_password'])
        user.save()
        otp_record.delete() 

        return Response({"message": "Password has been reset successfully."})



class UserInfoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        try:
            # Fetch the user by user_id
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound(detail="User not found")

        # Serialize the user data
        user_serializer = UserSerializer(user)
        return Response(user_serializer.data)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Return the authenticated user's profile with related restaurant data.
        """
        serializer = UserWithRestaurantSerializer(request.user)
        return Response(serializer.data)
