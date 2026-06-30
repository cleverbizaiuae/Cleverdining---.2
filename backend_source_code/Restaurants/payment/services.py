from .models import PaymentGateway, Payment, PaymentProviderEvent, StripeDetails
from .adapters import (
    StripeAdapter,
    CheckoutAdapter,
    CashAdapter,
    PayTabsAdapter,
    PaymeAdapter,
    AdyenAdapter,
    WorldpayAdapter,
    SumUpAdapter,
    SquareAdapter,
)
from rest_framework.exceptions import ValidationError
from decimal import Decimal
import json
from django.db import transaction
from django.db import IntegrityError
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.serializers import OrderDetailSerializer
from django.db.models import Q, Sum
from restaurant.region_config import get_region_config
from .split_bill import (
    apply_successful_payment,
    ensure_bill_for_order,
    mark_payment_failed,
    prepare_split_checkout,
    register_pending_allocations,
)
from .schema_guard import ensure_payment_schema
from .recovery import ensure_selected_payment_gateway
import hashlib

channel_layer = get_channel_layer()
PAYMENT_EPSILON = Decimal("0.01")


def _to_decimal(value):
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _q_money(value):
    return _to_decimal(value).quantize(Decimal("0.01"))


def _json_safe(value):
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return {"raw": str(value)}


def _remaining_for_order(order):
    total = _q_money(order.total_price)
    paid = min(total, max(Decimal("0.00"), _q_money(getattr(order, "amount_paid", 0))))
    return max(total - paid, Decimal("0.00"))


def _mark_order_payment_progress(order, paid_amount):
    total = _q_money(order.total_price)
    paid = min(total, max(Decimal("0.00"), _q_money(paid_amount)))
    remaining = max(total - paid, Decimal("0.00"))
    if remaining <= PAYMENT_EPSILON:
        paid = total
        remaining = Decimal("0.00")
    order.amount_paid = paid
    if remaining <= PAYMENT_EPSILON:
        order.payment_status = 'paid'
        if order.status not in {'cancelled', 'completed'}:
            order.status = 'delivered'
    elif paid > PAYMENT_EPSILON:
        order.payment_status = 'partially_paid'
        if order.status == 'awaiting_cash':
            order.status = 'served'
    else:
        order.payment_status = 'unpaid'
    order.save(update_fields=['amount_paid', 'payment_status', 'status', 'updated_time'])


def settle_bulk_split_payment(payment):
    """Apply one completed session-level split payment without closing early."""
    from order.models import Order

    anchor = payment.order
    session = anchor.guest_session
    eligible_statuses = ['pending', 'preparing', 'served', 'delivered', 'completed', 'awaiting_cash']
    session_scope = Q(guest_session=session)
    if session and session.created_at:
        session_scope |= Q(device=anchor.device, created_time__gte=session.created_at)
    orders = Order.objects.filter(
        session_scope,
        restaurant=anchor.restaurant,
        status__in=eligible_statuses,
    ).distinct()
    orders_list = list(orders.order_by("created_time", "id"))
    total_amount = sum((_to_decimal(order.total_price) for order in orders_list), Decimal("0"))
    split_paid_amount = Payment.objects.filter(
        order__in=orders,
        created_by__startswith='guest_bulk_evenly',
        status='completed',
    ).aggregate(total=Sum('amount')).get('total') or Decimal("0")
    separately_paid_amount = sum(
        (_to_decimal(order.total_price) for order in orders_list if order.payment_status == 'paid'),
        Decimal("0"),
    )
    completed_amount = min(total_amount, _to_decimal(split_paid_amount) + separately_paid_amount)
    remaining_amount = max(total_amount - _to_decimal(completed_amount), Decimal("0"))
    fully_paid = remaining_amount <= PAYMENT_EPSILON
    if fully_paid:
        completed_amount = total_amount
        remaining_amount = Decimal("0.00")

    paid_ratio = (completed_amount / total_amount) if total_amount > Decimal("0") else Decimal("1")
    for order in orders_list:
        order_total = _q_money(order.total_price)
        if fully_paid or order.payment_status == 'paid':
            order.amount_paid = order_total
            order.payment_status = 'paid'
            if order.status not in {'cancelled', 'completed'}:
                order.status = 'delivered'
        else:
            order.amount_paid = min(order_total, _q_money(order_total * paid_ratio))
            order.payment_status = 'partially_paid' if order.amount_paid > PAYMENT_EPSILON else 'unpaid'
            if order.status == 'awaiting_cash':
                order.status = 'served'
        order.save(update_fields=['amount_paid', 'payment_status', 'status', 'updated_time'])

    return {
        'total_amount': total_amount,
        'paid_amount': min(_to_decimal(completed_amount), total_amount),
        'remaining_amount': remaining_amount,
        'fully_paid': fully_paid,
        'orders': orders,
    }

class PaymentService:
    ADAPTERS = {
        'stripe': StripeAdapter,
        'checkout': CheckoutAdapter,
        'cash': CashAdapter,
        'paytabs': PayTabsAdapter,
        'payme': PaymeAdapter,
        'adyen': AdyenAdapter,
        'worldpay': WorldpayAdapter,
        'sumup': SumUpAdapter,
        'square': SquareAdapter,
    }

    @staticmethod
    def _allowed_providers_for_restaurant(restaurant):
        ensure_selected_payment_gateway(restaurant)
        assigned = list(PaymentGateway.objects.filter(
            restaurant=restaurant,
            is_enabled=True,
        ).values_list("provider", flat=True))
        if assigned:
            return set(assigned) | {"cash"}
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
                is_active=True,
                is_enabled=True,
            ).first()
            if not gateway and not explicit_requested:
                gateway = PaymentGateway.objects.filter(
                    restaurant=restaurant,
                    provider__in=list(allowed),
                    is_active=True,
                    is_enabled=True,
                ).first()
        else:
            gateway = PaymentGateway.objects.filter(
                restaurant=restaurant,
                provider__in=list(allowed),
                is_active=True,
                is_enabled=True,
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
        ensure_payment_schema()
        adapter = PaymentService.get_adapter(order.restaurant, provider=provider)
        split_context = None
        bill = None
        split_type = 'full_bill'
        payer_id_or_name = ''

        # Session-level bulk payments do not use a single-order bill ledger.
        is_guest_bulk = str(created_by or '').startswith('guest_bulk')
        if not is_guest_bulk:
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
            created_by=created_by, # Store who initiated (e.g., 'guest_bulk')
            raw_response=_json_safe(result.get('raw_response')) if result.get('raw_response') is not None else None,
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
    def _gateway_confirmed_amount(payment, verification_result):
        requested = _q_money(payment.amount)
        raw_amount = None
        if isinstance(verification_result, dict):
            raw_amount = verification_result.get('amount')

        if raw_amount in (None, ""):
            return requested

        confirmed = _q_money(raw_amount)
        if confirmed + Decimal("0.01") < requested:
            raise ValidationError(
                f"Gateway confirmed {confirmed}, but this payment requires {requested}."
            )
        return requested

    @staticmethod
    def _emit_order_update(order, event_type="order_paid"):
        order_data = OrderDetailSerializer(order).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": event_type,
                "order": order_data
            }
        )

    @staticmethod
    def _emit_payment_update(payment, event="payment:updated"):
        from .serializers import PaymentSerializer
        payment_data = PaymentSerializer(payment).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{payment.restaurant.id}",
            {
                "type": "payment_update",
                "event": event,
                "payment": payment_data
            }
        )

    @staticmethod
    def _settle_orders_with_payment_amount(payment, orders):
        amount_left = _q_money(payment.amount)
        touched_orders = []

        for order in orders:
            remaining = _remaining_for_order(order)
            if remaining <= PAYMENT_EPSILON:
                continue

            applied = min(remaining, amount_left)
            if applied <= PAYMENT_EPSILON:
                break

            next_paid = _q_money(getattr(order, "amount_paid", 0)) + applied
            _mark_order_payment_progress(order, next_paid)
            touched_orders.append(order)
            amount_left = _q_money(amount_left - applied)

        return touched_orders

    @staticmethod
    def _orders_settlement_payload(orders):
        orders_list = list(orders)
        total_amount = sum((_q_money(order.total_price) for order in orders_list), Decimal("0.00"))
        paid_amount = sum(
            (min(_q_money(order.total_price), _q_money(getattr(order, "amount_paid", 0))) for order in orders_list),
            Decimal("0.00"),
        )
        paid_amount = min(total_amount, paid_amount)
        remaining_amount = max(total_amount - paid_amount, Decimal("0.00"))
        if remaining_amount <= PAYMENT_EPSILON:
            paid_amount = total_amount
            remaining_amount = Decimal("0.00")
        return {
            'total_amount': str(_q_money(total_amount)),
            'paid_amount': str(_q_money(paid_amount)),
            'remaining_amount': str(_q_money(remaining_amount)),
            'fully_paid': remaining_amount <= PAYMENT_EPSILON,
            'payment_status': 'paid' if remaining_amount <= PAYMENT_EPSILON else ('partially_paid' if paid_amount > PAYMENT_EPSILON else 'unpaid'),
        }

    @staticmethod
    def _finalize_completed_payment(payment, verification_result=None, *, already_verified=False):
        ensure_payment_schema()
        verification_result = verification_result or {}

        with transaction.atomic():
            payment = Payment.objects.select_for_update().select_related(
                'order', 'restaurant', 'device', 'bill'
            ).get(pk=payment.pk)
            was_completed = payment.status == 'completed'

            if not was_completed:
                PaymentService._gateway_confirmed_amount(payment, verification_result)
                payment.status = 'completed'
                payment.raw_response = _json_safe(verification_result)
                payment.save(update_fields=["status", "raw_response", "updated_at"])

            if payment.created_by and payment.created_by.startswith('guest_bulk_evenly'):
                settlement = settle_bulk_split_payment(payment)
                payload = {
                    'status': 'completed',
                    'transaction_id': payment.transaction_id,
                    'amount': float(payment.amount),
                    'remaining_amount': str(settlement['remaining_amount']),
                    'paid_amount': str(settlement['paid_amount']),
                    'fully_paid': settlement['fully_paid'],
                    'payment_status': 'paid' if settlement['fully_paid'] else 'partially_paid',
                    'idempotent': was_completed,
                }
                affected_orders = list(settlement['orders'])

            elif payment.bill_id:
                updated_bill = apply_successful_payment(payment) if not was_completed else ensure_bill_for_order(payment.order)
                payment.order.refresh_from_db()
                payload = {
                    'status': 'completed',
                    'transaction_id': payment.transaction_id,
                    'amount': float(payment.amount),
                    'remaining_amount': str(_q_money(updated_bill.remaining_amount)),
                    'paid_amount': str(_q_money(updated_bill.paid_amount)),
                    'fully_paid': updated_bill.payment_status == "fully_paid",
                    'payment_status': 'paid' if updated_bill.payment_status == "fully_paid" else updated_bill.payment_status,
                    'idempotent': was_completed,
                }
                affected_orders = [payment.order]

            else:
                from order.models import Order
                main_order = payment.order
                orders_to_update = [main_order]
                if payment.created_by == 'guest_bulk' and main_order.guest_session:
                    bulk_orders = Order.objects.filter(
                        Q(guest_session=main_order.guest_session) | Q(device=main_order.device),
                        restaurant=main_order.restaurant,
                        status__in=['pending', 'preparing', 'served', 'delivered', 'completed', 'awaiting_cash'],
                    ).exclude(id=main_order.id).exclude(payment_status='paid').order_by('created_time', 'id')
                    orders_to_update.extend(list(bulk_orders))

                if not was_completed:
                    affected_orders = PaymentService._settle_orders_with_payment_amount(payment, orders_to_update)
                else:
                    affected_orders = list(orders_to_update)
                payload = {
                    'status': 'completed',
                    'transaction_id': payment.transaction_id,
                    'amount': float(payment.amount),
                    'idempotent': was_completed,
                    **PaymentService._orders_settlement_payload(orders_to_update),
                }

        for order in affected_orders:
            try:
                PaymentService._emit_order_update(order)
            except Exception as e:
                print(f"Failed to send order payment notification: {e}")

        try:
            payment.refresh_from_db()
            PaymentService._emit_payment_update(payment)
        except Exception as e:
            print(f"Failed to send payment update notification: {e}")

        if payload.get('fully_paid') and payment.order.guest_session:
            from order.models import Cart
            Cart.objects.filter(guest_session=payment.order.guest_session).delete()
            PaymentService._close_session_and_clear_chat_if_settled(payment.order)

        return payload

    @staticmethod
    def verify_payment(payment, data):
        ensure_payment_schema()
        # Idempotency guard: return the current ledger state without re-applying
        # the transaction.
        if payment.status == 'completed':
            return PaymentService._finalize_completed_payment(payment, data or {})

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
            return PaymentService._finalize_completed_payment(payment, verification_result)
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
    def _append_operation_response(payment, operation, result):
        raw_response = payment.raw_response if isinstance(payment.raw_response, dict) else {}
        operations = list(raw_response.get("provider_operations") or [])
        operations.append({
            "operation": operation,
            "result": _json_safe(result),
        })
        raw_response["provider_operations"] = operations[-25:]
        payment.raw_response = raw_response
        payment.save(update_fields=["raw_response", "updated_at"])

    @staticmethod
    def _operation_adapter(payment, provider):
        provider = (provider or payment.provider or "").strip().lower()
        if provider != payment.provider:
            raise ValidationError("Payment provider mismatch")
        gateway = PaymentGateway.objects.filter(
            restaurant=payment.restaurant,
            provider=provider,
            is_enabled=True,
        ).first()
        if not gateway:
            raise ValidationError("Gateway configuration not found")
        adapter_class = PaymentService.ADAPTERS.get(gateway.provider)
        if not adapter_class:
            raise ValidationError(f"Unsupported provider: {gateway.provider}")
        return adapter_class(gateway)

    @staticmethod
    def capture_payment(payment, amount=None):
        adapter = PaymentService._operation_adapter(payment, payment.provider)
        result = adapter.capture_payment(payment.transaction_id, amount=amount)
        PaymentService._append_operation_response(payment, "capture", result)
        return _json_safe(result)

    @staticmethod
    def refund_payment(payment, amount=None, reason=None):
        adapter = PaymentService._operation_adapter(payment, payment.provider)
        result = adapter.refund_payment(payment.transaction_id, amount=amount, reason=reason)
        PaymentService._append_operation_response(payment, "refund", result)
        return _json_safe(result)

    @staticmethod
    def void_payment(payment):
        adapter = PaymentService._operation_adapter(payment, payment.provider)
        result = adapter.void_payment(payment.transaction_id)
        PaymentService._append_operation_response(payment, "void", result)
        return _json_safe(result)

    @staticmethod
    def _webhook_hashes(request):
        body = request.body or b""
        signature = (
            request.headers.get("Stripe-Signature")
            or request.headers.get("Cko-Signature")
            or request.headers.get("cko-signature")
            or request.headers.get("Checkout-Signature")
            or ""
        )
        return (
            hashlib.sha256(body).hexdigest(),
            hashlib.sha256(str(signature).encode("utf-8")).hexdigest() if signature else "",
        )

    @staticmethod
    def _record_provider_event(gateway, result, request, status_value="received"):
        payload_hash, signature_hash = PaymentService._webhook_hashes(request)
        provider_event_id = (
            (result or {}).get("provider_event_id")
            or (result or {}).get("event_id")
            or (result or {}).get("transaction_id")
            or payload_hash
        )
        try:
            event, created = PaymentProviderEvent.objects.get_or_create(
                provider=gateway.provider,
                gateway=gateway,
                provider_event_id=str(provider_event_id),
                defaults={
                    "payload_hash": payload_hash,
                    "signature_hash": signature_hash,
                    "status": status_value,
                },
            )
        except IntegrityError:
            event = PaymentProviderEvent.objects.get(
                provider=gateway.provider,
                gateway=gateway,
                provider_event_id=str(provider_event_id),
            )
            created = False
        if not created:
            event.replay_detected = True
            event.status = "rejected"
            event.processed_at = timezone.now()
            event.save(update_fields=["replay_detected", "status", "processed_at"])
            return event, True
        return event, False

    @staticmethod
    def _record_failed_provider_event(gateway, request, exc):
        payload_hash, signature_hash = PaymentService._webhook_hashes(request)
        provider_event_id = f"invalid:{payload_hash[:24]}"
        event, _ = PaymentProviderEvent.objects.get_or_create(
            provider=gateway.provider,
            gateway=gateway,
            provider_event_id=provider_event_id,
            defaults={
                "payload_hash": payload_hash,
                "signature_hash": signature_hash,
                "status": "failed",
                "processed_at": timezone.now(),
            },
        )
        gateway.webhook_status = "failing"
        gateway.last_error = str(exc)
        gateway.save(update_fields=["webhook_status", "last_error", "updated_at"])
        return event

    @staticmethod
    def _apply_webhook_result(provider, restaurant_id, result):
        if result and result.get('status') == 'completed':
            transaction_id = result.get('transaction_id')
            payment = Payment.objects.filter(transaction_id=transaction_id).first()
            if not payment:
                meta = result.get('meta') or {}
                bill_id = meta.get('bill_id')
                order_id = meta.get('primary_order_id') or meta.get('order_id')
                guest_session_id = meta.get('guest_session_id')
                candidates = Payment.objects.filter(
                    restaurant_id=restaurant_id,
                    provider=provider,
                    status='pending',
                ).order_by('-created_at')
                if bill_id:
                    payment = candidates.filter(bill_id=bill_id).first()
                if not payment and order_id:
                    payment = candidates.filter(order_id=order_id).first()
                if not payment and guest_session_id:
                    payment = candidates.filter(
                        created_by__contains=f":{guest_session_id}:"
                    ).first() or candidates.filter(created_by='guest_bulk').first()
            if payment:
                PaymentService._finalize_completed_payment(payment, result, already_verified=True)
        elif result and str(result.get('status') or '').lower() in {'failed', 'declined', 'cancelled', 'canceled'}:
            transaction_id = result.get('transaction_id')
            payment = Payment.objects.filter(transaction_id=transaction_id).first() if transaction_id else None
            if payment:
                payment.status = "failed"
                payment.raw_response = _json_safe(result)
                payment.save(update_fields=["status", "raw_response", "updated_at"])
                mark_payment_failed(payment)
        return result

    @staticmethod
    def handle_gateway_webhook(provider, gateway_id, request):
        ensure_payment_schema()
        provider = (provider or "").strip().lower()
        gateway = PaymentGateway.objects.select_related("restaurant").filter(
            id=gateway_id,
            provider=provider,
            is_enabled=True,
        ).first()
        if not gateway:
            raise ValidationError("Payment gateway not found for webhook")
        adapter_class = PaymentService.ADAPTERS.get(gateway.provider)
        if not adapter_class:
            raise ValidationError(f"Unsupported provider: {gateway.provider}")
        adapter = adapter_class(gateway)
        try:
            result = adapter.verify_webhook(request)
            if not result:
                result = {"status": "ignored"}
            event, replay_detected = PaymentService._record_provider_event(gateway, result, request)
            if replay_detected:
                return {
                    "status": "rejected",
                    "replay_detected": True,
                    "event_id": event.id,
                }
            PaymentService._apply_webhook_result(provider, gateway.restaurant_id, result)
            event.status = "processed" if str(result.get("status") or "").lower() in {"completed", "failed", "declined", "cancelled", "canceled"} else "ignored"
            event.processed_at = timezone.now()
            event.save(update_fields=["status", "processed_at"])
            gateway.webhook_status = "healthy"
            gateway.last_error = ""
            gateway.save(update_fields=["webhook_status", "last_error", "updated_at"])
            return {**_json_safe(result), "event_id": event.id, "replay_detected": False}
        except Exception as exc:
            PaymentService._record_failed_provider_event(gateway, request, exc)
            raise

    @staticmethod
    def handle_webhook(provider, request):
        provider = (provider or "").strip().lower()
        if provider in {"stripe", "checkout"}:
            raise ValidationError("Use the gateway-specific webhook URL: /api/payment-providers/{provider}/webhook/{gateway_id}/")
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
        
        return PaymentService._apply_webhook_result(provider, restaurant_id, result)
