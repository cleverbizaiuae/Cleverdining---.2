from rest_framework import serializers
from .models import Order, OrderItem
from item.models import Item

class OrderItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name')
    class Meta:
        model = OrderItem
        fields = ['item_name', 'quantity', 'price']




class OrderItemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['item', 'quantity']




class OrderCreateSerializer(serializers.ModelSerializer):
    order_items = OrderItemCreateSerializer(many=True)

    class Meta:
        model = Order
        fields = ['device', 'restaurant', 'order_items']

    def create(self, validated_data):
        order_items_data = validated_data.pop('order_items')
        order = Order.objects.create(**validated_data)
        total = 0
        for item_data in order_items_data:
            item = item_data['item']
            quantity = item_data['quantity']
            OrderItem.objects.create(order=order, item=item, quantity=quantity, price=item.price)
            total += item.price * quantity
        order.total_price = total
        order.save()
        return order



class OrderDetailSerializer(serializers.ModelSerializer):
    order_items = OrderItemSerializer(many=True, read_only=True)
    device_name = serializers.CharField(source='device.table_name')

    class Meta:
        model = Order
        fields = ['id', 'order_items', 'status','payment_status','total_price', 'created_time', 'updated_time', 'device', 'restaurant','device_name']
