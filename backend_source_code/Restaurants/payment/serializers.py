from rest_framework import serializers
from .models import StripeDetails, PaymentGateway, Payment

class PaymentSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    table_name = serializers.CharField(source='device.table_name', read_only=True)
    
    class Meta:
        model = Payment
        fields = '__all__'

class StripeDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StripeDetails
        fields = ['id', 'stripe_secret_key', 'stripe_publishable_key']
        extra_kwargs = {
            'stripe_secret_key': {'write_only': True},
            'stripe_publishable_key': {'write_only': True}
        }

class PaymentGatewaySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentGateway
        fields = [
            'id', 'provider', 'is_active', 'key_id', 'key_secret', 'created_at',
            # Apple Pay fields
            'apple_pay_enabled', 'apple_merchant_id', 'apple_domain_verified',
            # Google Pay fields
            'google_pay_enabled', 'google_merchant_id', 'google_environment'
        ]
        extra_kwargs = {
            'key_secret': {'write_only': True},
        }
        read_only_fields = ['id', 'restaurant', 'apple_domain_verified']