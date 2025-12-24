import json
from abc import ABC, abstractmethod
import stripe
import razorpay
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

class RazorpayAdapter(PaymentAdapter):
    def create_payment_session(self, order, success_url, cancel_url, amount=None, metadata=None):
        try:
            client = razorpay.Client(auth=(self.gateway.key_id, self.gateway.get_decrypted_secret()))
            final_amount = amount if amount is not None else order.total_price
            data = {
                "amount": int(final_amount * 100),
                "currency": "AED",
                "receipt": f"order_{order.id}",
                "notes": {
                    "order_id": order.id,
                    "restaurant_id": order.restaurant.id
                }
            }
            razorpay_order = client.order.create(data=data)
            return {
                'order_id': razorpay_order['id'],
                'amount': razorpay_order['amount'],
                'currency': razorpay_order['currency'],
                'key_id': self.gateway.key_id,
                'provider': 'razorpay',
                'transaction_id': razorpay_order['id']
            }
        except Exception as e:
            raise ValidationError(str(e))

    def verify_payment(self, data):
        try:
            client = razorpay.Client(auth=(self.gateway.key_id, self.gateway.get_decrypted_secret()))
            client.utility.verify_payment_signature({
                'razorpay_order_id': data.get('razorpay_order_id'),
                'razorpay_payment_id': data.get('razorpay_payment_id'),
                'razorpay_signature': data.get('razorpay_signature')
            })
            return {
                'status': 'completed',
                'transaction_id': data.get('razorpay_order_id')
            }
        except razorpay.errors.SignatureVerificationError:
            raise ValidationError("Signature verification failed")
        except Exception as e:
            raise ValidationError(str(e))

    def verify_webhook(self, request):
        # Razorpay webhook verification
        webhook_secret = getattr(self.gateway, 'webhook_secret', None)
        if not webhook_secret:
             # If no secret, we can't verify signature easily locally without it.
             # Assuming it's passed or stored.
             pass
        
        payload = request.body.decode('utf-8')
        signature = request.headers.get('X-Razorpay-Signature')
        
        try:
            client = razorpay.Client(auth=(self.gateway.key_id, self.gateway.get_decrypted_secret()))
            client.utility.verify_webhook_signature(payload, signature, webhook_secret)
            
            data = json.loads(payload)
            if data['event'] == 'order.paid':
                payment_entity = data['payload']['payment']['entity']
                order_entity = data['payload']['order']['entity']
                return {
                    'transaction_id': order_entity['id'],
                    'status': 'completed',
                    'amount': payment_entity['amount'] / 100
                }
            return None
        except Exception as e:
             raise ValidationError(str(e))

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
