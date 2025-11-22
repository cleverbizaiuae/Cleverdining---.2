from django.urls import path, include
from rest_framework.routers import DefaultRouter
from device.views import CreateReservationAPIView
from restaurant.views import RestaurantFullDataAPIView
router = DefaultRouter()


urlpatterns = [
    path('reservations/create/', CreateReservationAPIView.as_view(), name='create-reservation'), 
    path('restaurants/full-data/<str:phone_number>/', RestaurantFullDataAPIView.as_view(), name='restaurant-full-data'),
]



