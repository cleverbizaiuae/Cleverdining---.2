from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegisterApiView,CustomTokenObtainPairView,LogoutApiView,SendOTPView, VerifyOTPView, ResetPasswordView,UserInfoAPIView
from device.views import CreateReservationAPIView

router = DefaultRouter()


urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterApiView.as_view(), name='register'),
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('logout/', LogoutApiView.as_view(), name='logout'),
    path('send-otp/', SendOTPView.as_view(), name='send-otp'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('reservations/create/', CreateReservationAPIView.as_view(), name='create-reservation'), 
    path('user-info/<int:user_id>/', UserInfoAPIView.as_view(), name='user-info') 
]



