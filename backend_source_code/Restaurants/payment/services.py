from .models import PaymentGateway, Payment, StripeDetails
from .adapters import StripeAdapter, RazorpayAdapter, CashAdapter, PayTabsAdapter
from rest_framework.exceptions import ValidationError
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.serializers import OrderDetailSerializer

channel_layer = get_channel_layer()

class PaymentService:
    ADAPTERS = {
        'stripe': StripeAdapter,
        'razorpay': RazorpayAdapter,
        'cash': CashAdapter,
        'paytabs': PayTabsAdapter
    }

    @staticmethod
    def get_adapter(restaurant, provider=None):
        if provider == 'cash':
            return CashAdapter(None) # No gateway needed for cash

        if provider:
            gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider, is_active=True).first()
        else:
            gateway = PaymentGateway.objects.filter(restaurant=restaurant, is_active=True).first()
        
        # Fallback for legacy StripeDetails
        if not gateway and (not provider or provider == 'stripe'):
             try:
                stripe_details = StripeDetails.objects.get(restaurant=restaurant)
                # Create a temporary/dummy gateway object for the adapter
                class LegacyGateway:
                    def get_decrypted_secret(self):
                        return stripe_details.get_decrypted_secret_key()
                return StripeAdapter(LegacyGateway())
             except StripeDetails.DoesNotExist:
                pass

        if not gateway:
            raise ValidationError("No active payment gateway found.")
            
        adapter_class = PaymentService.ADAPTERS.get(gateway.provider)
        if not adapter_class:
            raise ValidationError(f"Unsupported provider: {gateway.provider}")
            
        return adapter_class(gateway)

    @staticmethod
    def create_payment(order, success_url, cancel_url, provider=None, amount=None, metadata=None):
        adapter = PaymentService.get_adapter(order.restaurant, provider=provider)
        result = adapter.create_payment_session(order, success_url, cancel_url, amount=amount, metadata=metadata)
        
        # Create Payment Record
        payment = Payment.objects.create(
            order=order,
            restaurant=order.restaurant,
            device=order.device,
            provider=result.get('provider', 'unknown'),
            transaction_id=result.get('transaction_id'),
            amount=order.total_price,
            status=result.get('status', 'pending')
        )

        # Notify Restaurant of new payment
        from .serializers import PaymentSerializer
        payment_data = PaymentSerializer(payment).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "payment_update",
                "event": "payment:created",
                "payment": payment_data
            }
        )
        
        return result

    @staticmethod
    def verify_payment(payment, data):
        # Find gateway based on payment provider
        gateway = PaymentGateway.objects.filter(restaurant=payment.restaurant, provider=payment.provider).first()
        
        # Legacy fallback
        if not gateway and payment.provider == 'stripe':
             try:
                stripe_details = StripeDetails.objects.get(restaurant=payment.restaurant)
                class LegacyGateway:
                    def get_decrypted_secret(self):
                        return stripe_details.get_decrypted_secret_key()
                adapter = StripeAdapter(LegacyGateway())
             except StripeDetails.DoesNotExist:
                 raise ValidationError("Gateway configuration not found")
        elif gateway:
             adapter_class = PaymentService.ADAPTERS.get(gateway.provider)
             adapter = adapter_class(gateway)
        else:
            raise ValidationError("Gateway configuration not found")

        verification_result = adapter.verify_payment(data)
        
        if verification_result.get('status') == 'completed':
            payment.status = 'completed'
            payment.save()
            
            # Logic for Single vs Bulk
            main_order = payment.order
            
            orders_to_update = [main_order]
            
            if payment.created_by == 'guest_bulk' and main_order.guest_session:
                # Find all other unpaid orders for this session
                # (Logic matches CreateBulkCheckoutSessionView filtering)
                from order.models import Order
                bulk_orders = Order.objects.filter(
                    guest_session=main_order.guest_session,
                    status__in=['pending', 'preparing', 'served', 'awaiting_cash'],
                ).exclude(id=main_order.id).exclude(payment_status='paid')
                
                orders_to_update.extend(list(bulk_orders))

            for order in orders_to_update:
                order.status = 'paid'
                order.payment_status = 'paid'
                order.save()
                
                # Notify Restaurant
                order_data = OrderDetailSerializer(order).data
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{order.restaurant.id}",
                    {
                        "type": "order_paid",
                        "order": order_data
                    }
                )

            # Notify Restaurant of payment update (just once for the transaction)
            from .serializers import PaymentSerializer
            payment_data = PaymentSerializer(payment).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{payment.restaurant.id}",
                {
                    "type": "payment_update",
                    "event": "payment:updated",
                    "payment": payment_data
                }
            )

            # Clear Cart on Successful Payment (Backend Cleanup)
            if main_order.guest_session:
                from order.models import Cart
                Cart.objects.filter(guest_session=main_order.guest_session).delete()
            
        return verification_result

    @staticmethod
    def handle_webhook(provider, request):
        # This is tricky because we need to know WHICH restaurant/gateway to use to verify the signature.
        # Usually webhooks are per-account or have a way to identify the account in the payload.
        # For Stripe Connect, it's easier. For separate keys, we might need to iterate or look up by some ID in payload.
        
        # Strategy: 
        # 1. Parse payload to find an identifier (e.g. metadata.restaurant_id, or order_id).
        # 2. Load that restaurant's gateway.
        # 3. Verify signature.
        
        # Simplified for now: We assume we can find the payment/order from the payload to get the restaurant.
        # BUT we need to verify signature BEFORE trusting payload.
        # This is a chicken-and-egg problem with multiple secret keys.
        # Solution: The webhook URL should probably include the restaurant ID or gateway ID? 
        # OR: We try to match the signature against all active gateways for that provider (expensive but secure).
        # OR: We trust the payload enough to get the ID, load key, then verify. (Standard practice if payload structure is known).
        
        # Let's try to extract metadata/ID from request body without verifying first (just parsing).
        # Then verify.
        
        import json
        try:
            payload = json.loads(request.body)
        except:
            return # Invalid JSON
            
        restaurant_id = None
        
        if provider == 'stripe':
             # Metadata is usually in data.object.metadata
             try:
                 restaurant_id = payload['data']['object']['metadata']['restaurant_id']
             except:
                 pass
        elif provider == 'razorpay':
             try:
                 restaurant_id = payload['payload']['payment']['entity']['notes']['restaurant_id']
             except:
                 pass
                 
        if not restaurant_id:
            # Fallback: Try to find payment by ID if possible, but we need restaurant to get secret.
            raise ValidationError("Could not identify restaurant from webhook payload")

        from restaurant.models import Restaurant
        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist:
             raise ValidationError("Restaurant not found")
             
        adapter = PaymentService.get_adapter(restaurant, provider)
        result = adapter.verify_webhook(request)
        
        if result and result.get('status') == 'completed':
            transaction_id = result.get('transaction_id')
            # Find payment
            payment = Payment.objects.filter(transaction_id=transaction_id).first()
            if payment:
                payment.status = 'completed'
                payment.save()
                
                # Logic for Single vs Bulk
                main_order = payment.order
                orders_to_update = [main_order]
                
                if payment.created_by == 'guest_bulk' and main_order.guest_session:
                    from order.models import Order
                    bulk_orders = Order.objects.filter(
                        guest_session=main_order.guest_session,
                        status__in=['pending', 'preparing', 'served', 'awaiting_cash'],
                    ).exclude(id=main_order.id).exclude(payment_status='paid')
                    orders_to_update.extend(list(bulk_orders))
                
                for order in orders_to_update:
                    order.status = 'paid'
                    order.payment_status = 'paid'
                    order.save()
                    
                    # Notify Restaurant
                    order_data = OrderDetailSerializer(order).data
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{order.restaurant.id}",
                        {
                            "type": "order_paid",
                            "order": order_data
                        }
                    )

                # Notify Restaurant of payment update
                from .serializers import PaymentSerializer
                payment_data = PaymentSerializer(payment).data
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{payment.restaurant.id}",
                    {
                        "type": "payment_update",
                        "event": "payment:updated",
                        "payment": payment_data
                    }
                )
        return result
