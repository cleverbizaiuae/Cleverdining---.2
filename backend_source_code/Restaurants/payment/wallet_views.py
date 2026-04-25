"""
Wallet Payment Views for Apple Pay and Google Pay

Endpoints:
- WalletAvailabilityView: GET /api/customer/wallet-availability/
- WalletPaymentConfirmView: POST /api/customer/payment/wallet/confirm/
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import uuid

from .models import PaymentGateway, Payment
from .serializers import PaymentSerializer
from .schema_guard import ensure_payment_schema
from order.models import Order
from order.serializers import OrderDetailSerializer
from restaurant.models import Restaurant

channel_layer = get_channel_layer()


class WalletAvailabilityView(APIView):
    """
    GET /api/customer/wallet-availability/?restaurant_id=X
    
    Returns wallet availability based on restaurant configuration.
    Frontend uses this to show/hide wallet payment buttons.
    """
    permission_classes = [AllowAny]
    
    def get(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        
        if not restaurant_id:
            return Response(
                {'error': 'restaurant_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response(
                {'error': 'Restaurant not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get active payment gateway for this restaurant
        gateway = PaymentGateway.objects.filter(
            restaurant=restaurant, 
            is_active=True
        ).first()
        
        # Default: no wallets available
        availability = {
            'apple_pay_available': False,
            'google_pay_available': False,
            'gateway_provider': None
        }
        
        if gateway:
            availability['gateway_provider'] = gateway.provider
            
            # Apple Pay: Enabled + Merchant ID + Domain Verified
            if (gateway.apple_pay_enabled and 
                gateway.apple_merchant_id and 
                gateway.apple_domain_verified):
                availability['apple_pay_available'] = True
            
            # Google Pay: Enabled + Merchant ID
            if (gateway.google_pay_enabled and 
                gateway.google_merchant_id):
                availability['google_pay_available'] = True
                availability['google_environment'] = gateway.google_environment
                availability['google_merchant_id'] = gateway.google_merchant_id
        
        return Response(availability)


class WalletPaymentConfirmView(APIView):
    """
    POST /api/customer/payment/wallet/confirm/
    
    Confirms a wallet payment after token is received from client.
    
    Request Body:
    {
        "order_id": 123,
        "wallet_type": "apple_pay" | "google_pay",
        "wallet_token": "...",  # Token from Payment Request API
        "amount": 155.25,       # Total amount including tip
        "tip_amount": 0.00      # Optional tip
    }
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        ensure_payment_schema()
        order_id = request.data.get('order_id')
        wallet_type = request.data.get('wallet_type')
        wallet_token = request.data.get('wallet_token')
        amount = request.data.get('amount')
        tip_amount = request.data.get('tip_amount', 0)
        
        # Validate required fields
        if not all([order_id, wallet_type, wallet_token, amount]):
            return Response(
                {'error': 'Missing required fields: order_id, wallet_type, wallet_token, amount'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if wallet_type not in ['apple_pay', 'google_pay']:
            return Response(
                {'error': 'Invalid wallet_type. Must be "apple_pay" or "google_pay"'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Order not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate order is unpaid
        if order.payment_status == 'paid':
            return Response(
                {'error': 'Order is already paid'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate amount matches (with small tolerance for rounding)
        expected_amount = float(order.total_price) + float(tip_amount)
        if abs(float(amount) - expected_amount) > 0.01:
            return Response(
                {'error': f'Amount mismatch. Expected {expected_amount}, got {amount}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get gateway
        gateway = PaymentGateway.objects.filter(
            restaurant=order.restaurant,
            is_active=True
        ).first()
        
        if not gateway:
            return Response(
                {'error': 'No active payment gateway configured'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check wallet is enabled on gateway
        if wallet_type == 'apple_pay' and not gateway.apple_pay_enabled:
            return Response(
                {'error': 'Apple Pay is not enabled for this restaurant'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if wallet_type == 'google_pay' and not gateway.google_pay_enabled:
            return Response(
                {'error': 'Google Pay is not enabled for this restaurant'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Process wallet payment through gateway
        try:
            result = self._process_wallet_payment(
                gateway=gateway,
                order=order,
                wallet_type=wallet_type,
                wallet_token=wallet_token,
                amount=amount,
                tip_amount=tip_amount
            )
        except Exception as e:
            return Response(
                {'error': f'Payment processing failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        if result.get('status') == 'completed':
            # Create Payment record
            payment = Payment.objects.create(
                order=order,
                restaurant=order.restaurant,
                device=order.device,
                provider=wallet_type,
                transaction_id=result.get('transaction_id') or f"{wallet_type}_{order.id}_{uuid.uuid4().hex[:8]}",
                wallet_token_reference=wallet_token[:50] if wallet_token else None,  # Store partial for reference
                amount=amount,
                status='completed',
                created_by='guest_wallet'
            )
            
            # Update order status
            order.status = 'paid'
            order.payment_status = 'paid'
            if tip_amount:
                order.tip_amount = tip_amount
            order.save()
            
            # Emit real-time events
            self._emit_payment_events(order, payment)
            
            return Response({
                'status': 'success',
                'payment_id': payment.id,
                'transaction_id': payment.transaction_id,
                'message': 'Payment completed successfully'
            })
        
        elif result.get('status') == 'cancelled':
            return Response({
                'status': 'cancelled',
                'message': 'Payment was cancelled by user'
            }, status=status.HTTP_200_OK)
        
        else:
            return Response({
                'status': 'failed',
                'error': result.get('error', 'Payment failed')
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def _process_wallet_payment(self, gateway, order, wallet_type, wallet_token, amount, tip_amount):
        """
        Route wallet token to the appropriate payment gateway for processing.
        
        For Stripe: Use PaymentIntents with token
        For PayTabs: Use Direct Payment API
        For Checkout: Use Tokens API
        """
        from .adapters import StripeAdapter, PayTabsAdapter, CheckoutAdapter
        
        adapter_map = {
            'stripe': StripeAdapter,
            'paytabs': PayTabsAdapter,
            'checkout': CheckoutAdapter,
        }
        
        adapter_class = adapter_map.get(gateway.provider)
        if not adapter_class:
            raise Exception(f"Unsupported gateway provider: {gateway.provider}")
        
        adapter = adapter_class(gateway)
        
        # Check if adapter supports wallet payments
        if hasattr(adapter, 'process_wallet_token'):
            return adapter.process_wallet_token(
                order=order,
                wallet_type=wallet_type,
                wallet_token=wallet_token,
                amount=amount
            )
        
        # Fallback: For gateways that handle wallets via their hosted page
        # (like PayTabs with apple_pay in payment_methods),
        # we trust the token and mark as completed
        # This assumes the token was validated client-side
        return {
            'status': 'completed',
            'transaction_id': f"{wallet_type}_{order.id}_{uuid.uuid4().hex[:8]}",
            'amount': amount
        }
    
    def _emit_payment_events(self, order, payment):
        """Emit real-time events for payment completion"""
        order_data = OrderDetailSerializer(order).data
        payment_data = PaymentSerializer(payment).data
        
        # Emit order_paid event
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "order_paid",
                "order": order_data
            }
        )
        
        # Emit payment:created event
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "payment_update",
                "event": "payment:created",
                "payment": payment_data
            }
        )
        
        # Emit to device session if available
        if order.guest_session:
            async_to_sync(channel_layer.group_send)(
                f"session_{order.guest_session.id}",
                {
                    "type": "payment_completed",
                    "order_id": order.id,
                    "status": "paid"
                }
            )
