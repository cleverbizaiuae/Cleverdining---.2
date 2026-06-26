from rest_framework import serializers
from subscription.models import Subscription
from restaurant.models import Restaurant
from .models import Integration


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ['id','package_name', 'status', 'is_active', 'current_period_end', 'cancel_at_period_end']


class RestaurantSerializer(serializers.ModelSerializer):
    subscriptions = SubscriptionSerializer(many=True, read_only=True)

    class Meta:
        model = Restaurant
        fields = [
            'id',
            'resturent_name',
            'location',
            'region',
            'currency',
            'timezone',
            'country_code',
            'default_payment_provider',
            'phone_number',
            'package',
            'image',
            'owner',
            'created_at',
            'updated_at',
            'subscriptions',
        ]


class IntegrationSerializer(serializers.ModelSerializer):
    providerKey = serializers.CharField(source='provider_key', required=False, allow_blank=True, allow_null=True)
    logoUrl = serializers.CharField(source='logo_url', required=False, allow_blank=True, allow_null=True)
    monthlyCost = serializers.DecimalField(source='monthly_cost', max_digits=10, decimal_places=2, required=False)
    connectionStatus = serializers.CharField(source='connection_status', required=False)
    apiHealth = serializers.CharField(source='api_health', required=False)
    documentationUrl = serializers.CharField(source='documentation_url', required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(source='notes', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            data = data.copy()
        for key in ["providerKey", "logoUrl", "notes", "environment", "documentationUrl"]:
            if data.get(key) is None:
                data[key] = ""
        if data.get("monthlyCost") in [None, ""]:
            data["monthlyCost"] = "0"
        return super().to_internal_value(data)

    class Meta:
        model = Integration
        fields = [
            'id',
            'providerKey',
            'name',
            'logoUrl',
            'category',
            'monthlyCost',
            'currency',
            'notes',
            'description',
            'status',
            'connectionStatus',
            'apiHealth',
            'environment',
            'documentationUrl',
            'createdAt',
            'updatedAt',
        ]
