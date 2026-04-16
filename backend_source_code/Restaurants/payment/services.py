from .models import PaymentGateway, Payment, StripeDetails
from .adapters import StripeAdapter, CheckoutAdapter, CashAdapter, PayTabsAdapter, PaymeAdapter
from rest_framework.exceptions import ValidationError
from decimal import Decimal
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.serializers import OrderDetailSerializer
from django.db.models import Q
from restaurant.region_config import get_region_config
from .split_bill import (
    apply_successful_payment,
    ensure_bill_for_order,
    mark_payment_failed,
    prepare_split_checkout,
    register_pending_allocations,
)

channel_layer = get_channel_layer()


def _to_decimal(value):
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")

class PaymentService:
    ADAPTERS = {
        'stripe': StripeAdapter,
        'checkout': CheckoutAdapter,
        'cash': CashAdapter,
        'paytabs': PayTabsAdapter,
        'payme': PaymeAdapter,
    }

    @staticmethod
    def _allowed_providers_for_restaurant(restaurant):
        region = getattr(restaurant, "region", "UAE")
        region_cfg = get_region_config(region)
        return set(region_cfg.get("payments", []))

    @staticmethod
    def _resolve_provider(restaurant, provider=None):
        requested = (provider or "").strip().lower()
        if requested == "card":
            requested = ""
        if requested:
            return requested

        explicit_default = (getattr(restaurant, "default_payment_provider", "") or "").strip().lower()
        if explicit_default:
            return explicit_default

        region_default = get_region_config(getattr(restaurant, "region", "UAE")).get("default_payment_provider", "stripe")
        return str(region_default).lower()

    @staticmethod
    def _close_session_and_clear_chat_if_settled(order):
        """
        End table session and clear table chat only when no unpaid orders remain.
        """
        session = getattr(order, "guest_session", None)
        if not session:
            return

        from order.models import Order
        from message.models import ChatMessage

        has_unpaid_orders = Order.objects.filter(
            guest_session=session
        ).exclude(payment_status='paid').exclude(status='cancelled').exists()

        if has_unpaid_orders:
            return

        if session.is_active:
            session.is_active = False
            session.save(update_fields=['is_active'])

        ChatMessage.objects.filter(device=order.device).delete()

        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "chat_cleared",
                    "device_id": order.device_id,
                    "session_id": session.id,
                    "reason": "bill_paid"
                }
            )
        except Exception as e:
            print(f"[PAYMENT-WS] Failed sending chat_cleared to restaurant group: {e}")

        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_chat_{order.restaurant.id}",
                {
                    "type": "chat_cleared",
                    "device_id": order.device_id,
                    "session_id": session.id,
                    "reason": "bill_paid"
                }
            )
        except Exception as e:
            print(f"[PAYMENT-WS] Failed sending chat_cleared to chat group: {e}")

        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "session_closed",
                    "session_id": session.id,
                    "table_id": order.device_id,
                    "reason": "bill_paid"
                }
            )
        except Exception as e:
            print(f"[PAYMENT-WS] Failed sending session_closed to restaurant group: {e}")

        try:
            async_to_sync(channel_layer.group_send)(
                f"session_{session.id}",
                {
                    "type": "session_closed",
                    "message": "Session closed after payment"
                }
            )
        except Exception as e:
            print(f"[PAYMENT-WS] Failed sending session_closed to device session group: {e}")

    @staticmethod
    def get_adapter(restaurant, provider=None):
        provider_input = (provider or "").strip().lower()
        explicit_requested = provider_input not in {"", "card"}
        resolved_provider = PaymentService._resolve_provider(restaurant, provider=provider)
        if resolved_provider == 'cash':
            return CashAdapter(None) 

        allowed = PaymentService._allowed_providers_for_restaurant(restaurant)
        if resolved_provider and resolved_provider not in allowed:
            raise ValidationError(
                f"Provider '{resolved_provider}' is not enabled for region {getattr(restaurant, 'region', 'UAE')}"
            )

        gateway = None
        if resolved_provider:
            gateway = PaymentGateway.objects.filter(
                restaurant=restaurant,
                provider=resolved_provider,
                is_active=True
            ).first()
            if not gateway and not explicit_requested:
                gateway = PaymentGateway.objects.filter(
                    restaurant=restaurant,
                    provider__in=list(allowed),
                    is_active=True
                ).first()
        else:
            gateway = PaymentGateway.objects.filter(
                restaurant=restaurant,
                provider__in=list(allowed),
                is_active=True
            ).first()

        # Legacy fallback for StripeDetails-backed setups.
        if not gateway and (not resolved_provider or resolved_provider == 'stripe'):
             try:
                stripe_details = StripeDetails.objects.get(restaurant=restaurant)
                class LegacyGateway:
                    def get_decrypted_secret(self):
                        return stripe_details.get_decrypted_secret_key()
                return StripeAdapter(LegacyGateway())
             except StripeDetails.DoesNotExist:
                pass

        if not gateway:
            raise ValidationError(
                f"No active payment gateway found for provider: {resolved_provider or 'any'}"
            )
            
        adapter_class = PaymentService.ADAPTERS.get(gateway.provider)
        if not adapter_class:
            raise ValidationError(f"Unsupported provider: {gateway.provider}")
            
        return adapter_class(gateway)

    @staticmethod
    def create_payment(order, success_url, cancel_url, provider=None, amount=None, metadata=None, created_by=None, split_data=None):
        adapter = PaymentService.get_adapter(order.restaurant, provider=provider)
        split_context = None
        bill = None
        split_type = 'full_bill'
        payer_id_or_name = ''

        # Keep existing bulk checkout behavior unchanged.
        if created_by != 'guest_bulk':
            if split_data:
                split_context = prepare_split_checkout(order, split_data)
                bill = split_context["bill"]
                split_type = split_context["split_type"]
                payer_id_or_name = split_context.get("payer_id_or_name", "")
                final_amount = split_context["amount"]
            else:
                bill = ensure_bill_for_order(order)
                final_amount = _to_decimal(amount) if amount is not None else _to_decimal(bill.remaining_amount)
                if final_amount > _to_decimal(bill.remaining_amount):
                    final_amount = bill.remaining_amount
                if final_amount <= 0:
                    raise ValidationError("This bill is already fully paid.")
                split_context = {
                    "plan": [
                        {
                            "allocation_type": "bill",
                            "allocated_amount": final_amount,
                            "participant_id": "",
                        }
                    ]
                }
        else:
            final_amount = _to_decimal(amount) if amount is not None else _to_decimal(order.total_price)

        request_metadata = dict(metadata or {})
        if bill:
            request_metadata.update(
                {
                    "bill_id": bill.id,
                    "split_type": split_type,
                }
            )

        result = adapter.create_payment_session(
            order,
            success_url,
            cancel_url,
            amount=final_amount,
            metadata=request_metadata,
        )
        
        # Create Payment Record
        payment = Payment.objects.create(
            order=order,
            restaurant=order.restaurant,
            device=order.device,
            bill=bill,
            provider=result.get('provider', 'unknown'),
            transaction_id=result.get('transaction_id'),
            amount=final_amount, # Use the actual transaction amount
            split_type=split_type,
            payer_id_or_name=payer_id_or_name,
            status=result.get('status', 'pending'),
            created_by=created_by # Store who initiated (e.g., 'guest_bulk')
        )
        if split_context and bill:
            register_pending_allocations(payment, split_context["plan"])

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
        # Idempotency guard: don't re-process already completed transactions.
        if payment.status == 'completed':
            return {
                'status': 'completed',
                'transaction_id': payment.transaction_id,
                'amount': float(payment.amount),
                'idempotent': True,
            }

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
             if not adapter_class:
                 raise ValidationError(f"Unsupported provider: {gateway.provider}")
             adapter = adapter_class(gateway)
        else:
            raise ValidationError("Gateway configuration not found")

        verification_result = adapter.verify_payment(data)
        
        if verification_result.get('status') == 'completed':
            payment.status = 'completed'
            payment.save(update_fields=["status", "updated_at"])

            if payment.bill_id:
                updated_bill = apply_successful_payment(payment)
                main_order = payment.order
                main_order.refresh_from_db()

                order_data = OrderDetailSerializer(main_order).data
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{main_order.restaurant.id}",
                    {
                        "type": "order_paid",
                        "order": order_data
                    }
                )

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

                if main_order.guest_session and updated_bill and updated_bill.payment_status == "fully_paid":
                    from order.models import Cart
                    Cart.objects.filter(guest_session=main_order.guest_session).delete()
                    PaymentService._close_session_and_clear_chat_if_settled(main_order)
                return verification_result
            
            # Logic for Single vs Bulk
            main_order = payment.order
            
            # Always mark the primary order as paid
            orders_to_update = [main_order]
            
            if payment.created_by == 'guest_bulk' and main_order.guest_session:
                # Find all other unpaid orders for this session
                # (Logic matches CreateBulkCheckoutSessionView filtering)
                from order.models import Order
                bulk_orders = Order.objects.filter(
                    Q(guest_session=main_order.guest_session) | Q(device=main_order.device),
                    restaurant=main_order.restaurant,
                    status__in=['pending', 'preparing', 'served', 'delivered', 'completed', 'awaiting_cash'],
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

            PaymentService._close_session_and_clear_chat_if_settled(main_order)
        else:
            resolved_status = str(verification_result.get("status") or "").lower()
            if resolved_status in {"failed", "declined", "cancelled", "canceled"}:
                payment.status = "failed"
                payment.save(update_fields=["status", "updated_at"])
                mark_payment_failed(payment)
            elif resolved_status:
                payment.status = "pending"
                payment.save(update_fields=["status", "updated_at"])

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
        elif provider == 'payme':
             try:
                 restaurant_id = (
                     payload.get('metadata', {}).get('restaurant_id')
                     or payload.get('restaurant_id')
                 )
             except:
                 pass
                 
        if not restaurant_id:
            transaction_id = (
                payload.get('transaction_id')
                or payload.get('payment_id')
                or payload.get('id')
            )
            if transaction_id:
                payment = Payment.objects.filter(transaction_id=transaction_id).select_related('restaurant').first()
                if payment:
                    restaurant_id = payment.restaurant_id

        if not restaurant_id:
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
            payment = Payment.objects.filter(transaction_id=transaction_id).first()
            if payment:
                PaymentService.verify_payment(payment, result)
        return result
