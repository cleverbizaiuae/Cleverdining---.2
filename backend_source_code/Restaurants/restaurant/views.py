from django.shortcuts import render
from restaurant.serializers import OwnerRegisterSerializer,RestaurantSerializer
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework import serializers
from .models import Restaurant
from device.models import Device
from category.models import Category
from item.models import Item
from django.db.models import Prefetch
# Create your views here.

# jwt
from rest_framework.permissions import AllowAny

class OwnerRegisterView(APIView):
    permission_classes = [AllowAny]
    
    def dispatch(self, request, *args, **kwargs):
        """Override dispatch to catch ALL exceptions"""
        try:
            return super().dispatch(request, *args, **kwargs)
        except Exception as e:
            import logging
            import traceback
            logger = logging.getLogger(__name__)
            logger.error(f"Unhandled exception in dispatch: {str(e)}", exc_info=True)
            logger.error(f"Traceback: {traceback.format_exc()}")
            return Response(
                {
                    "error": "Registration failed",
                    "detail": str(e),
                    "message": "An unexpected error occurred. Please try again."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def post(self, request):
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        
        # ABSOLUTE SAFETY: Wrap everything in try-except
        try:
            # Safely get request data
            try:
                request_data = request.data
            except Exception as data_error:
                logger.error(f"Error accessing request.data: {str(data_error)}", exc_info=True)
                return Response(
                    {
                        "error": "Invalid request format",
                        "detail": "Could not parse request data",
                        "message": "Please check your request and try again."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Log incoming request
            try:
                if hasattr(request_data, 'keys'):
                    data_keys = list(request_data.keys())
                    logger.info(f"Registration attempt - Data keys: {data_keys}")
                    # Log actual values (excluding password)
                    for key in data_keys:
                        if key != 'password':
                            try:
                                logger.info(f"  {key}: {request_data.get(key, 'N/A')}")
                            except:
                                pass
                else:
                    logger.info(f"Registration attempt - request.data type: {type(request_data)}")
            except Exception as log_error:
                logger.error(f"Error logging request: {str(log_error)}")
            
            # Check if data is empty
            try:
                if not request_data:
                    logger.error("Registration attempt with empty data")
                    return Response(
                        {
                            "error": "No data provided",
                            "message": "Please fill in all required fields."
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as check_error:
                logger.error(f"Error checking request data: {str(check_error)}")
                # Continue anyway, let serializer handle it
            
            # Create serializer
            try:
                serializer = OwnerRegisterSerializer(data=request_data)
            except Exception as ser_error:
                logger.error(f"Error creating serializer: {str(ser_error)}", exc_info=True)
                logger.error(f"Traceback: {traceback.format_exc()}")
                return Response(
                    {
                        "error": "Invalid request data",
                        "detail": str(ser_error),
                        "message": "Please check your input and try again."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate
            if not serializer.is_valid():
                logger.warning(f"Validation errors: {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
            # Save
            try:
                user = serializer.save()
                logger.info(f"User created successfully: {user.email}")
            except serializers.ValidationError as val_error:
                logger.warning(f"Validation error during save: {val_error.detail}")
                return Response(val_error.detail, status=status.HTTP_400_BAD_REQUEST)
            except Exception as save_error:
                logger.error(f"Error saving registration: {str(save_error)}", exc_info=True)
                logger.error(f"Traceback: {traceback.format_exc()}")
                return Response(
                    {
                        "error": "Registration failed",
                        "detail": str(save_error),
                        "message": "Failed to create user or restaurant. Please try again."
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Get response data - always succeed
            try:
                response_data = serializer.data
            except Exception as repr_error:
                logger.error(f"Error serializing response: {str(repr_error)}", exc_info=True)
                # Return basic success response
                response_data = {
                    "username": user.username,
                    "email": user.email,
                    "owner_id": user.id,
                    "role": user.role,
                    "message": "Registration successful"
                }
            
            logger.info(f"Registration successful for {user.email}")
            return Response(response_data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Unexpected registration error: {str(e)}", exc_info=True)
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Always return JSON, never let HTML error pages through
            try:
                error_detail = str(e)
            except:
                error_detail = "Unknown error"
            
            return Response(
                {
                    "error": "Registration failed",
                    "detail": error_detail,
                    "message": "An unexpected error occurred. Please try again."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    


class RestaurantFullDataAPIView(APIView):
    permission_classes = [AllowAny]
    def get(self, request, phone_number):
        try:
            restaurant = Restaurant.objects.prefetch_related(
                Prefetch('devices', queryset=Device.objects.all().prefetch_related('reservations')),
                Prefetch('categories', queryset=Category.objects.all().prefetch_related('items')),
                Prefetch('items')  
            ).get(phone_number=phone_number)

            print(phone_number)
            # caller_number = request.data.get('caller_id')
            # print(caller_number)

            data = {
                "restaurant": {
                    "name": restaurant.resturent_name,
                    "location": restaurant.location,
                    "phone": restaurant.phone_number,
                    "package": restaurant.package,
                    "devices": [
                        {
                            "id": device.id,
                            "table_name": device.table_name,
                            "action": device.action
                        } for device in restaurant.devices.all()
                    ],
                    "reservations": [
                        {
                            "customer_name": r.customer_name,
                            "guest_no": r.guest_no,
                            "cell_number": r.cell_number,
                            "email": r.email,
                            "time": r.reservation_time.isoformat(),
                            "status": r.status,
                            "device_id": r.device.id,
                        } for device in restaurant.devices.all()
                        for r in device.reservations.all()
                    ],
                    "item_categories": [
                        {
                            "category": cat.Category_name,
                            "slug": cat.slug,
                            "items": [
                                {
                                    "name": item.item_name,
                                    "price": str(item.price),
                                    "availability": item.availability,
                                    "description": item.description
                                }
                                for item in cat.items.all()
                            ]
                        } for cat in restaurant.categories.all()
                    ]
                }
            }

            return Response(data)

        except Restaurant.DoesNotExist:
            return Response({"error": "Restaurant not found"}, status=404)