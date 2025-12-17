from django.urls import path, include
from category.views import CustomerCategoryListView
from rest_framework.routers import DefaultRouter
from item.views import CustomerItemViewSet
from order.views import OrderCreateAPIView, OrderCancelAPIView,MyOrdersAPIView,MySingleOrderAPIView, CartViewSet
from review.views import CreateReviewAPIView
from payment.views import CreateCheckoutSessionView, CreateBulkCheckoutSessionView, PaymentSuccessView, PaymentCancelView, VerifyRazorpayPaymentView, VerifyPaymentView, PaymentWebhookView
from restaurant.views import PublicRestaurantListView
from device.views import PublicDeviceListView, PublicDeviceByUUIDView, ResolveTableView


router = DefaultRouter()
router.register('items',CustomerItemViewSet, basename='customer_items')
router.register('cart', CartViewSet, basename='cart')


urlpatterns = [
    path('', include(router.urls)),
    path('categories/', CustomerCategoryListView.as_view(), name='customer-categories'),
    path('restaurants/', PublicRestaurantListView.as_view(), name='public-restaurants'),
    path('devices/', PublicDeviceListView.as_view(), name='public-devices'),
    path('devices/<uuid:uuid>/', PublicDeviceByUUIDView.as_view(), name='public-device-by-uuid'),
    path('resolve-table/', ResolveTableView.as_view(), name='resolve-table'),
    path('orders/', OrderCreateAPIView.as_view(), name='order-create'),
    path('orders/<int:pk>/cancel/', OrderCancelAPIView.as_view(), name='order-cancel'),
    path('uncomplete/orders/', MyOrdersAPIView.as_view(), name='my-orders'),
    path('uncomplete/orders/<int:pk>/', MySingleOrderAPIView.as_view(), name='my-single-order'),
    path('reviews/create/', CreateReviewAPIView.as_view(), name='create-review'),
    path('payment/success/', PaymentSuccessView.as_view(), name='payment_success'),
    path('payment/cancel/', PaymentCancelView.as_view(), name='payment_cancel'),   
    path('payment/verify/', VerifyPaymentView.as_view(), name='verify_payment'),
    path('payment/webhook/<str:provider>/', PaymentWebhookView.as_view(), name='payment_webhook'),
    path('payment/verify-razorpay/', VerifyRazorpayPaymentView.as_view(), name='verify_razorpay'), # Keep for backward compat
    path('create-checkout-session/<int:order_id>/', CreateCheckoutSessionView.as_view(), name='create_checkout_session'),
    path('create-bulk-checkout-session/', CreateBulkCheckoutSessionView.as_view(), name='create_bulk_checkout_session'),
]