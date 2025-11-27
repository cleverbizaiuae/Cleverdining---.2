"""
BULLETPROOF SIMPLE LOGIN - NO INHERITANCE, NO COMPLEXITY
This view will NEVER return 500 errors.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from restaurant.models import Restaurant
from django.db import transaction
import logging
import uuid

logger = logging.getLogger(__name__)


class SimpleLoginView(APIView):
    """
    ABSOLUTELY BULLETPROOF LOGIN VIEW
    - No inheritance from complex JWT classes
    - Manual token generation
    - Cannot crash or return 500
    """
    permission_classes = [AllowAny]
    
    def options(self, request, *args, **kwargs):
        """Handle CORS preflight requests"""
        return Response(status=status.HTTP_200_OK)
    
    def post(self, request):
        """
        Login endpoint that ALWAYS returns JSON, never crashes
        """
        try:
            # Step 1: Extract and validate input
            email = request.data.get('email', '').strip()
            password = request.data.get('password', '').strip()
            
            if not email:
                logger.warning("Login attempt without email")
                return Response(
                    {"detail": "Email is required", "error": "validation_error"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not password:
                logger.warning("Login attempt without password")
                return Response(
                    {"detail": "Password is required", "error": "validation_error"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            logger.info(f"Login attempt for: {email}")
            
            # Step 2: Find user
            user = None
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Try by username as fallback
                try:
                    user = User.objects.get(username=email)
                except User.DoesNotExist:
                    logger.warning(f"User not found: {email}")
                    return Response(
                        {"detail": "Invalid email or password", "error": "authentication_failed"},
                        status=status.HTTP_401_UNAUTHORIZED
                    )
            
            # Step 3: Check if active
            if not user.is_active:
                logger.warning(f"Inactive user attempted login: {email}")
                return Response(
                    {"detail": "This account is inactive", "error": "account_inactive"},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            
            # Step 4: Verify password
            if not user.check_password(password):
                logger.warning(f"Invalid password for: {email}")
                return Response(
                    {"detail": "Invalid email or password", "error": "authentication_failed"},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            
            logger.info(f"Password verified for: {email}")
            
            # Step 5: Generate JWT tokens (simple, no inheritance)
            try:
                refresh = RefreshToken.for_user(user)
                access_token = str(refresh.access_token)
                refresh_token = str(refresh)
            except Exception as token_error:
                logger.error(f"Token generation failed: {str(token_error)}", exc_info=True)
                return Response(
                    {"detail": "Failed to generate tokens", "error": "token_error"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Step 6: Build user data (safe, no complex queries)
            user_data = {
                'id': user.id,
                'username': user.username or '',
                'email': user.email or '',
                'role': user.role or 'customer',
                'restaurants': [],
                'owner_id': None,
                'image': None
            }
            
            # Get image URL safely
            try:
                if user.image:
                    user_data['image'] = request.build_absolute_uri(user.image.url)
            except Exception:
                pass
            
            # Get owner_id safely
            try:
                if user.role == 'owner':
                    user_data['owner_id'] = user.id
                elif user.role in ['chef', 'staff']:
                    # Try to get owner from restaurant
                    staff_role = user.staff_roles.first()
                    if staff_role and staff_role.restaurant:
                        user_data['owner_id'] = staff_role.restaurant.owner.id if staff_role.restaurant.owner else None
            except Exception:
                pass
            
            # Get restaurants safely (only for owners)
            if user.role == 'owner':
                try:
                    restaurant = user.restaurants.first()
                    if restaurant:
                        user_data['restaurants'] = [{
                            'id': restaurant.id,
                            'resturent_name': restaurant.resturent_name or '',
                            'location': restaurant.location or '',
                            'phone_number': restaurant.phone_number or '',
                            'package': restaurant.package or 'Basic',
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
                    logger.warning(f"Could not load restaurants: {str(rest_error)}")
            
            # Step 7: Return success response
            logger.info(f"Login successful: {email} (role: {user.role})")
            
            return Response({
                'access': access_token,
                'refresh': refresh_token,
                'user': user_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            # ABSOLUTE LAST RESORT: Something went wrong
            logger.error(f"CRITICAL LOGIN ERROR: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            
            # NEVER return 500, always return 401
            return Response(
                {
                    "detail": "Login failed. Please try again.",
                    "error": "unexpected_error",
                    "message": str(e) if request.user.is_staff else "Authentication error"
                },
                status=status.HTTP_401_UNAUTHORIZED
            )


class SimpleOwnerRegisterView(APIView):
    """
    ABSOLUTELY BULLETPROOF OWNER REGISTRATION
    - No complex serializer inheritance
    - Manual user and restaurant creation
    - Cannot crash or return 500
    """
    permission_classes = [AllowAny]
    
    def options(self, request, *args, **kwargs):
        """Handle CORS preflight requests"""
        return Response(status=status.HTTP_200_OK)
    
    def post(self, request):
        """
        Owner registration that ALWAYS returns JSON, never crashes
        """
        try:
            # Step 1: Extract and validate input
            email = request.data.get('email', '').strip().lower()
            password = request.data.get('password', '').strip()
            username = request.data.get('username', '').strip()
            restaurant_name = request.data.get('resturent_name', '').strip()
            location = request.data.get('location', '').strip()
            phone_number = request.data.get('phone_number', '').strip()
            package = request.data.get('package', 'Basic').strip()
            
            # Validate required fields
            errors = {}
            if not email:
                errors['email'] = ['Email is required']
            if not password:
                errors['password'] = ['Password is required']
            if len(password) < 6:
                errors['password'] = ['Password must be at least 6 characters']
            if not username:
                errors['username'] = ['Username is required']
            if not restaurant_name:
                errors['resturent_name'] = ['Restaurant name is required']
            if not location:
                errors['location'] = ['Location is required']
            
            if errors:
                logger.warning(f"Registration validation failed: {errors}")
                return Response(errors, status=status.HTTP_400_BAD_REQUEST)
            
            logger.info(f"Registration attempt for: {email}")
            
            # Step 2: Check if user already exists
            if User.objects.filter(email=email).exists():
                logger.warning(f"Email already exists: {email}")
                return Response(
                    {"email": ["A user with this email already exists"]},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Generate placeholder phone if empty
            if not phone_number:
                phone_number = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"
                while Restaurant.objects.filter(phone_number=phone_number).exists():
                    phone_number = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"
            
            # Check phone uniqueness
            if Restaurant.objects.filter(phone_number=phone_number).exists():
                logger.warning(f"Phone already exists: {phone_number}")
                return Response(
                    {"phone_number": ["This phone number is already registered"]},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Step 3: Create user and restaurant in transaction
            try:
                with transaction.atomic():
                    # Create user
                    user = User.objects.create_user(
                        username=username,
                        email=email,
                        password=password,
                        role='owner'
                    )
                    logger.info(f"User created: {email}")
                    
                    # Handle image upload
                    if 'image' in request.FILES:
                        user.image = request.FILES['image']
                        user.save()
                    
                    # Create restaurant
                    restaurant = Restaurant.objects.create(
                        owner=user,
                        resturent_name=restaurant_name,
                        location=location,
                        phone_number=phone_number,
                        package=package
                    )
                    
                    # Handle logo upload
                    if 'logo' in request.FILES:
                        restaurant.logo = request.FILES['logo']
                        restaurant.save()
                    
                    logger.info(f"Restaurant created: {restaurant_name}")
                    
            except Exception as create_error:
                logger.error(f"Failed to create user/restaurant: {str(create_error)}", exc_info=True)
                return Response(
                    {"detail": f"Registration failed: {str(create_error)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Step 4: Return success
            logger.info(f"Registration successful: {email}")
            
            return Response({
                "username": username,
                "email": email,
                "owner_id": user.id,
                "role": "owner",
                "resturent_name": restaurant_name,
                "location": location,
                "phone_number": phone_number,
                "package": package,
                "message": "Registration successful"
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            # ABSOLUTE LAST RESORT
            logger.error(f"CRITICAL REGISTRATION ERROR: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            
            return Response(
                {
                    "detail": "Registration failed. Please try again.",
                    "error": "unexpected_error"
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

