from django.urls import path, include
from rest_framework.routers import DefaultRouter
from item.views import StaffItemViewSet
from order.views import ChefStaffOrdersAPIView, ChefStaffUpdateOrderStatusAPIView
from device.views import ReservationViewSet,DeviceViewSetall
from category.views import ChefOrStaffRestaurantCategoriesView

router = DefaultRouter()
router.register('items', StaffItemViewSet, basename='staff-items')
router.register('reservations', ReservationViewSet, basename='reservation')
router.register('devicesall', DeviceViewSetall, basename='deviceall')

urlpatterns = [
    path('', include(router.urls)),
    path('orders/', ChefStaffOrdersAPIView.as_view(), name='staff-orders'),
    path('orders/status/<int:pk>/', ChefStaffUpdateOrderStatusAPIView.as_view(), name='staff-update-order-status'),
    path('categories/', ChefOrStaffRestaurantCategoriesView.as_view(), name='my_categories'),
]
