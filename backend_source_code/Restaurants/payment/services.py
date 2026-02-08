from .models import PaymentGateway, Payment, StripeDetails
from .adapters import StripeAdapter, CheckoutAdapter, CashAdapter, PayTabsAdapter
from rest_framework.exceptions import ValidationError
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.serializers import OrderDetailSerializer

channel_layer = get_channel_layer()

class PaymentService:
    ADAPTERS = {
        'stripe': StripeAdapter,
        'checkout': CheckoutAdapter,
        'cash': CashAdapter,
        'paytabs': PayTabsAdapter
    }

    @staticmethod
    def get_adapter(restaurant, provider=None):
        if provider == 'cash':
            return CashAdapter(None) 

        # Handle generic 'card' alias
        if provider == 'card':
            # 1. Respect currently active gateway if exists
            active = PaymentGateway.objects.filter(restaurant=restaurant, is_active=True).first()
            if active:
                provider = active.provider
                gateway = active
            else:
                # 2. Default to PayTabs if nothing is active (User Preference)
                provider = 'paytabs'

        # 1. Try exact match (Active)
        if provider:
            gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider, is_active=True).first()
        else:
            gateway = PaymentGateway.objects.filter(restaurant=restaurant, is_active=True).first()
        
        # 2. Self-Healing: If not found, try to find ANY match and activate/fix it
        if not gateway and provider:
            # Check for inactive
            gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider).first()
            if gateway:
                gateway.is_active = True
                gateway.save()
            else:
                # Does not exist. Create Default/Placeholder.
                defaults = {}
                if provider == 'stripe':
                    defaults = {
                        'key_id': "pk_test_TYooMQauvdEDq54NiTphI7jx",
                        'key_secret': "sk_test_" + "4eC39HqLyjWDarjtT1zdp7dc"
                    }
                elif provider == 'paytabs':
                    defaults = {
                        'key_id': "PROFILE_ID_MISSING",
                        'key_secret': "SERVER_KEY_MISSING"
                    }
                elif provider == 'checkout':
                    defaults = {
                         'key_id': "pk_test_missing",
                         'key_secret': "sk_test_missing"
                    }
                
                if defaults:
                     # Auto-Create
                     if not provider in ['stripe', 'paytabs', 'checkout']:
                          # Don't auto-create unknown providers without defaults
                          pass
                     else:
                        gateway = PaymentGateway.objects.create(
                            restaurant=restaurant,
                            provider=provider,
                            is_active=True,
                            **defaults
                        )

        # 3. Last Resort: Default Fallback if provider was None and we still have nothing
        if not gateway and not provider:
             # Try defaulting to Stripe
             gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider='stripe').first()
             if not gateway:
                  gateway = PaymentGateway.objects.create(
                        restaurant=restaurant,
                        provider='stripe',
                        is_active=True,
                        key_id="pk_test_TYooMQauvdEDq54NiTphI7jx",
                        key_secret="sk_test_" + "4eC39HqLyjWDarjtT1zdp7dc"
                  )
             else:
                 gateway.is_active = True
                 gateway.save()

        # 4. Legacy Fallback (StripeDetails) - kept just in case
        if not gateway and (not provider or provider == 'stripe'):
             try:
                stripe_details = StripeDetails.objects.get(restaurant=restaurant)
                class LegacyGateway:
                    def get_decrypted_secret(self):
                        return stripe_details.get_decrypted_secret_key()
                return StripeAdapter(LegacyGateway())
             except StripeDetails.DoesNotExist:
                pass

        if not gateway:
            # If we reached here, we really failed.
            raise ValidationError(f"No active payment gateway found for provider: {provider or 'any'}")
            
        adapter_class = PaymentService.ADAPTERS.get(gateway.provider)
        if not adapter_class:
            raise ValidationError(f"Unsupported provider: {gateway.provider}")
            
        return adapter_class(gateway)

    @staticmethod
    def create_payment(order, success_url, cancel_url, provider=None, amount=None, metadata=None, created_by=None):
        adapter = PaymentService.get_adapter(order.restaurant, provider=provider)
        # Use passed amount if available, else usage order total
        final_amount = amount if amount is not None else order.total_price
        
        result = adapter.create_payment_session(order, success_url, cancel_url, amount=final_amount, metadata=metadata)
        
        # Create Payment Record
        payment = Payment.objects.create(
            order=order,
            restaurant=order.restaurant,
            device=order.device,
            provider=result.get('provider', 'unknown'),
            transaction_id=result.get('transaction_id'),
            amount=final_amount, # Use the actual transaction amount
            status=result.get('status', 'pending'),
            created_by=created_by # Store who initiated (e.g., 'guest_bulk')
        )

        # Notify Restaurant of new payment
        try:
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
        except Exception as e:
            print(f"Failed to send payment notification: {e}")
        
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
            
            # Always mark the primary order as paid
            orders_to_update = [main_order]
            
            if payment.created_by == 'guest_bulk' and main_order.guest_session:
                # Find all other unpaid orders for this session
                # (Logic matches CreateBulkCheckoutSessionView filtering)
                from order.models import Order
                bulk_orders = Order.objects.filter(
                    guest_session=main_order.guest_session,
                    status__in=['pending', 'preparing', 'served', 'completed', 'awaiting_cash'],
                ).exclude(id=main_order.id).exclude(payment_status='paid')
                
                orders_to_update.extend(list(bulk_orders))

            for order in orders_to_update:
                user_updated = False
                if order.status != 'completed':
                     # Do not auto-complete orders if they are just paid? 
                     # Actually for "Fast Food" flow maybe? 
                     # But for dining, paying doesn't mean eating is done.
                     # However, current logic sets it to 'paid'.
                     # Let's keep status as is, but update payment_status.
                     # UNLESS it was 'awaiting_cash', then revert to 'served' or keep 'served'?
                     # 'paid' is a valid status in constants.
                     pass

                # Update Payment Status
                order.payment_status = 'paid'
                if order.status == 'awaiting_cash':
                    order.status = 'preparing' # or 'served'? If it was 'awaiting_cash', it was likely new.
                
                # If we want to show it as "Paid" in dashboard column:
                # The dashboard uses payment_status.
                
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
        elif provider == 'checkout':
             try:
                 restaurant_id = payload.get('data', {}).get('metadata', {}).get('restaurant_id')
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
