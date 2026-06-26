from django.urls import path

from .views import Dialog360WebhookView

urlpatterns = [
    path('360dialog/webhook', Dialog360WebhookView.as_view(), name='360dialog-webhook'),
    path('360dialog/webhook/', Dialog360WebhookView.as_view(), name='360dialog-webhook-slash'),
]
