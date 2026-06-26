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
from decimal import Decimal

from .models import PaymentGateway, Payment
from .serializers import PaymentSerializer
from .schema_guard import ensure_payment_schema
from .services import PaymentService
from .adapters import StripeAdapter, PayTabsAdapter, CheckoutAdapter
from .split_bill import ensure_bill_for_order
from order.models import Order
from order.serializers import OrderDetailSerializer
from restaurant.models import Restaurant

channel_layer = get_channel_layer()


def _gateway_supports_direct_wallet(gateway) -> bool:
    """Direct wallet buttons need server-side token capture, not hosted-page support."""
    adapter_map = {
        'stripe': StripeAdapter,
        'paytabs': PayTabsAdapter,
        'checkout': CheckoutAdapter,
    }
    adapter_class = adapter_map.get(gateway.provider)
    return bool(adapter_class and hasattr(adapter_class(gateway), 'process_wallet_token'))


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
            supports_direct_wallet = _gateway_supports_direct_wallet(gateway)
            
            # Apple Pay: Enabled + Merchant ID + Domain Verified
            if (gateway.apple_pay_enabled and 
                gateway.apple_merchant_id and 
                gateway.apple_domain_verified and
                supports_direct_wallet):
                availability['apple_pay_available'] = True
            
            # Google Pay: Enabled + Merchant ID
            if (gateway.google_pay_enabled and 
                gateway.google_merchant_id and
                supports_direct_wallet):
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
        
        try:
            requested_amount = Decimal(str(amount)).quantize(Decimal("0.01"))
        except Exception:
            return Response(
                {'error': 'Invalid payment amount'},
                status=status.HTTP_400_BAD_REQUEST
            )

        bill = ensure_bill_for_order(order, lock=True)
        remaining_amount = Decimal(str(bill.remaining_amount or 0)).quantize(Decimal("0.01"))
        if requested_amount <= Decimal("0.00"):
            return Response(
                {'error': 'Payment amount must be greater than zero'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if requested_amount > remaining_amount + Decimal("0.01"):
            return Response(
                {'error': f'Amount exceeds remaining balance. Remaining {remaining_amount}, got {requested_amount}'},
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
            payment = Payment.objects.create(
                order=order,
                restaurant=order.restaurant,
                device=order.device,
                bill=bill,
                provider=wallet_type,
                transaction_id=result.get('transaction_id') or f"{wallet_type}_{order.id}_{uuid.uuid4().hex[:8]}",
                wallet_token_reference=wallet_token[:50] if wallet_token else None,  # Store partial for reference
                amount=requested_amount,
                status='pending',
                created_by='guest_wallet',
                raw_response=result,
            )

            settlement = PaymentService._finalize_completed_payment(payment, {
                'status': 'completed',
                'transaction_id': payment.transaction_id,
                'amount': requested_amount,
                'wallet_type': wallet_type,
            }, already_verified=True)
            
            return Response({
                'status': 'success',
                'payment_id': payment.id,
                'transaction_id': payment.transaction_id,
                'message': 'Payment completed successfully',
                **settlement,
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
        
        raise Exception(
            f"{gateway.provider} does not support direct {wallet_type} token capture. "
            "Use the hosted card checkout so the gateway can handle wallet authorization."
        )
    
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
