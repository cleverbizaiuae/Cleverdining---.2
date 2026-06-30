from django.contrib import admin
from .models import Payment, PaymentProviderEvent, StripeDetails

# Register Payment model
@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('device', 'restaurant', 'order', 'stripe_payment_intent_id', 'amount', 'status', 'created_at', 'updated_at')
    search_fields = ('device__id', 'restaurant__resturent_name', 'order__id', 'stripe_payment_intent_id')
    list_filter = ('status',)


@admin.register(PaymentProviderEvent)
class PaymentProviderEventAdmin(admin.ModelAdmin):
    list_display = (
        'provider',
        'gateway',
        'provider_event_id',
        'status',
        'replay_detected',
        'processed_at',
        'created_at',
    )
    search_fields = ('provider', 'provider_event_id', 'gateway__restaurant__resturent_name')
    list_filter = ('provider', 'status', 'replay_detected')



# Register StripeDetails model
@admin.register(StripeDetails)
class StripeDetailsAdmin(admin.ModelAdmin):
    list_display = ('restaurant', 'stripe_secret_key', 'stripe_publishable_key')
    search_fields = ('restaurant__resturent_name',)
