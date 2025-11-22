from rest_framework import serializers
from .models import StripeDetails

class StripeDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StripeDetails
        fields = ['id', 'restaurant', 'stripe_secret_key', 'stripe_publishable_key']
        read_only_fields = ['id', 'restaurant']