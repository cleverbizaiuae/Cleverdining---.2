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
    logoUrl = serializers.CharField(source='logo_url', required=False, allow_blank=True)
    monthlyCost = serializers.DecimalField(source='monthly_cost', max_digits=10, decimal_places=2, required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = Integration
        fields = [
            'id',
            'name',
            'logoUrl',
            'category',
            'monthlyCost',
            'currency',
            'notes',
            'status',
            'createdAt',
            'updatedAt',
        ]
