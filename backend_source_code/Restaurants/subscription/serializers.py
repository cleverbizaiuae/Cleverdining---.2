from rest_framework import serializers
from .models import Subscription


class SubscriptionStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ['status']