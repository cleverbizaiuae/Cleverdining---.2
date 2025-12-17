from rest_framework import serializers
from .models import Order, OrderItem, Cart, CartItem
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




class OrderCreateSerializerFixed(serializers.ModelSerializer):
    order_items = OrderItemCreateSerializer(many=True)

    class Meta:
        model = Order
        fields = ['device', 'restaurant', 'order_items']
        extra_kwargs = {
            'device': {'read_only': True},
            'restaurant': {'read_only': True}
        }

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

    def update(self, instance, validated_data):
        # Manually update the instance to avoid DRF's "writable nested fields" error
        # which happens even if we pop the field when calling super().update()
        if 'order_items' in validated_data:
            validated_data.pop('order_items')
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance



class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        from payment.models import Payment
        model = Payment
        fields = ['id', 'provider', 'transaction_id', 'amount', 'status', 'created_at']

class OrderDetailSerializer(serializers.ModelSerializer):
    order_items = OrderItemSerializer(many=True, read_only=True)
    device_name = serializers.CharField(source='device.table_name')
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'order_items', 'status','payment_status','total_price', 'tip_amount', 'tip_type', 'created_time', 'updated_time', 'device', 'restaurant','device_name', 'payments']
class CartItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name', read_only=True)
    price = serializers.DecimalField(source='item.price', max_digits=10, decimal_places=2, read_only=True)
    image = serializers.ImageField(source='item.image', read_only=True)

    class Meta:
        model = CartItem
        fields = ['id', 'item', 'item_name', 'quantity', 'price', 'image']

class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'items', 'total_price']

    def get_total_price(self, obj):
        return sum(item.quantity * item.item.price for item in obj.items.all())
