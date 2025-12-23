from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AdminLoginView
from item.views import StaffItemViewSet
from order.views import ChefStaffOrdersAPIView, ChefStaffUpdateOrderStatusAPIView
from device.views import DeviceViewSetall, CloseTableSessionView, DeviceViewSet

router = DefaultRouter()
router.register('items', StaffItemViewSet, basename='staff-items')
router.register('devicesall', DeviceViewSetall, basename='deviceall')
router.register('devices', DeviceViewSet, basename='staff-devices')
# Expose Reservations for Staff
from device.views import ReservationViewSet
from category.views import SubCategoryViewSet, CategoryViewSet

router.register('reservations', ReservationViewSet, basename='staff-reservations')
router.register('sub-categories', SubCategoryViewSet, basename='staff-subcategories')
router.register('categories', CategoryViewSet, basename='staff-categories')

urlpatterns = [
    path('', include(router.urls)),
    path('login/', AdminLoginView.as_view(), name='admin-login'),
    path('orders/', ChefStaffOrdersAPIView.as_view(), name='staff-orders'),
    path('orders/status/<int:pk>/', ChefStaffUpdateOrderStatusAPIView.as_view(), name='staff-update-order-status'),
    path('sessions/<int:session_id>/close/', CloseTableSessionView.as_view(), name='staff-close-session'),
]
