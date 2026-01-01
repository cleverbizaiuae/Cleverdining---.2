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

channel_layer = get_channel_layer()

class PaymentSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    # Fixed: Order uses 'device' not 'table'
    table_name = serializers.SerializerMethodField()
    table_id = serializers.SerializerMethodField()
    customer_name = serializers.CharField(default="Guest", read_only=True)
    
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
    
    class Meta:
        model = Payment
        fields = [
            'id', 'order_id', 'table_name', 'table_id', 'customer_name',
            'amount', 'provider', 'status', 'transaction_id',
            'created_at', 'updated_at', 'created_by',
            'confirmed_at', 'cancelled_at', 'cancel_reason'
        ]

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
import csv
from django.http import HttpResponse

class PaymentAdminViewSet(ModelViewSet):
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

    def get_queryset(self):
        user = self.request.user
        
        # Try multiple paths to find the owner's restaurant
        # 1. Direct Owner Check (most reliable)
        from restaurant.models import Restaurant
        owned_restaurants = Restaurant.objects.filter(owner=user)
        if owned_restaurants.exists():
            return Payment.objects.filter(restaurant__in=owned_restaurants).order_by('-created_at')
        
        # 2. Role-based check for staff
        if getattr(user, 'role', '') in ['manager', 'staff', 'chef']:
            from accounts.models import ChefStaff
            chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
            if chef_staff:
                return Payment.objects.filter(restaurant=chef_staff.restaurant).order_by('-created_at')
            
            # Fallback Legacy staff_profile
            if hasattr(user, 'staff_profile') and user.staff_profile:
                return Payment.objects.filter(restaurant=user.staff_profile.restaurant).order_by('-created_at')
        
        # 3. Last resort: check if user has any restaurant relationship
        if hasattr(user, 'restaurants') and user.restaurants.exists():
            return Payment.objects.filter(restaurant__in=user.restaurants.all()).order_by('-created_at')
                
        return Payment.objects.none()

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
        writer.writerow(['ID', 'Order ID', 'Table', 'Customer', 'Amount', 'Provider', 'Status', 'Transaction ID', 'Date', 'Confirmed At'])
        
        for payment in queryset:
            writer.writerow([
                payment.id,
                payment.order.id,
                payment.order.table.table_number if payment.order.table else "Online",
                payment.order.customer.name if payment.order.customer else "Guest",
                payment.amount,
                payment.provider,
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

