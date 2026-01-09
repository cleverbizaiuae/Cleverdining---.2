from rest_framework import serializers
from .models import Review

class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ['id', 'order', 'device', 'guest_no', 'name', 'rating', 'comment', 'created_time']
        read_only_fields = ['id', 'created_time','device']




class GetReviewSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    table_name = serializers.CharField(source='device.table_name', read_only=True)
    customer_name = serializers.CharField(source='name', read_only=True)
    created_at = serializers.DateTimeField(source='created_time', read_only=True)
    
    class Meta:
        model = Review
        fields = [
            'id', 'order_id', 'table_name',
            'guest_no', 'customer_name', 'rating', 'comment', 'created_at'
        ]