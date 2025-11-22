from rest_framework import serializers
from subscription.models import Subscription
from restaurant.models import Restaurant



class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ['id','package_name', 'status', 'is_active', 'current_period_end', 'cancel_at_period_end']




class RestaurantSerializer(serializers.ModelSerializer):
    subscriptions = SubscriptionSerializer(many=True, read_only=True)

    class Meta:
        model = Restaurant
        fields = ['id', 'resturent_name', 'location', 'phone_number', 'package', 'image', 'owner', 'created_at', 'updated_at', 'subscriptions']