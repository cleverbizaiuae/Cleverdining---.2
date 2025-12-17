from django.urls import path, include
from rest_framework.routers import DefaultRouter
from item.views import ChefItemViewSet
from order.views import ChefStaffOrdersAPIView, ChefStaffUpdateOrderStatusAPIView
from category.views import ChefOrStaffRestaurantCategoriesView
from device.views import DeviceViewSetall, DeviceViewSet

router = DefaultRouter()
router.register('items', ChefItemViewSet, basename='chef-items')
router.register('devices', DeviceViewSet, basename='chef-devices')
router.register('devicesall', DeviceViewSetall, basename='deviceall')
# Expose Reservations for Chef
from device.views import ReservationViewSet
router.register('reservations', ReservationViewSet, basename='chef-reservations')

urlpatterns = [
    path('', include(router.urls)),
    path('orders/', ChefStaffOrdersAPIView.as_view(), name='chef-orders'),
    path('orders/status/<int:pk>/', ChefStaffUpdateOrderStatusAPIView.as_view(), name='chef-update-order-status'),
    path('categories/', ChefOrStaffRestaurantCategoriesView.as_view(), name='my_categories'),
]