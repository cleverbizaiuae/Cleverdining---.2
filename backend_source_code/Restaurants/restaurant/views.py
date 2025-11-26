from django.shortcuts import render
from restaurant.serializers import OwnerRegisterSerializer,RestaurantSerializer
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
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
    
    def post(self, request):
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info(f"Registration attempt - Data keys: {list(request.data.keys())}")
            serializer = OwnerRegisterSerializer(data=request.data)
            
            if serializer.is_valid():
                try:
                    user = serializer.save()
                    # Try to get serialized data, but handle errors gracefully
                    try:
                        response_data = serializer.data
                    except Exception as repr_error:
                        logger.error(f"Error serializing response: {str(repr_error)}", exc_info=True)
                        # Return basic success response if serialization fails
                        response_data = {
                            "username": user.username,
                            "email": user.email,
                            "owner_id": user.id,
                            "role": user.role,
                            "message": "Registration successful"
                        }
                    return Response(response_data, status=status.HTTP_201_CREATED)
                except serializers.ValidationError as val_error:
                    # Re-raise validation errors to return 400
                    return Response(val_error.detail, status=status.HTTP_400_BAD_REQUEST)
                except Exception as save_error:
                    logger.error(f"Error saving registration: {str(save_error)}", exc_info=True)
                    return Response(
                        {
                            "error": "Registration failed",
                            "detail": str(save_error),
                            "message": "Failed to create user or restaurant. Please try again."
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
            else:
                logger.warning(f"Validation errors: {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Registration error: {str(e)}", exc_info=True)
            return Response(
                {
                    "error": "Registration failed",
                    "detail": str(e),
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