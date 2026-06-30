import json
import time
import hmac
import hashlib

import stripe
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APIRequestFactory

from accounts.models import User
from payment.models import PaymentGateway, PaymentProviderEvent
from payment.models import StripeDetails
from payment.provider_registry import PAYMENT_PROVIDER_CODES, PROVIDER_CLASSES
from payment.services import PaymentService
from restaurant.models import Restaurant


class PaymentProviderWebhookTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.owner = User.objects.create_user(
            email="owner-webhook@example.com",
            username="Owner Webhook",
            password="password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Webhook Test",
            location="Dubai",
            phone_number="+971500000001",
            owner=self.owner,
        )
        self.gateway = PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="stripe",
            is_enabled=True,
            is_active=True,
            connection_status="connected",
        )
        self.gateway.set_credentials(
            {
                "publishable_key": "pk_test_webhook",
                "secret_key": "sk_test_webhook",
                "webhook_secret": "whsec_test_secret",
            }
        )
        self.gateway.save()
        self.checkout_gateway = PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="checkout",
            is_enabled=True,
            is_active=True,
            connection_status="connected",
        )
        self.checkout_gateway.set_credentials(
            {
                "public_key": "pk_sbox_checkout",
                "secret_key": "sk_sbox_checkout",
                "webhook_secret": "checkout_test_secret",
            }
        )
        self.checkout_gateway.save()

    def _stripe_request(self, event_id="evt_replay_test"):
        event = {
            "id": event_id,
            "object": "event",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": "pi_test_replay",
                    "object": "payment_intent",
                    "metadata": {},
                }
            },
        }
        body = json.dumps(event, separators=(",", ":"))
        timestamp = int(time.time())
        signed_payload = f"{timestamp}.{body}"
        signature = stripe.WebhookSignature._compute_signature(
            signed_payload,
            "whsec_test_secret",
        )
        return self.factory.post(
            f"/api/payment-providers/stripe/webhook/{self.gateway.id}/",
            data=body,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=f"t={timestamp},v1={signature}",
        )

    def test_gateway_webhook_records_event_and_rejects_replay(self):
        first = PaymentService.handle_gateway_webhook("stripe", self.gateway.id, self._stripe_request())
        self.assertEqual(first["provider_event_id"], "evt_replay_test")
        self.assertFalse(first["replay_detected"])

        replay = PaymentService.handle_gateway_webhook("stripe", self.gateway.id, self._stripe_request())
        self.assertTrue(replay["replay_detected"])
        self.assertEqual(replay["status"], "rejected")

        event = PaymentProviderEvent.objects.get(
            provider="stripe",
            gateway=self.gateway,
            provider_event_id="evt_replay_test",
        )
        self.assertTrue(event.replay_detected)
        self.assertEqual(event.status, "rejected")

    def test_legacy_stripe_webhook_route_is_blocked(self):
        with self.assertRaises(ValidationError):
            PaymentService.handle_webhook("stripe", self._stripe_request())

    def _checkout_request(self, event_id="evt_checkout_replay"):
        event = {
            "id": event_id,
            "type": "payment_approved",
            "data": {
                "id": "pay_checkout_replay",
                "amount": 1234,
                "metadata": {},
            },
        }
        body = json.dumps(event, separators=(",", ":"))
        signature = hmac.new(
            b"checkout_test_secret",
            body.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return self.factory.post(
            f"/api/payment-providers/checkout/webhook/{self.checkout_gateway.id}/",
            data=body,
            content_type="application/json",
            HTTP_CKO_SIGNATURE=signature,
        )

    def test_checkout_webhook_records_event_and_rejects_replay(self):
        first = PaymentService.handle_gateway_webhook("checkout", self.checkout_gateway.id, self._checkout_request())
        self.assertEqual(first["provider_event_id"], "evt_checkout_replay")
        self.assertFalse(first["replay_detected"])

        replay = PaymentService.handle_gateway_webhook("checkout", self.checkout_gateway.id, self._checkout_request())
        self.assertTrue(replay["replay_detected"])
        self.assertEqual(replay["status"], "rejected")

        event = PaymentProviderEvent.objects.get(
            provider="checkout",
            gateway=self.checkout_gateway,
            provider_event_id="evt_checkout_replay",
        )
        self.assertTrue(event.replay_detected)
        self.assertEqual(event.status, "rejected")


class PaymentProviderVisibilityTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-visibility@example.com",
            username="Owner Visibility",
            password="password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Visibility Test",
            location="Dubai",
            phone_number="+971500000099",
            owner=self.owner,
            region="UAE",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_legacy_stripe_is_reconciled_with_other_assigned_providers(self):
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="paytabs",
            is_enabled=True,
            connection_status="connected",
        )
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="checkout",
            is_enabled=True,
            connection_status="not_configured",
        )
        StripeDetails.objects.create(
            restaurant=self.restaurant,
            stripe_secret_key="sk_test_legacy",
            stripe_publishable_key="pk_test_legacy",
        )

        response = self.client.get("/api/payment-providers/enabled/")

        self.assertEqual(response.status_code, 200)
        providers = {item["provider"]: item for item in response.json()}
        self.assertEqual(set(providers), {"checkout", "paytabs", "stripe"})
        self.assertTrue(providers["stripe"]["credentialsConfigured"])
        self.assertEqual(providers["stripe"]["connectionStatus"], "connected")

        stripe_gateway = PaymentGateway.objects.get(
            restaurant=self.restaurant,
            provider="stripe",
        )
        self.assertEqual(
            stripe_gateway.get_credentials()["secret_key"],
            "sk_test_legacy",
        )

    def test_explicit_assignments_do_not_expose_unassigned_providers(self):
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="paytabs",
            is_enabled=True,
        )

        response = self.client.get("/api/payment-providers/enabled/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["provider"] for item in response.json()],
            ["paytabs"],
        )

    def test_all_registered_providers_have_adapters(self):
        self.assertEqual(
            set(PAYMENT_PROVIDER_CODES),
            set(PROVIDER_CLASSES),
        )
