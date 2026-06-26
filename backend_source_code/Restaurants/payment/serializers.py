from rest_framework import serializers
from .models import StripeDetails, PaymentGateway, Payment

class PaymentSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    table_name = serializers.CharField(source='device.table_name', read_only=True)
    bill_id = serializers.IntegerField(source='bill.id', read_only=True)
    bill_total_amount = serializers.DecimalField(source='bill.total_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_paid_amount = serializers.DecimalField(source='bill.paid_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_remaining_amount = serializers.DecimalField(source='bill.remaining_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_payment_status = serializers.CharField(source='bill.payment_status', read_only=True)
    allocations = serializers.SerializerMethodField()

    def get_allocations(self, obj):
        payload = []
        for alloc in obj.allocations.select_related("bill_item").all().order_by("id"):
            payload.append({
                "id": alloc.id,
                "allocation_type": alloc.allocation_type,
                "participant_id": alloc.participant_id,
                "participant_status": alloc.participant_status,
                "allocated_amount": str(alloc.allocated_amount),
                "allocated_quantity": str(alloc.allocated_quantity),
                "bill_item_id": alloc.bill_item_id,
                "bill_item_name": alloc.bill_item.item_name if alloc.bill_item else None,
            })
        return payload
    
    class Meta:
        model = Payment
        fields = [
            'id', 'order', 'device', 'amount', 'provider', 'status', 'transaction_id',
            'split_type', 'payer_id_or_name', 'bill_id', 'bill_total_amount', 'bill_paid_amount',
            'bill_remaining_amount', 'bill_payment_status', 'allocations',
            'created_at', 'order_id', 'table_name'
        ]

class StripeDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StripeDetails
        fields = ['id', 'stripe_secret_key', 'stripe_publishable_key']
        extra_kwargs = {
            'stripe_secret_key': {'write_only': True},
            'stripe_publishable_key': {'write_only': True}
        }

class PaymentGatewaySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentGateway
        fields = [
            'id', 'provider', 'is_active', 'key_id', 'key_secret',
            'apple_pay_enabled', 'apple_merchant_id', 'apple_domain_verified',
            'google_pay_enabled', 'google_merchant_id', 'google_environment',
            'created_at'
        ]
        extra_kwargs = {
            'key_secret': {'write_only': True},
        }
        read_only_fields = ['id', 'restaurant', 'apple_domain_verified']
