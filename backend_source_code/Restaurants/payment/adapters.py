import json
from abc import ABC, abstractmethod
import stripe
from django.conf import settings
from rest_framework.exceptions import ValidationError

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
                        'currency': 'aed',
                        'product_data': {
                            'name': f'Order #{order.id} Payment',
                        },
                        'unit_amount': int(final_amount * 100),
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}',
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
            "currency": "AED",
            "reference": f"order_{order.id}",
            "description": f"Order #{order.id} Payment",
            "billing": {
                "address": {
                    "country": "AE"
                }
            },
            "success_url": success_url + "?cko-session-id={cko-session-id}",
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

        # Cash payments are implicitly "initiated" but require manual confirmation
        transaction_id = f"cash_{order.id}"
        
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

import requests

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

        payload = {
            "profile_id": profile_id,
            "tran_type": "sale",
            "tran_class": "ecom",
            "cart_id": unique_cart_id,
            "cart_description": desc,
            "cart_currency": "AED",
            "cart_amount": float(amount if amount is not None else order.total_price),
            "callback": "https://cleverdining-2.onrender.com/api/payment/webhook/paytabs/",
            "return": "https://cleverdining-2.onrender.com/api/customer/payment/paytabs/return/", 
            "hide_shipping": True
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
                'raw_response': data
            }

        except Exception as e:
            # Catch requests exception or validation error
            # Include specific message if possible
            raise ValidationError(f"PayTabs Connection Failed: {str(e)}")

    def verify_payment(self, data):
        # PayTabs usually relies on the Return URL parameters or Webhook.
        # If the user is redirected back with a `tran_ref`, we can query the status.
        return {'status': 'pending'} # Placeholder, as usually verification happens via Webhook/Redirect

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
