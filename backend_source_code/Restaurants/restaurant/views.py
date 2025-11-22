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
        serializer = OwnerRegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    


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