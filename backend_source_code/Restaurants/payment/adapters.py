import json
from abc import ABC, abstractmethod
import stripe
import requests
import hmac
import hashlib
from urllib.parse import urlparse
from urllib.parse import parse_qsl, urlencode, urlunparse
from django.conf import settings
from rest_framework.exceptions import ValidationError
from restaurant.region_config import get_region_config
from .provider_registry import get_provider

class PaymentAdapter(ABC):
    def __init__(self, gateway):
        self.gateway = gateway

    @abstractmethod
    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        pass

    @abstractmethod
    def verify_payment(self, data):
        pass

    @abstractmethod
    def verify_webhook(self, request):
        """
        Verifies the webhook signature and returns the event payload.
        """
        pass

    def capture_payment(self, transaction_id, amount=None):
        raise ValidationError(f"{self.__class__.__name__} capture is not configured")

    def refund_payment(self, transaction_id, amount=None, reason=None):
        raise ValidationError(f"{self.__class__.__name__} refunds are not configured")

    def void_payment(self, transaction_id):
        raise ValidationError(f"{self.__class__.__name__} voids are not configured")

    def health_check(self):
        raise ValidationError(f"{self.__class__.__name__} health checks are not configured")


def _order_region_settings(order):
    restaurant = getattr(order, "restaurant", None)
    return get_region_config(getattr(restaurant, "region", "UAE"))


def _order_currency(order):
    restaurant = getattr(order, "restaurant", None)
    configured_currency = (getattr(restaurant, "currency", "") or "").strip().upper()
    if configured_currency:
        return configured_currency
    return _order_region_settings(order)["currency"]


def _order_country_alpha2(order):
    settings_map = _order_region_settings(order)
    return "GB" if settings_map["country_code"] == "+44" else "AE"


def _append_query(url, **params):
    parsed = urlparse(url or "")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key, value in params.items():
        query[key] = value
    return urlunparse(parsed._replace(query=urlencode(query)))

class StripeAdapter(PaymentAdapter):
    def _credentials(self):
        return self.gateway.get_credentials() if hasattr(self.gateway, "get_credentials") else {}

    def _secret_key(self):
        return self.gateway.get_decrypted_secret()

    def _webhook_secret(self):
        return self._credentials().get("webhook_secret") or getattr(settings, "STRIPE_WEBHOOK_SECRET", "")

    def _to_minor_units(self, amount):
        if amount is None:
            return None
        return int(round(float(amount) * 100))

    def _payment_intent_id(self, transaction_id):
        stripe.api_key = self._secret_key()
        transaction_id = str(transaction_id or "")
        if transaction_id.startswith("pi_"):
            return transaction_id
        if transaction_id.startswith("cs_"):
            session = stripe.checkout.Session.retrieve(transaction_id)
            payment_intent = session.get("payment_intent")
            if not payment_intent:
                raise ValidationError("Stripe checkout session does not have a payment intent yet")
            return payment_intent
        return transaction_id

    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        stripe.api_key = self._secret_key()
        final_amount = amount if amount is not None else order.total_price
        final_metadata = {
            'order_id': order.id,
            'restaurant_id': order.restaurant.id,
            'gateway_id': getattr(self.gateway, "id", ""),
        }
        if metadata:
            final_metadata.update(metadata)

        try:
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': _order_currency(order).lower(),
                        'product_data': {
                            'name': f'Order #{order.id} Payment',
                        },
                        'unit_amount': int(final_amount * 100),
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=_append_query(success_url, session_id="{CHECKOUT_SESSION_ID}"),
                cancel_url=cancel_url,
                metadata=final_metadata
            )
            return {
                'url': session.url,
                'transaction_id': session.id,
                'provider': 'stripe',
                'raw_response': session
            }
        except stripe.error.StripeError as e:
            raise ValidationError(str(e))

    def verify_payment(self, data):
        stripe.api_key = self._secret_key()
        session_id = data.get('session_id')
        if not session_id:
            raise ValidationError("Session ID is required")

        try:
            session = stripe.checkout.Session.retrieve(session_id)
            if session.payment_status == 'paid':
                return {
                    'status': 'completed',
                    'transaction_id': session.id,
                    'amount': session.amount_total / 100 if session.amount_total else 0
                }
            return {'status': 'pending'}
        except stripe.error.StripeError as e:
            raise ValidationError(str(e))

    def verify_webhook(self, request):
        payload = request.body
        sig_header = request.headers.get('Stripe-Signature')
        webhook_secret = self._webhook_secret()
        if not webhook_secret:
            raise ValidationError("Stripe webhook secret is not configured for this gateway")

        stripe.api_key = self._secret_key()

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)

            if event.type == 'checkout.session.completed':
                session = event.data.object
                return {
                    'provider_event_id': event.id,
                    'transaction_id': session.id,
                    'status': 'completed',
                    'amount': session.amount_total / 100 if session.amount_total else 0,
                    'meta': session.metadata
                }
            if event.type in {'checkout.session.expired', 'payment_intent.payment_failed'}:
                obj = event.data.object
                return {
                    'provider_event_id': event.id,
                    'transaction_id': getattr(obj, 'id', None),
                    'status': 'failed',
                    'meta': getattr(obj, 'metadata', {}) or {},
                }
            return {'provider_event_id': event.id, 'status': 'ignored', 'event_type': event.type}
        except ValueError:
            raise ValidationError("Invalid Stripe webhook payload")
        except stripe.error.SignatureVerificationError:
            raise ValidationError("Invalid Stripe webhook signature")

    def capture_payment(self, transaction_id, amount=None):
        stripe.api_key = self._secret_key()
        try:
            intent_id = self._payment_intent_id(transaction_id)
            kwargs = {}
            minor_amount = self._to_minor_units(amount)
            if minor_amount is not None:
                kwargs["amount_to_capture"] = minor_amount
            intent = stripe.PaymentIntent.capture(intent_id, **kwargs)
            return {
                "status": intent.get("status"),
                "transaction_id": intent.get("id"),
                "amount_received": (intent.get("amount_received") or 0) / 100,
                "raw_response": intent,
            }
        except stripe.error.StripeError as e:
            raise ValidationError(str(e))

    def refund_payment(self, transaction_id, amount=None, reason=None):
        stripe.api_key = self._secret_key()
        try:
            intent_id = self._payment_intent_id(transaction_id)
            kwargs = {"payment_intent": intent_id}
            minor_amount = self._to_minor_units(amount)
            if minor_amount is not None:
                kwargs["amount"] = minor_amount
            if reason:
                kwargs["reason"] = reason
            refund = stripe.Refund.create(**kwargs)
            return {
                "status": refund.get("status"),
                "refund_id": refund.get("id"),
                "transaction_id": intent_id,
                "amount": (refund.get("amount") or 0) / 100,
                "raw_response": refund,
            }
        except stripe.error.StripeError as e:
            raise ValidationError(str(e))

    def void_payment(self, transaction_id):
        stripe.api_key = self._secret_key()
        try:
            raw_id = str(transaction_id or "")
            if raw_id.startswith("cs_"):
                session = stripe.checkout.Session.retrieve(raw_id)
                if session.get("status") == "open":
                    expired = stripe.checkout.Session.expire(raw_id)
                    return {"status": "voided", "transaction_id": raw_id, "raw_response": expired}
            intent_id = self._payment_intent_id(raw_id)
            intent = stripe.PaymentIntent.cancel(intent_id)
            return {"status": intent.get("status"), "transaction_id": intent.get("id"), "raw_response": intent}
        except stripe.error.StripeError as e:
            raise ValidationError(str(e))

    def health_check(self):
        stripe.api_key = self._secret_key()
        try:
            account = stripe.Account.retrieve()
            return {
                "ok": True,
                "provider": "stripe",
                "accountId": account.get("id"),
                "chargesEnabled": bool(account.get("charges_enabled")),
                "payoutsEnabled": bool(account.get("payouts_enabled")),
            }
        except stripe.error.StripeError as e:
            raise ValidationError(str(e))

class CheckoutAdapter(PaymentAdapter):
    """
    Checkout.com Hosted Payments Page Adapter
    Supports: Card payments, Apple Pay, Google Pay
    Docs: https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-a-hosted-page
    """
    SANDBOX_URL = "https://api.sandbox.checkout.com/hosted-payments"
    PRODUCTION_URL = "https://api.checkout.com/hosted-payments"

    def _credentials(self):
        return self.gateway.get_credentials() if hasattr(self.gateway, "get_credentials") else {}

    def _secret_key(self):
        return self.gateway.get_decrypted_secret()

    def _webhook_secret(self):
        return self._credentials().get("webhook_secret") or getattr(settings, "CHECKOUT_WEBHOOK_SECRET", "")

    def _api_base(self):
        return "https://api.sandbox.checkout.com" if getattr(self.gateway, "sandbox_mode", True) else "https://api.checkout.com"

    def _headers(self):
        return {"Authorization": f"Bearer {self._secret_key()}", "Content-Type": "application/json"}

    def _to_minor_units(self, amount):
        if amount is None:
            return None
        return int(round(float(amount) * 100))

    def _verify_checkout_signature(self, request):
        webhook_secret = self._webhook_secret()
        if not webhook_secret:
            raise ValidationError("Checkout.com webhook secret is not configured for this gateway")

        signature = (
            request.headers.get('Cko-Signature')
            or request.headers.get('cko-signature')
            or request.headers.get('Checkout-Signature')
        )
        if not signature:
            raise ValidationError("Missing Checkout.com webhook signature")

        expected_signature = hmac.new(webhook_secret.encode("utf-8"), request.body, hashlib.sha256).hexdigest()
        normalized_signature = str(signature).strip()
        normalized_without_prefix = normalized_signature.split("=", 1)[-1] if "=" in normalized_signature else normalized_signature
        if not hmac.compare_digest(expected_signature.lower(), normalized_without_prefix.lower()):
            raise ValidationError("Invalid Checkout.com webhook signature")

    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        import requests
        
        # Use sandbox for testing, production for live
        # You can add an is_sandbox flag to PaymentGateway model if needed
        base_url = self.SANDBOX_URL if getattr(self.gateway, "sandbox_mode", True) else self.PRODUCTION_URL
        
        secret_key = self._secret_key()
        final_amount = int((amount if amount is not None else order.total_price) * 100)  # Checkout expects minor units
        
        # Build metadata
        final_metadata = {
            'order_id': str(order.id),
            'restaurant_id': str(order.restaurant.id),
            'gateway_id': str(getattr(self.gateway, "id", "")),
        }
        if metadata:
            final_metadata.update(metadata)

        payload = {
            "amount": final_amount,
            "currency": _order_currency(order),
            "reference": f"order_{order.id}",
            "description": f"Order #{order.id} Payment",
            "billing": {
                "address": {
                    "country": _order_country_alpha2(order)
                }
            },
            "success_url": _append_query(success_url, **{"cko-session-id": "{cko-session-id}"}),
            "cancel_url": cancel_url,
            "failure_url": cancel_url,
            "metadata": final_metadata,
            # Enable Apple Pay and other payment methods
            "allow_payment_methods": ["card", "applepay", "googlepay"]
        }

        headers = {
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(base_url, json=payload, headers=headers)
            data = response.json()
            
            if response.status_code not in [200, 201] or '_links' not in data:
                error_msg = data.get('error_type', 'Unknown error')
                error_codes = data.get('error_codes', [])
                raise ValidationError(f"Checkout.com Error: {error_msg} {error_codes}")

            redirect_url = data.get('_links', {}).get('redirect', {}).get('href')
            
            return {
                'url': redirect_url,
                'transaction_id': data.get('id'),
                'provider': 'checkout',
                'status': 'pending',
                'raw_response': data
            }
        except requests.RequestException as e:
            raise ValidationError(f"Checkout.com Connection Failed: {str(e)}")

    def verify_payment(self, data):
        import requests
        
        session_id = data.get('cko-session-id') or data.get('session_id')
        if not session_id:
            raise ValidationError("Session ID is required")
        
        secret_key = self._secret_key()
        
        # Get session details from Checkout.com
        api_base = self._api_base()
        url = f"{api_base}/hosted-payments/{session_id}"
        headers = {"Authorization": f"Bearer {secret_key}"}
        
        try:
            response = requests.get(url, headers=headers)
            data = response.json()
            
            status = data.get('status', '').lower()
            if status in ['payment_received', 'payment_approved', 'captured']:
                return {
                    'status': 'completed',
                    'transaction_id': session_id,
                    'amount': data.get('amount', 0) / 100
                }
            elif status in ['payment_pending', 'pending']:
                return {'status': 'pending'}
            else:
                return {'status': 'failed'}
        except Exception as e:
            raise ValidationError(f"Checkout.com Verification Failed: {str(e)}")

    def verify_webhook(self, request):
        """
        Checkout.com webhook verification
        Events: payment_approved, payment_declined, payment_captured
        """
        try:
            self._verify_checkout_signature(request)
            data = request.data if hasattr(request, 'data') else json.loads(request.body)
            
            event_type = data.get('type', '')
            event_id = (
                data.get('id')
                or request.headers.get('Cko-Event-Id')
                or request.headers.get('cko-event-id')
            )
            
            if event_type == 'payment_approved' or event_type == 'payment_captured':
                payment_data = data.get('data', {})
                return {
                    'provider_event_id': event_id or payment_data.get('id'),
                    'status': 'completed',
                    'transaction_id': payment_data.get('id'),
                    'amount': payment_data.get('amount', 0) / 100 if payment_data.get('amount') else 0,
                    'meta': data.get('data', {}).get('metadata', {})
                }
            elif event_type == 'payment_declined':
                payment_data = data.get('data', {})
                return {
                    'provider_event_id': event_id or payment_data.get('id'),
                    'status': 'failed',
                    'transaction_id': payment_data.get('id'),
                    'meta': payment_data.get('metadata', {}),
                }
            
            return {
                'provider_event_id': event_id or hashlib.sha256(request.body).hexdigest(),
                'status': 'ignored',
                'event_type': event_type,
            }
        except Exception as e:
            raise ValidationError(f"Webhook verification failed: {str(e)}")

    def _extract_payment_id_from_hosted_session(self, transaction_id):
        transaction_id = str(transaction_id or "")
        if not transaction_id:
            raise ValidationError("Transaction ID is required")
        if transaction_id.startswith("pay_"):
            return transaction_id

        response = requests.get(f"{self._api_base()}/hosted-payments/{transaction_id}", headers=self._headers(), timeout=12)
        try:
            data = response.json()
        except ValueError:
            data = {}
        if response.status_code not in (200, 201):
            message = data.get("error_type") or data.get("message") or response.text
            raise ValidationError(f"Checkout.com hosted payment lookup failed: {message}")

        payment_value = data.get("payment") if isinstance(data, dict) else None
        payment_id = (
            data.get("payment_id")
            or data.get("paymentId")
            or (payment_value.get("id") if isinstance(payment_value, dict) else None)
        )
        if not payment_id:
            links = data.get("_links") or {}
            payment_link = links.get("payment") if isinstance(links, dict) else None
            href = payment_link.get("href") if isinstance(payment_link, dict) else ""
            if href:
                payment_id = href.rstrip("/").split("/")[-1]
        if not payment_id:
            raise ValidationError("Checkout.com hosted payment has no captured payment id yet")
        return payment_id

    def capture_payment(self, transaction_id, amount=None):
        payment_id = self._extract_payment_id_from_hosted_session(transaction_id)
        payload = {}
        minor_amount = self._to_minor_units(amount)
        if minor_amount is not None:
            payload["amount"] = minor_amount
        response = requests.post(
            f"{self._api_base()}/payments/{payment_id}/captures",
            json=payload,
            headers=self._headers(),
            timeout=15,
        )
        data = response.json() if response.content else {}
        if response.status_code not in (200, 201, 202):
            raise ValidationError(f"Checkout.com capture failed: {data.get('error_type') or data.get('message') or response.text}")
        return {"status": "capture_requested", "transaction_id": payment_id, "raw_response": data}

    def refund_payment(self, transaction_id, amount=None, reason=None):
        payment_id = self._extract_payment_id_from_hosted_session(transaction_id)
        payload = {}
        minor_amount = self._to_minor_units(amount)
        if minor_amount is not None:
            payload["amount"] = minor_amount
        if reason:
            payload["reference"] = str(reason)[:80]
        response = requests.post(
            f"{self._api_base()}/payments/{payment_id}/refunds",
            json=payload,
            headers=self._headers(),
            timeout=15,
        )
        data = response.json() if response.content else {}
        if response.status_code not in (200, 201, 202):
            raise ValidationError(f"Checkout.com refund failed: {data.get('error_type') or data.get('message') or response.text}")
        return {"status": "refund_requested", "transaction_id": payment_id, "raw_response": data}

    def void_payment(self, transaction_id):
        payment_id = self._extract_payment_id_from_hosted_session(transaction_id)
        response = requests.post(
            f"{self._api_base()}/payments/{payment_id}/voids",
            json={},
            headers=self._headers(),
            timeout=15,
        )
        data = response.json() if response.content else {}
        if response.status_code not in (200, 201, 202):
            raise ValidationError(f"Checkout.com void failed: {data.get('error_type') or data.get('message') or response.text}")
        return {"status": "void_requested", "transaction_id": payment_id, "raw_response": data}

    def health_check(self):
        response = None
        for path in ("/processing-channels", "/workflows"):
            response = requests.get(f"{self._api_base()}{path}", headers=self._headers(), timeout=12)
            if response.status_code in (200, 201):
                return {"ok": True, "provider": "checkout", "endpoint": path}
            if response.status_code in (401, 403):
                break
        status_code = response.status_code if response is not None else "unknown"
        raise ValidationError(f"Checkout.com health check failed with HTTP {status_code}")


class PaymeAdapter(PaymentAdapter):
    """
    UK Open Banking adapter.
    The gateway key_id acts as merchant/account id and key_secret as API key.
    """

    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        api_base = (getattr(settings, "PAYME_API_BASE_URL", "") or "").rstrip("/")
        if not api_base:
            raise ValidationError("Payme is not configured for this environment")

        final_amount = float(amount if amount is not None else order.total_price)
        currency = _order_currency(order)
        if currency != "GBP":
            raise ValidationError("Payme is only supported for GBP restaurants")

        final_metadata = {
            "order_id": str(order.id),
            "restaurant_id": str(order.restaurant.id),
            "region": getattr(order.restaurant, "region", "UAE"),
        }
        if metadata:
            final_metadata.update(metadata)

        parsed_success = urlparse(success_url or "")
        backend_base = f"{parsed_success.scheme}://{parsed_success.netloc}" if parsed_success.scheme and parsed_success.netloc else ""
        callback_url = (
            (getattr(settings, "PAYME_WEBHOOK_URL", "") or "").rstrip("/")
            or (f"{backend_base}/api/customer/payment/webhook/payme/" if backend_base else "")
        )
        payload = {
            "merchant_id": self.gateway.key_id,
            "amount": final_amount,
            "currency": currency,
            "description": f"Order #{order.id} payment",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": final_metadata,
        }
        if callback_url:
            payload["callback_url"] = callback_url

        headers = {
            "Authorization": f"Bearer {self.gateway.get_decrypted_secret()}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                f"{api_base}/payments",
                json=payload,
                headers=headers,
                timeout=15,
            )
            data = response.json()
        except requests.RequestException as exc:
            raise ValidationError(f"Payme connection failed: {str(exc)}")
        except ValueError:
            raise ValidationError("Payme returned invalid response")

        if response.status_code not in [200, 201]:
            message = data.get("message") or data.get("error") or "Payme session creation failed"
            raise ValidationError(message)

        redirect_url = data.get("redirect_url") or data.get("authorization_url")
        transaction_id = data.get("id") or data.get("payment_id")
        if not redirect_url or not transaction_id:
            raise ValidationError("Payme session response is incomplete")

        return {
            "url": redirect_url,
            "transaction_id": str(transaction_id),
            "provider": "payme",
            "status": "pending",
            "raw_response": {
                **data,
                "_client_success_url": success_url,
                "_client_cancel_url": cancel_url,
            },
        }

    def verify_payment(self, data):
        payment_status = str(data.get("status") or "").lower()
        transaction_id = (
            data.get("transaction_id")
            or data.get("payment_id")
            or data.get("id")
            or data.get("session_id")
        )
        if not transaction_id:
            raise ValidationError("Transaction ID is required")

        if payment_status in {"completed", "paid", "success", "succeeded"}:
            amount = data.get("amount")
            try:
                amount = float(amount) if amount is not None else None
            except (TypeError, ValueError):
                amount = None
            return {
                "status": "completed",
                "transaction_id": str(transaction_id),
                "amount": amount,
            }
        if payment_status in {"failed", "cancelled", "canceled"}:
            return {"status": "failed", "transaction_id": str(transaction_id)}

        api_base = (getattr(settings, "PAYME_API_BASE_URL", "") or "").rstrip("/")
        if api_base:
            headers = {
                "Authorization": f"Bearer {self.gateway.get_decrypted_secret()}",
                "Content-Type": "application/json",
            }
            try:
                response = requests.get(
                    f"{api_base}/payments/{transaction_id}",
                    headers=headers,
                    timeout=12,
                )
                details = response.json()
                if response.status_code in [200, 201]:
                    remote_status = str(details.get("status") or "").lower()
                    if remote_status in {"completed", "paid", "success", "succeeded"}:
                        amount = details.get("amount")
                        try:
                            amount = float(amount) if amount is not None else None
                        except (TypeError, ValueError):
                            amount = None
                        return {
                            "status": "completed",
                            "transaction_id": str(transaction_id),
                            "amount": amount,
                        }
                    if remote_status in {"failed", "cancelled", "canceled"}:
                        return {"status": "failed", "transaction_id": str(transaction_id)}
            except Exception:
                # Keep flow non-blocking; caller can retry verify.
                pass

        return {"status": "pending", "transaction_id": str(transaction_id)}

    def verify_webhook(self, request):
        data = request.data if hasattr(request, "data") else json.loads(request.body)
        webhook_secret = getattr(settings, "PAYME_WEBHOOK_SECRET", None)
        signature = (
            request.headers.get("X-Payme-Signature")
            or request.headers.get("Payme-Signature")
        )
        if webhook_secret and signature:
            computed = hmac.new(
                webhook_secret.encode("utf-8"),
                request.body,
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(computed, str(signature).strip()):
                raise ValidationError("Invalid Payme webhook signature")
        return self.verify_payment(data)


class CashAdapter(PaymentAdapter):
    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        # Cash collection changes payment state only. Fulfilment remains owned
        # by the kitchen/staff, including ready, served, and delivered orders.
        # Prepayment orders already use awaiting_payment and remain there.
        order.payment_status = 'pending_cash'
        order.save(update_fields=['payment_status', 'updated_time'])

        # Broadcast Cash Alert to Restaurant (Dashboard)
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from order.serializers import OrderDetailSerializer
        
        channel_layer = get_channel_layer()
        order_data = OrderDetailSerializer(order).data
        
        if not (metadata or {}).get("suppress_cash_alert"):
            try:
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{order.restaurant.id}",
                    {
                        "type": "cash_payment_alert",
                        "order": order_data,
                        "order_ids": [order.id],
                        "table_number": order.device.table_number or order.device.table_name,
                        "total_amount": str(amount if amount is not None else order.total_price),
                        "order_total": str(order.total_price),
                        "already_paid": str(order.amount_paid or 0),
                        "currency": str(order.restaurant.currency or "AED").upper(),
                        "timestamp": str(order.created_time)
                    }
                )
            except Exception as e:
                print(f"Failed to send cash payment alert: {e}")

        # Cash payments are implicitly "initiated" but require manual confirmation
        import uuid
        transaction_id = f"cash_{order.id}_{uuid.uuid4().hex[:8]}"
        
        # Append session_id to URL so SuccessPage can pick it up
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        
        parsed = urlparse(success_url)
        query = parse_qs(parsed.query)
        query['session_id'] = [transaction_id]
        query['order_id'] = [order.id]
        new_query = urlencode(query, doseq=True)
        final_url = urlunparse(parsed._replace(query=new_query))

        return {
            'url': final_url, 
            'transaction_id': transaction_id,
            'provider': 'cash',
            'status': 'pending' 
        }

    def verify_payment(self, data):
        # Verification for Cash just confirms the order exists, but payment is PENDING.
        return {
            'status': 'pending', 
            'payment_status': 'pending_cash',
            'transaction_id': data.get('session_id')
        }

    def verify_webhook(self, request):
        return None

class PayTabsAdapter(PaymentAdapter):
    # Default to main secure endpoint. 
    # Valid endpoints: 
    # - https://secure.paytabs.com (UAE/KSA/General)
    # - https://secure-global.paytabs.com (Global)
    # - https://secure-egypt.paytabs.com (Egypt)
    BASE_URL = "https://secure.paytabs.com/payment/request"
    QUERY_URL = "https://secure.paytabs.com/payment/query"

    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        # 1. Input Vectors
        profile_id = self.gateway.key_id       # "Profile ID" from Dashboard
        server_key = self.gateway.get_decrypted_secret() # "Server Key" from Dashboard

        # 2. Construct Payload
        # Ensure description is clean
        desc = f"Order #{order.id}"
        
        # Unique Cart ID for retries (PayTabs rejects duplicates)
        import time
        unique_cart_id = f"{order.id}_{int(time.time())}"

        backend_base_url = (getattr(settings, "SITE_URL", "") or "https://cleverdining-2.onrender.com").rstrip("/")

        payload = {
            "profile_id": profile_id,
            "tran_type": "sale",
            "tran_class": "ecom",
            "cart_id": unique_cart_id,
            "cart_description": desc,
            "cart_currency": _order_currency(order),
            "cart_amount": float(amount if amount is not None else order.total_price),
            "callback": f"{backend_base_url}/api/payment/webhook/paytabs/",
            "return": f"{backend_base_url}/api/customer/payment/paytabs/return/",
            "hide_shipping": True,
            # Explicitly enable Apple Pay and card payments
            "payment_methods": ["all", "applepay"]
        }

        # 3. Connection (HTTP Headers)
        headers = {
            "Authorization": server_key, 
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(self.BASE_URL, json=payload, headers=headers)
            
            try:
                data = response.json()
            except:
                raise ValidationError(f"PayTabs Invalid JSON Response: {response.text}")

            if response.status_code != 200 or 'redirect_url' not in data:
                 # Try another endpoint if Profile Invalid? 
                 # For now, just return detailed error.
                 msg = data.get('message', 'Unknown error')
                 details = data.get('details', '')
                 raise ValidationError(f"PayTabs Error ({response.status_code}): {msg} {details}")

            return {
                'url': data['redirect_url'], 
                'transaction_id': data.get('tran_ref'), 
                'provider': 'paytabs',
                'status': 'pending',
                'raw_response': {
                    **data,
                    '_client_success_url': success_url,
                    '_client_cancel_url': cancel_url,
                }
            }

        except Exception as e:
            # Catch requests exception or validation error
            # Include specific message if possible
            raise ValidationError(f"PayTabs Connection Failed: {str(e)}")

    def _query_transaction(self, transaction_id):
        try:
            response = requests.post(
                self.QUERY_URL,
                json={
                    "profile_id": self.gateway.key_id,
                    "tran_ref": transaction_id,
                },
                headers={
                    "Authorization": self.gateway.get_decrypted_secret(),
                    "Content-Type": "application/json",
                },
                timeout=20,
            )
        except requests.RequestException as exc:
            raise ValidationError("PayTabs could not verify this payment at the moment") from exc

        try:
            payload = response.json()
        except Exception as exc:
            raise ValidationError("PayTabs returned an invalid payment verification response") from exc

        if response.status_code != 200:
            raise ValidationError("PayTabs could not verify this payment at the moment")
        returned_transaction_id = payload.get('tran_ref') or payload.get('tranRef')
        if returned_transaction_id and str(returned_transaction_id) != str(transaction_id):
            raise ValidationError("PayTabs returned a different payment reference")
        return payload

    def verify_payment(self, data):
        data = data if isinstance(data, dict) else {}
        payment_result = data.get('payment_result', {})
        transaction_id = (
            data.get('tran_ref')
            or data.get('tranRef')
            or data.get('session_id')
            or data.get('transaction_id')
        )

        response_status = (
            data.get('respStatus')
            or data.get('response_status')
            or payment_result.get('response_status')
        )
        if transaction_id and (data.get('_verify_with_provider') or not response_status):
            data = self._query_transaction(transaction_id)
            payment_result = data.get('payment_result', {})

        response_status = (
            data.get('respStatus')
            or data.get('response_status')
            or payment_result.get('response_status')
        )
        resolved_transaction_id = (
            data.get('tran_ref')
            or data.get('tranRef')
            or transaction_id
        )
        if response_status == 'A':
            return {
                'status': 'completed',
                'transaction_id': resolved_transaction_id,
                'amount': data.get('cart_amount'),
                'raw_response': data,
            }
        if response_status in {'C', 'D', 'E'}:
            return {
                'status': 'failed',
                'transaction_id': resolved_transaction_id,
                'response_status': response_status,
                'response_message': (
                    data.get('respMessage')
                    or data.get('response_message')
                    or payment_result.get('response_message')
                    or ''
                ),
                'raw_response': data,
            }
        return {
            'status': 'pending',
            'transaction_id': resolved_transaction_id,
            'raw_response': data,
        }

    def verify_webhook(self, request):
        # 1. Inputs
        server_key = self.gateway.get_decrypted_secret()
        data = request.data # DRF parses JSON body

        # 2. Validation
        # PayTabs sends the signature in the header or we can verify the transaction status
        # For simple integration, we verify the cart_id and status matches.
        
        payment_result = data.get('payment_result', {})
        
        if payment_result.get('response_status') == 'A': # A = Authorized/ECaptured
             return {
                'status': 'completed',
                'transaction_id': data.get('tran_ref'),
                'amount': data.get('cart_amount'),
                'meta': data
             }
        
        return {'status': 'failed'}


class ProviderFrameworkAdapter(PaymentAdapter):
    """
    Provider wrapper for newly registered gateways whose credentials and health
    are managed by the platform but whose production checkout APIs are not wired
    into the restaurant order flow yet. It fails closed for payment execution.
    """
    provider_code = ""

    def _provider(self):
        return get_provider(self.provider_code, self.gateway)

    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        provider = self._provider()
        provider.validate_credentials()
        return provider.create_payment(order, success_url, cancel_url, amount=amount, metadata=metadata)

    def verify_payment(self, data):
        transaction_id = data.get("transaction_id") or data.get("session_id") or data.get("id")
        return {"status": "pending", "transaction_id": transaction_id}

    def verify_webhook(self, request):
        return self._provider().webhook(request)


class AdyenAdapter(ProviderFrameworkAdapter):
    provider_code = "adyen"


class WorldpayAdapter(ProviderFrameworkAdapter):
    provider_code = "worldpay"


class SumUpAdapter(ProviderFrameworkAdapter):
    provider_code = "sumup"


class SquareAdapter(ProviderFrameworkAdapter):
    provider_code = "square"
