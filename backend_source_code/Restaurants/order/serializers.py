from rest_framework import serializers
from .models import Order, OrderItem, Cart, CartItem
from item.models import Item
from .schema_guard import ensure_order_notes_column

class OrderItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name')
    image = serializers.SerializerMethodField()
    
    class Meta:
        model = OrderItem
        fields = ['item_name', 'quantity', 'price', 'image']
    
    def get_image(self, obj):
        if obj.item and obj.item.image1:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.item.image1.url)
            # Fallback: return full URL using settings
            from django.conf import settings
            base_url = getattr(settings, 'SITE_URL', 'https://cleverdining-2.onrender.com')
            return f"{base_url}{obj.item.image1.url}"
        return None




class OrderItemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['item', 'quantity']




class OrderCreateSerializerFixed(serializers.ModelSerializer):
    order_items = OrderItemCreateSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    special_request = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)

    class Meta:
        model = Order
        fields = ['device', 'restaurant', 'order_items', 'notes', 'special_request']
        extra_kwargs = {
            'device': {'read_only': True},
            'restaurant': {'read_only': True}
        }

    def create(self, validated_data):
        order_items_data = validated_data.pop('order_items')
        special_request = validated_data.pop('special_request', None)
        notes = validated_data.get('notes')
        if (notes is None or notes == '') and special_request:
            validated_data['notes'] = special_request

        # Production safety: ensure legacy databases have `order_order.notes`
        # before model insert is attempted.
        ensure_order_notes_column()

        order = Order.objects.create(**validated_data)
        total = 0
        from rest_framework.exceptions import ValidationError

        for item_data in order_items_data:
            item = item_data['item']
            
            # STRICT AVAILABILITY CHECK
            if not item.availability:
                # Rollback - actually transaction.atomic is best, but here we just raise
                order.delete() 
                raise ValidationError(f"Item '{item.item_name}' is currently unavailable.")

            quantity = item_data['quantity']
            
            # DISCOUNT LOGIC
            final_price = item.price
            if item.discount_percentage > 0:
                discount_amount = (item.price * item.discount_percentage) / 100
                final_price = item.price - discount_amount
            
            OrderItem.objects.create(order=order, item=item, quantity=quantity, price=final_price)
            total += final_price * quantity
            
        order.total_price = total
        order.save()
        return order

    def update(self, instance, validated_data):
        # Manually update the instance to avoid DRF's "writable nested fields" error
        # which happens even if we pop the field when calling super().update()
        if 'order_items' in validated_data:
            validated_data.pop('order_items')
        special_request = validated_data.pop('special_request', None)
        if special_request and not validated_data.get('notes'):
            validated_data['notes'] = special_request
        
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
    device_table_name = serializers.CharField(source='device.table_name', read_only=True)
    payments = serializers.SerializerMethodField()
    restaurant_name = serializers.CharField(source='restaurant.resturent_name', read_only=True)
    google_review_url = serializers.CharField(source='restaurant.google_review_url', read_only=True, allow_null=True)
    special_request = serializers.SerializerMethodField()

    def get_special_request(self, obj):
        return obj.notes or ""

    def get_payments(self, obj):
        try:
            from payment.models import Payment
            from payment.schema_guard import ensure_payment_schema

            # Keep responses alive on partially-migrated deployments.
            ensure_payment_schema()
            qs = (
                Payment.objects.filter(order_id=obj.id)
                .only('id', 'provider', 'transaction_id', 'amount', 'status', 'created_at', 'order_id')
                .order_by('-created_at')
            )
            return PaymentSerializer(qs, many=True).data
        except Exception as exc:
            print(f"[ORDER-SERIALIZER] Failed loading payments for order {obj.id}: {exc}")
            return []

    class Meta:
        model = Order
        fields = ['id', 'order_items', 'status','payment_status','total_price', 'tip_amount', 'tip_type', 'notes', 'special_request', 'created_time', 'updated_time', 'device', 'restaurant','device_name', 'device_table_name', 'payments', 'restaurant_name', 'google_review_url']

class CartItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name', read_only=True)
    price = serializers.DecimalField(source='item.price', max_digits=10, decimal_places=2, read_only=True)
    discount_percentage = serializers.DecimalField(source='item.discount_percentage', max_digits=5, decimal_places=2, read_only=True)
    final_price = serializers.SerializerMethodField()
    image = serializers.ImageField(source='item.image1', read_only=True)

    class Meta:
        model = CartItem
        fields = ['id', 'item', 'item_name', 'quantity', 'price', 'discount_percentage', 'final_price', 'image']

    def get_final_price(self, obj):
        item = obj.item
        if item.discount_percentage > 0:
            discount_amount = (item.price * item.discount_percentage) / 100
            return round(item.price - discount_amount, 2)
        return item.price

class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'items', 'total_price']

    def get_total_price(self, obj):
        total = 0
        for cart_item in obj.items.all():
            item = cart_item.item
            price = item.price
            if item.discount_percentage > 0:
                price = price - (price * item.discount_percentage / 100)
            total += price * cart_item.quantity
        return round(total, 2)
