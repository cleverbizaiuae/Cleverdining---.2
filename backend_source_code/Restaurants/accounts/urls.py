from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterApiView,CustomTokenObtainPairView,LogoutApiView,SendOTPView, VerifyOTPView, ResetPasswordView,UserInfoAPIView,ProfileView,TestUserView,ChefStaffViewSet,HealthCheckView
from .simple_views import SimpleLoginView
from device.views import CreateReservationAPIView

router = DefaultRouter()
router.register(r'chefstaff', ChefStaffViewSet, basename='chefstaff')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', HealthCheckView.as_view(), name='health-check'),  # Health check endpoint
    path('register/', RegisterApiView.as_view(), name='register'),
    path('login/', SimpleLoginView.as_view(), name='login'),  # Bulletproof simple login
    path('login-old/', CustomTokenObtainPairView.as_view(), name='login-old'),  # Backup complex login
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),  # JWT token refresh
    path('logout/', LogoutApiView.as_view(), name='logout'),
    path('send-otp/', SendOTPView.as_view(), name='send-otp'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('reservations/create/', CreateReservationAPIView.as_view(), name='create-reservation'), 
    path('user-info/<int:user_id>/', UserInfoAPIView.as_view(), name='user-info'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('test-user/', TestUserView.as_view(), name='test-user'),  # Debug endpoint
]



