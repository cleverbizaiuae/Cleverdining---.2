from django.urls import path, include
from rest_framework.routers import DefaultRouter
from restaurant.views import OwnerRegisterView
from accounts.simple_views import SimpleOwnerRegisterView
from category.views import CategoryViewSet, SubCategoryViewSet
from item.views import ItemViewSet,MostSellingItemsAPIView
from accounts.views import ChefStaffViewSet
from device.views import DeviceViewSet,ReservationViewSet
from order.views import OwnerRestaurantOrdersAPIView,OwnerUpdateOrderStatusAPIView,OrderAnalyticsAPIView,MonthlySalesReportView, ConfirmCashPaymentAPIView
from review.views import OwnerRestaurantReviewListAPIView
from device.views import DeviceViewSetall
from vapi.views import CreateAssistantView,UpdateAssistantNumber,GetRestaurantAssistanceView
from payment.views import StripeDetailsViewSet, PaymentGatewayViewSet
from payment.admin_views import PaymentAdminViewSet
from .views import GenerateImageView



router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('subcategories', SubCategoryViewSet, basename='subcategory')
router.register('items', ItemViewSet, basename='item')
router.register('chef-staff', ChefStaffViewSet, basename='chef-staff')
router.register('devices', DeviceViewSet, basename='device')
router.register('reservations', ReservationViewSet, basename='reservation')
router.register('devicesall', DeviceViewSetall, basename='deviceall')
router.register(r'stripe', StripeDetailsViewSet, basename='stripe-details')
router.register(r'payment-gateways', PaymentGatewayViewSet, basename='payment-gateways')
router.register('payments', PaymentAdminViewSet, basename='admin-payments')

urlpatterns = [
    path('', include(router.urls)),
    path('register/', SimpleOwnerRegisterView.as_view(), name='ownerRegister'),  # Bulletproof simple registration
    path('register-old/', OwnerRegisterView.as_view(), name='ownerRegister-old'),  # Backup complex registration
    path('registered-restaurants/', OwnerRegisterView.as_view(), name='registered-restaurants'), # New Admin Register Endpoint
    path('orders/', OwnerRestaurantOrdersAPIView.as_view(), name='owner-orders'),
    path('orders/status/<int:pk>/', OwnerUpdateOrderStatusAPIView.as_view(), name='update-order-status'),
    path('orders/confirm-cash/<int:pk>/', ConfirmCashPaymentAPIView.as_view(), name='confirm-order-cash'), # New Endpoint
    path('reviews/', OwnerRestaurantReviewListAPIView.as_view(), name='owner-reviews'),
    path('most-selling-items/', MostSellingItemsAPIView.as_view(), name='most-selling-items'),
    path('orders/analytics/', OrderAnalyticsAPIView.as_view(), name='owner-order-analytics'),
    path('create-assistant/', CreateAssistantView.as_view(), name='create_assistant'),
    path('update-assistant-number/', UpdateAssistantNumber.as_view(), name='update_assistant_number'),
    path('get-restaurant-assistance/', GetRestaurantAssistanceView.as_view(), name='get_restaurant_assistance'),
    path('sales-report/monthly/', MonthlySalesReportView.as_view(), name='monthly-sales-report'),
    path('generate-image/', GenerateImageView.as_view(), name='generate-image'),
]
