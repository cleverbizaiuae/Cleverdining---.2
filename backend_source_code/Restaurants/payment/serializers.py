from rest_framework import serializers
from .models import StripeDetails, PaymentGateway

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
        fields = ['id', 'provider', 'is_active', 'key_id', 'key_secret', 'created_at']
        extra_kwargs = {
            'key_secret': {'write_only': True},
        }
        read_only_fields = ['id', 'restaurant']