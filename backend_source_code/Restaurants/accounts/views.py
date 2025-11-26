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
from rest_framework.exceptions import PermissionDenied
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
        token = super().get_token(user)
        user_data = UserWithRestaurantSerializer(user).data

        # Default values
        first_restaurant_id = None
        first_device_id = None
        first_restaurant_package = None
        first_restaurant_status = None
        first_restaurant_period_end = None

        # Get first restaurant info and its subscription
        for r in user_data['restaurants']:
            if first_restaurant_id is None:
                first_restaurant_id = r['id']
                subscription = r.get('subscription', {})
                first_restaurant_package = subscription.get('package_name')
                first_restaurant_status = subscription.get('status')
                first_restaurant_period_end = subscription.get('current_period_end')

            if r.get('device_id') is not None and first_device_id is None:
                first_device_id = r['device_id']

        owner_id = get_restaurant_owner_id(user)

        token['user'] = {
            'id': user_data['id'],
            'username': user_data['username'],
            'email': user_data['email'],
            'role': user_data['role'],
            'restaurants_id': first_restaurant_id,
            'device_id': first_device_id,
            'subscription': {
                'package_name': first_restaurant_package,
                'status': first_restaurant_status,
                'current_period_end': str(first_restaurant_period_end) if first_restaurant_period_end else None,
            },
            'owner_id': owner_id
        }

        return token

    def validate(self, attrs):
        try:
            data = super().validate(attrs)
            user = self.user
            user_data = UserWithRestaurantSerializer(user).data
            data['user'] = user_data
            return data
        except Exception as e:
            logger.error(f"Error in CustomTokenObtainPairSerializer.validate: {str(e)}", exc_info=True)
            # Re-raise to maintain original error behavior
            raise




class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer




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
