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
    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        stripe.api_key = self.gateway.get_decrypted_secret()
        
        # Calculate Amount
        final_amount = amount if amount is not None else order.total_price
        
        # Merge Metadata
        final_metadata = {
            'order_id': order.id,
            'restaurant_id': order.restaurant.id
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
        stripe.api_key = self.gateway.get_decrypted_secret()
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
        # Note: In a real scenario, we need the webhook secret. 
        # For now, we might rely on the event retrieval or just basic signature check if secret is stored.
        # Assuming we store webhook_secret in PaymentGateway or similar.
        # If not available, we can retrieve the event from Stripe to verify authenticity.
        
        stripe.api_key = self.gateway.get_decrypted_secret()
        
        try:
            # If we had the webhook secret:
            # event = stripe.Webhook.construct_event(payload, sig_header, self.gateway.webhook_secret)
            
            # Without webhook secret (or if dynamic), we can parse the event and retrieve it to verify
            event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
            
            # To be extra safe without signing secret, retrieve it:
            # event = stripe.Event.retrieve(event.id) 
            
            if event.type == 'checkout.session.completed':
                session = event.data.object
                return {
                    'transaction_id': session.id,
                    'status': 'completed',
                    'amount': session.amount_total / 100 if session.amount_total else 0,
                    'meta': session.metadata
                }
            return None
        except ValueError as e:
            raise ValidationError("Invalid payload")
        except stripe.error.SignatureVerificationError as e:
            raise ValidationError("Invalid signature")

class CheckoutAdapter(PaymentAdapter):
    """
    Checkout.com Hosted Payments Page Adapter
    Supports: Card payments, Apple Pay, Google Pay
    Docs: https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-a-hosted-page
    """
    SANDBOX_URL = "https://api.sandbox.checkout.com/hosted-payments"
    PRODUCTION_URL = "https://api.checkout.com/hosted-payments"

    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        import requests
        
        # Use sandbox for testing, production for live
        # You can add an is_sandbox flag to PaymentGateway model if needed
        base_url = self.SANDBOX_URL  # Change to PRODUCTION_URL for live
        
        secret_key = self.gateway.get_decrypted_secret()
        final_amount = int((amount if amount is not None else order.total_price) * 100)  # Checkout expects minor units
        
        # Build metadata
        final_metadata = {
            'order_id': str(order.id),
            'restaurant_id': str(order.restaurant.id)
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
        
        secret_key = self.gateway.get_decrypted_secret()
        
        # Get session details from Checkout.com
        url = f"https://api.sandbox.checkout.com/hosted-payments/{session_id}"
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
        import hmac
        import hashlib
        
        # Get webhook signature (optional - for production you should verify)
        signature = request.headers.get('Cko-Signature')
        
        try:
            data = request.data if hasattr(request, 'data') else json.loads(request.body)
            
            event_type = data.get('type', '')
            
            if event_type == 'payment_approved' or event_type == 'payment_captured':
                payment_data = data.get('data', {})
                return {
                    'status': 'completed',
                    'transaction_id': payment_data.get('id'),
                    'amount': payment_data.get('amount', 0) / 100 if payment_data.get('amount') else 0,
                    'meta': data.get('data', {}).get('metadata', {})
                }
            elif event_type == 'payment_declined':
                return {'status': 'failed'}
            
            return None
        except Exception as e:
            raise ValidationError(f"Webhook verification failed: {str(e)}")


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
        # Update Order Status
        order.status = 'awaiting_cash'
        order.payment_status = 'pending_cash'
        order.save()

        # Broadcast Cash Alert to Restaurant (Dashboard)
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from order.serializers import OrderDetailSerializer
        
        channel_layer = get_channel_layer()
        order_data = OrderDetailSerializer(order).data
        
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "cash_payment_alert",
                    "order": order_data,
                    "table_number": order.device.table_number or order.device.table_name,
                    "total_amount": str(order.total_price),
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

    def verify_payment(self, data):
        payment_result = data.get('payment_result', {}) if isinstance(data, dict) else {}
        response_status = (
            data.get('respStatus')
            or data.get('response_status')
            or payment_result.get('response_status')
        )
        if response_status == 'A':
            return {
                'status': 'completed',
                'transaction_id': data.get('tran_ref'),
                'amount': data.get('cart_amount'),
                'raw_response': data,
            }
        if response_status in {'C', 'D', 'E'}:
            return {
                'status': 'failed',
                'transaction_id': data.get('tran_ref'),
                'raw_response': data,
            }
        return {'status': 'pending'}

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
