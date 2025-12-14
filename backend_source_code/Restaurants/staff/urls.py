from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AdminLoginView
from item.views import StaffItemViewSet
from order.views import StaffOrdersAPIView, StaffUpdateOrderStatusAPIView
from device.views import DeviceViewSetall

router = DefaultRouter()
router.register('items', StaffItemViewSet, basename='staff-items')
router.register('devicesall', DeviceViewSetall, basename='deviceall')

urlpatterns = [
    path('', include(router.urls)),
    path('login/', AdminLoginView.as_view(), name='admin-login'),
    path('orders/', StaffOrdersAPIView.as_view(), name='staff-orders'),
    path('orders/status/<int:pk>/', StaffUpdateOrderStatusAPIView.as_view(), name='staff-update-order-status'),
]
