from rest_framework.viewsets import ModelViewSet
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .models import Payment
from .serializers import PaymentGatewaySerializer # We might need a PaymentSerializer
from rest_framework import serializers
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.models import Order
from .schema_guard import ensure_payment_schema

channel_layer = get_channel_layer()

class PaymentSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    # Fixed: Order uses 'device' not 'table'
    table_name = serializers.SerializerMethodField()
    table_id = serializers.SerializerMethodField()
    customer_name = serializers.CharField(default="Guest", read_only=True)
    bill_id = serializers.IntegerField(source='bill.id', read_only=True)
    bill_total_amount = serializers.DecimalField(source='bill.total_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_paid_amount = serializers.DecimalField(source='bill.paid_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_remaining_amount = serializers.DecimalField(source='bill.remaining_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_payment_status = serializers.CharField(source='bill.payment_status', read_only=True)
    split_method = serializers.CharField(source='bill.split_method', read_only=True)
    split_count = serializers.IntegerField(source='bill.split_count', read_only=True)
    per_person_amount = serializers.DecimalField(source='bill.per_person_amount', max_digits=12, decimal_places=2, read_only=True)
    allocation_details = serializers.SerializerMethodField()
    
    def get_table_name(self, obj):
        try:
            if obj.order and obj.order.device:
                return obj.order.device.table_name or obj.order.device.table_number or f"Table {obj.order.device.id}"
        except:
            pass
        return "Online"
    
    def get_table_id(self, obj):
        try:
            if obj.order and obj.order.device:
                return obj.order.device.id
        except:
            pass
        return None

    def get_allocation_details(self, obj):
        details = []
        for alloc in obj.allocations.select_related("bill_item").all().order_by("id"):
            details.append(
                {
                    "allocation_id": alloc.id,
                    "allocation_type": alloc.allocation_type,
                    "participant_id": alloc.participant_id,
                    "participant_status": alloc.participant_status,
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocated_quantity": str(alloc.allocated_quantity),
                    "item_id": alloc.bill_item_id,
                    "item_name": alloc.bill_item.item_name if alloc.bill_item else None,
                }
            )
        return details
    
    class Meta:
        model = Payment
        fields = [
            'id', 'order_id', 'table_name', 'table_id', 'customer_name',
            'amount', 'provider', 'status', 'transaction_id',
            'split_type', 'payer_id_or_name', 'bill_id', 'bill_total_amount',
            'bill_paid_amount', 'bill_remaining_amount', 'bill_payment_status',
            'split_method', 'split_count', 'per_person_amount', 'allocation_details',
            'created_at', 'updated_at', 'created_by',
            'confirmed_at', 'cancelled_at', 'cancel_reason'
        ]

from core.filter_backends import SchemaSafeDjangoFilterBackend as DjangoFilterBackend
from rest_framework.filters import OrderingFilter
import csv
from django.http import HttpResponse

class PaymentAdminViewSet(ModelViewSet):
    """
    CANONICAL FIX: Order-Aware Payments API
    
    This viewset merges:
    1. Real Payment records from the Payment table
    2. Synthetic/derived payment objects for PAID orders without Payment records
    
    This ensures the Payments tab reflects reality - all paid orders appear,
    even if no Payment record was created at payment time.
    """
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    queryset = Payment.objects.all()
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = {
        'created_at': ['gte', 'lte', 'date'],
        'status': ['exact'],
        'provider': ['exact'],
    }
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']

    def _get_user_restaurant_ids(self):
        """Get restaurant IDs the user has access to - BULLETPROOF."""
        try:
            user = self.request.user
            from restaurant.models import Restaurant
            
            # 1. Direct Owner Check
            owned_ids = list(Restaurant.objects.filter(owner=user).values_list('id', flat=True))
            if owned_ids:
                return owned_ids
            
            # 2. Staff/Manager check
            if getattr(user, 'role', '') in ['manager', 'staff', 'chef']:
                from accounts.models import ChefStaff
                chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                if chef_staff:
                    return [chef_staff.restaurant_id]
                if hasattr(user, 'staff_profile') and user.staff_profile:
                    return [user.staff_profile.restaurant_id]
            
            # 3. Fallback
            if hasattr(user, 'restaurants') and user.restaurants.exists():
                return list(user.restaurants.values_list('id', flat=True))
        except Exception as e:
            print(f"_get_user_restaurant_ids error: {e}")
        
        return []

    def get_queryset(self):
        """Return real Payment records for the user's restaurants."""
        try:
            ensure_payment_schema()
            rest_ids = self._get_user_restaurant_ids()
            if not rest_ids:
                return Payment.objects.none()
            # Optimized: Use select_related to avoid N+1 queries
            # EXCLUDE cancelled orders to keep Payments tab clean
            return Payment.objects.filter(
                restaurant_id__in=rest_ids
            ).exclude(
                order__status='cancelled'
            ).select_related(
                'order', 'order__device', 'restaurant'
            ).order_by('-created_at')
        except Exception as e:
            print(f"PaymentAdminViewSet.get_queryset error: {e}")
            return Payment.objects.none()

    def _get_orphaned_paid_orders(self, rest_ids):
        """
        Find PAID orders that have NO corresponding Payment record.
        These are the 'orphaned' orders that need synthetic payments.
        """
        try:
            ensure_payment_schema()
            from order.models import Order
            
            # Get order IDs that already have payments
            orders_with_payments = set(
                Payment.objects.filter(restaurant_id__in=rest_ids).values_list('order_id', flat=True)
            )
            
            # Find PAID orders without payments
            # CRITICAL: Limit to 500 most recent to prevent timeout on large datasets
            orphaned_orders = Order.objects.filter(
                restaurant_id__in=rest_ids,
                payment_status='paid'
            ).exclude(
                id__in=orders_with_payments
            ).exclude(
                status='cancelled' # Ensure cancelled orders don't appear
            ).select_related('device', 'restaurant').order_by('-updated_time')[:500]  # LIMIT 500
            
            return orphaned_orders
        except Exception as e:
            print(f"_get_orphaned_paid_orders error: {e}")
            return []

    def _create_synthetic_payment(self, order):
        """
        Generate a synthetic payment dict from an orphaned PAID order.
        This is NOT saved to the database - it's a read-only derived object.
        """
        try:
            try:
                bill = order.bill
            except Exception:
                bill = None

            table_name = "Online"
            table_id = None
            if order.device:
                table_name = order.device.table_name or order.device.table_number or f"Table {order.device.id}"
                table_id = order.device.id
            
            return {
                'id': f"derived_{order.id}",  # Synthetic ID to distinguish from real payments
                'order_id': order.id,
                'table_name': table_name,
                'table_id': table_id,
                'customer_name': "Guest",
                'amount': str(order.total_price),
                'provider': 'cash',
                'status': 'completed',
                'transaction_id': f"derived_order_{order.id}",
                'split_type': 'full_bill',
                'payer_id_or_name': '',
                'bill_id': getattr(bill, "id", None),
                'bill_total_amount': str(getattr(bill, "total_amount", order.total_price)),
                'bill_paid_amount': str(getattr(bill, "paid_amount", order.total_price)),
                'bill_remaining_amount': str(getattr(bill, "remaining_amount", 0)),
                'bill_payment_status': getattr(bill, "payment_status", "fully_paid"),
                'split_method': getattr(bill, "split_method", "full_bill"),
                'split_count': getattr(bill, "split_count", None),
                'per_person_amount': str(getattr(bill, "per_person_amount", 0)),
                'allocation_details': [],
                'created_at': order.created_time.isoformat() if order.created_time else None,
                'updated_at': order.updated_time.isoformat() if order.updated_time else None,
                'created_by': 'derived',
                'confirmed_at': order.updated_time.isoformat() if order.updated_time else None,
                'cancelled_at': None,
                'cancel_reason': None
            }
        except Exception as e:
            print(f"_create_synthetic_payment error: {e}")
            return None

    def list(self, request, *args, **kwargs):
        """
        CANONICAL FIX: Merge real payments with synthetic payments.
        BULLETPROOF: Returns empty data on any error.
        """
        try:
            rest_ids = self._get_user_restaurant_ids()
            
            if not rest_ids:
                return Response({
                    'count': 0,
                    'results': [],
                    'total_revenue': '0.00',
                    'received_amount': '0.00',
                    'pending_amount': '0.00'
                })
            
            # 1. Get real payments and serialize them
            real_payments = self.get_queryset()
            real_payment_data = PaymentSerializer(real_payments, many=True).data
            
            # 2. Get orphaned PAID orders and create synthetic payments
            orphaned_orders = self._get_orphaned_paid_orders(rest_ids)
            synthetic_payments = []
            for order in orphaned_orders:
                synthetic = self._create_synthetic_payment(order)
                if synthetic:
                    synthetic_payments.append(synthetic)
            
            # 3. Merge both lists
            all_payments = list(real_payment_data) + synthetic_payments
            
            # 4. Sort by confirmed_at descending (most recent first)
            def get_sort_key(p):
                confirmed = p.get('confirmed_at') or p.get('created_at') or ''
                return confirmed if confirmed else '1970-01-01'
            
            all_payments.sort(key=get_sort_key, reverse=True)
            
            # 5. Calculate revenue metrics
            total_revenue = sum(float(p.get('amount', 0) or 0) for p in all_payments)
            received_amount = sum(
                float(p.get('amount', 0) or 0) 
                for p in all_payments 
                if p.get('status') == 'completed'
            )
            pending_amount = sum(
                float(p.get('amount', 0) or 0) 
                for p in all_payments 
                if p.get('status') == 'pending'
            )
            
            # 6. Return merged response
            return Response({
                'count': len(all_payments),
                'results': all_payments,
                'total_revenue': f"{total_revenue:.2f}",
                'received_amount': f"{received_amount:.2f}",
                'pending_amount': f"{pending_amount:.2f}"
            })
        except Exception as e:
            print(f"PaymentAdminViewSet.list error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'count': 0,
                'results': [],
                'total_revenue': '0.00',
                'received_amount': '0.00',
                'pending_amount': '0.00',
                'error': str(e)
            })

    @action(detail=False, methods=['get'])
    def debug_payments(self, request):
        """Debug endpoint to see raw payment data and diagnose issues."""
        user = request.user
        
        from restaurant.models import Restaurant
        from order.models import Order
        
        # Get owned restaurants
        owned_restaurants = list(Restaurant.objects.filter(owner=user).values('id', 'title'))
        
        # Get ALL payments in the system (for debugging)
        total_payments = Payment.objects.count()
        
        # Get payments for this owner's restaurants
        if owned_restaurants:
            rest_ids = [r['id'] for r in owned_restaurants]
            user_payments = Payment.objects.filter(restaurant_id__in=rest_ids).count()
            sample_payments = list(Payment.objects.filter(restaurant_id__in=rest_ids)[:5].values(
                'id', 'order_id', 'amount', 'provider', 'status', 'created_at'
            ))
            
            # Check paid orders without payments
            paid_orders_without_payment = Order.objects.filter(
                restaurant_id__in=rest_ids,
                payment_status='paid'
            ).exclude(
                id__in=Payment.objects.filter(restaurant_id__in=rest_ids).values('order_id')
            ).count()
        else:
            user_payments = 0
            sample_payments = []
            paid_orders_without_payment = 0
        
        return Response({
            'user_role': getattr(user, 'role', 'unknown'),
            'owned_restaurants': owned_restaurants,
            'total_payments_in_system': total_payments,
            'payments_for_user': user_payments,
            'sample_payments': sample_payments,
            'paid_orders_without_payment_record': paid_orders_without_payment,
        })

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        # Apply filters to the queryset
        queryset = self.filter_queryset(self.get_queryset())
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="payments_{timezone.now().strftime("%Y%m%d")}.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Order ID', 'Table', 'Customer', 'Amount', 'Provider', 'Split Type', 'Payer', 'Bill Status', 'Payment Status', 'Transaction ID', 'Date', 'Confirmed At'])
        
        for payment in queryset:
            writer.writerow([
                payment.id,
                payment.order.id,
                payment.order.device.table_name if getattr(payment.order, "device", None) else "Online",
                "Guest",
                payment.amount,
                payment.provider,
                payment.split_type,
                payment.payer_id_or_name,
                payment.bill.payment_status if payment.bill else "",
                payment.status,
                payment.transaction_id,
                payment.created_at.strftime("%Y-%m-%d %H:%M"),
                payment.confirmed_at.strftime("%Y-%m-%d %H:%M") if payment.confirmed_at else ""
            ])
            
        return response

    @action(detail=True, methods=['post'])
    def confirm_cash(self, request, pk=None):
        payment = self.get_object()
        if payment.status != 'pending' and payment.status != 'initiated':
             return Response({'error': 'Payment is not pending'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Update Payment
        payment.status = 'completed'
        payment.confirmed_at = timezone.now()
        # payment.confirmed_by_staff = request.user.staff_profile # If staff
        payment.save()
        
        # Update Order
        order = payment.order
        order.status = 'paid'
        order.payment_status = 'paid'
        order.save()
        
        # Emit Event
        self._emit_update(payment, 'payment:cash_confirmed')
        
        return Response({'status': 'confirmed'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        payment = self.get_object()
        reason = request.data.get('reason', 'Cancelled by staff')
        
        payment.status = 'cancelled'
        payment.cancelled_at = timezone.now()
        payment.cancel_reason = reason
        payment.save()
        
        # Optionally revert order status?
        # order = payment.order
        # order.status = 'payment_failed' 
        # order.save()
        
        self._emit_update(payment, 'payment:cancelled')
        
        return Response({'status': 'cancelled'})

    def _emit_update(self, payment, event_type):
        from order.serializers import OrderDetailSerializer
        order_data = OrderDetailSerializer(payment.order).data
        
        payload = {
            "type": event_type,
            "payment": PaymentSerializer(payment).data,
            "order": order_data
        }
        
        # Notify Restaurant
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{payment.restaurant.id}",
            payload
        )

    @action(detail=False, methods=['post'])
    def backfill_payments(self, request):
        """
        Create Payment records for paid orders that don't have payment records.
        Limited to 50 orders per call to prevent timeouts.
        """
        import uuid
        from order.models import Order
        from restaurant.models import Restaurant
        
        user = request.user
        
        # Get user's restaurants - FAST query
        rest_ids = list(Restaurant.objects.filter(owner=user).values_list('id', flat=True))
        
        if not rest_ids:
            return Response({"error": "No restaurants found", "user_role": getattr(user, 'role', 'unknown')}, status=400)
        
        # Get existing payment order IDs in ONE query
        existing_payment_order_ids = set(
            Payment.objects.filter(restaurant_id__in=rest_ids).values_list('order_id', flat=True)
        )
        
        # Find paid orders WITHOUT payments - LIMIT 50 to prevent timeout
        paid_orders = Order.objects.filter(
            restaurant_id__in=rest_ids,
            payment_status='paid'
        ).exclude(
            id__in=existing_payment_order_ids
        ).select_related('device', 'restaurant')[:50]
        
        # Bulk create payments
        payments_to_create = []
        for order in paid_orders:
            payments_to_create.append(Payment(
                device=order.device,
                restaurant=order.restaurant,
                order=order,
                amount=order.total_price,
                provider='cash',
                status='completed',
                transaction_id=f"backfill_{order.id}_{uuid.uuid4().hex[:8]}",
                confirmed_at=order.updated_time,
                created_by='backfill'
            ))
        
        created_count = 0
        if payments_to_create:
            try:
                Payment.objects.bulk_create(payments_to_create, ignore_conflicts=True)
                created_count = len(payments_to_create)
            except Exception as e:
                return Response({"error": str(e)}, status=500)
        
        # Check how many more remain
        remaining = Order.objects.filter(
            restaurant_id__in=rest_ids,
            payment_status='paid'
        ).exclude(
            id__in=Payment.objects.filter(restaurant_id__in=rest_ids).values_list('order_id', flat=True)
        ).count()
        
        return Response({
            "message": f"Created {created_count} payments. {remaining} orders remaining.",
            "created": created_count,
            "remaining": remaining,
            "run_again": remaining > 0
        })
