from rest_framework import serializers
from .models import Order, OrderItem, Cart, CartItem
from item.models import Item
from .schema_guard import ensure_order_notes_column
from decimal import Decimal
from django.db.models import Sum

class OrderItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name')
    item_id = serializers.IntegerField(read_only=True)
    image = serializers.SerializerMethodField()
    
    class Meta:
        model = OrderItem
        fields = ['item_id', 'item_name', 'quantity', 'price', 'image']
    
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


class UpsellAcceptanceCreateSerializer(serializers.Serializer):
    item = serializers.IntegerField(min_value=1)
    trigger_point = serializers.ChoiceField(
        choices=("add_to_cart", "cart", "before_payment")
    )




class OrderCreateSerializerFixed(serializers.ModelSerializer):
    order_items = OrderItemCreateSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    special_request = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    upsell_session_id = serializers.CharField(required=False, allow_blank=True, max_length=120, write_only=True)
    upsell_acceptances = UpsellAcceptanceCreateSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Order
        fields = [
            'device',
            'restaurant',
            'order_items',
            'notes',
            'special_request',
            'upsell_session_id',
            'upsell_acceptances',
        ]
        extra_kwargs = {
            'device': {'read_only': True},
            'restaurant': {'read_only': True}
        }

    def create(self, validated_data):
        order_items_data = validated_data.pop('order_items')
        special_request = validated_data.pop('special_request', None)
        upsell_session_id = validated_data.pop('upsell_session_id', '')
        upsell_acceptances = validated_data.pop('upsell_acceptances', [])
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
        # These are request-only attribution fields, not Order model columns.
        # The API view reconciles them after the authoritative order lines and
        # prices have been persisted.
        order._upsell_session_id = upsell_session_id
        order._upsell_acceptances = upsell_acceptances
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
    currency = serializers.CharField(source='restaurant.currency', read_only=True)
    google_review_url = serializers.CharField(source='restaurant.google_review_url', read_only=True, allow_null=True)
    special_request = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    amountPaid = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()
    remainingAmount = serializers.SerializerMethodField()
    is_fully_paid = serializers.SerializerMethodField()
    isFullyPaid = serializers.SerializerMethodField()
    is_partially_paid = serializers.SerializerMethodField()
    isPartiallyPaid = serializers.SerializerMethodField()
    bill_payment_status = serializers.SerializerMethodField()
    payment_progress = serializers.SerializerMethodField()
    isWalkIn = serializers.BooleanField(source='is_walk_in', read_only=True)

    def get_special_request(self, obj):
        return obj.notes or ""

    def _money(self, value):
        return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))

    def _payment_snapshot(self, obj):
        cache_key = "_order_payment_snapshot"
        if hasattr(obj, cache_key):
            return getattr(obj, cache_key)

        total = Decimal(str(obj.total_price or 0)).quantize(Decimal("0.01"))
        paid = Decimal(str(getattr(obj, "amount_paid", 0) or 0)).quantize(Decimal("0.01"))
        bill_status = "fully_paid" if str(obj.payment_status or "").lower() == "paid" else "unpaid"

        try:
            bill = obj.bill
        except Exception:
            bill = None

        if bill is not None:
            paid = max(paid, Decimal(str(bill.paid_amount or 0)).quantize(Decimal("0.01")))
            bill_status = str(bill.payment_status or bill_status).lower()
        else:
            try:
                from payment.models import Payment
                paid = Payment.objects.filter(
                    order=obj,
                    status__in=["completed", "paid", "succeeded", "success"],
                ).aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
                paid = Decimal(str(paid)).quantize(Decimal("0.01"))
            except Exception:
                if str(obj.payment_status or "").lower() in {"paid", "completed", "succeeded", "success"}:
                    paid = total
                else:
                    paid = Decimal("0.00")

        if str(obj.payment_status or "").lower() in {"paid", "completed", "succeeded", "success"}:
            paid = max(paid, total)

        paid = min(max(paid, Decimal("0.00")), total)
        remaining = max(total - paid, Decimal("0.00")).quantize(Decimal("0.01"))
        is_fully_paid = remaining <= Decimal("0.001")
        is_partially_paid = paid > Decimal("0.001") and not is_fully_paid
        if is_fully_paid:
            bill_status = "fully_paid"
        elif is_partially_paid:
            bill_status = "partially_paid"

        snapshot = {
            "total": total,
            "paid": paid,
            "remaining": remaining,
            "is_fully_paid": is_fully_paid,
            "is_partially_paid": is_partially_paid,
            "bill_payment_status": bill_status,
            "payment_progress": float((paid / total) * 100) if total > 0 else 100.0,
        }
        setattr(obj, cache_key, snapshot)
        return snapshot

    def get_amount_paid(self, obj):
        return self._money(self._payment_snapshot(obj)["paid"])

    def get_amountPaid(self, obj):
        return self.get_amount_paid(obj)

    def get_remaining_amount(self, obj):
        return self._money(self._payment_snapshot(obj)["remaining"])

    def get_remainingAmount(self, obj):
        return self.get_remaining_amount(obj)

    def get_is_fully_paid(self, obj):
        return self._payment_snapshot(obj)["is_fully_paid"]

    def get_isFullyPaid(self, obj):
        return self.get_is_fully_paid(obj)

    def get_is_partially_paid(self, obj):
        return self._payment_snapshot(obj)["is_partially_paid"]

    def get_isPartiallyPaid(self, obj):
        return self.get_is_partially_paid(obj)

    def get_bill_payment_status(self, obj):
        return self._payment_snapshot(obj)["bill_payment_status"]

    def get_payment_progress(self, obj):
        return round(self._payment_snapshot(obj)["payment_progress"], 2)

    def get_payments(self, obj):
        try:
            # Views prefetch `payments`; use that cache instead of issuing one
            # Payment query per order during list serialization.
            payments_manager = getattr(obj, "payments", None)
            qs = payments_manager.all() if payments_manager is not None else []
            return PaymentSerializer(qs, many=True).data
        except Exception as exc:
            print(f"[ORDER-SERIALIZER] Failed loading payments for order {obj.id}: {exc}")
            return []

    class Meta:
        model = Order
        fields = ['id', 'order_items', 'status','payment_status','total_price', 'amount_paid', 'amountPaid', 'remaining_amount', 'remainingAmount', 'is_fully_paid', 'isFullyPaid', 'is_partially_paid', 'isPartiallyPaid', 'bill_payment_status', 'payment_progress', 'tip_amount', 'tip_type', 'notes', 'special_request', 'is_walk_in', 'isWalkIn', 'created_time', 'updated_time', 'device', 'restaurant','device_name', 'device_table_name', 'payments', 'restaurant_name', 'currency', 'google_review_url']

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
