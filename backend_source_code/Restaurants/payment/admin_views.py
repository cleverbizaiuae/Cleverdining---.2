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
    table_name = serializers.CharField(source='order.table.table_number', read_only=True, default="Online")
    table_id = serializers.IntegerField(source='order.table.id', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='order.customer.name', read_only=True, default="Guest")
    
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
        # Filter by user's restaurants
        # Assuming user is owner or staff
        if hasattr(user, 'restaurants'):
            return Payment.objects.filter(restaurant__in=user.restaurants.all())
        elif hasattr(user, 'staff_profile'):
             return Payment.objects.filter(restaurant=user.staff_profile.restaurant)
        return Payment.objects.none()

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
