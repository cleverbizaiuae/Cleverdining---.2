from django.urls import path
from .views import CreateCheckoutSessionView, StripeWebhookView,StripePortalSessionView,SubscriptionStatusView,CancelSubscriptionView,RenewSubscriptionView

urlpatterns = [
    path('create-checkout-session/', CreateCheckoutSessionView.as_view(), name='create-checkout-session'),
    path('stripe-webhook/', StripeWebhookView.as_view(), name='stripe-webhook'),
    path('billing-portal/', StripePortalSessionView.as_view(), name='billing-portal'),
    path('subscription-status/', SubscriptionStatusView.as_view(), name='subscription-status'),
    path('cancel-subscription/', CancelSubscriptionView.as_view(), name='cancel-subscription'),
    path('renew-subscription/', RenewSubscriptionView.as_view(), name='renew-subscription'),
]
