import json
import time
import hmac
import hashlib
from unittest.mock import patch

import stripe
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APIRequestFactory

from accounts.models import User
from payment.models import Payment, PaymentGateway, PaymentProviderEvent
from payment.models import StripeDetails
from payment.provider_registry import PAYMENT_PROVIDER_CODES, PROVIDER_CLASSES
from payment.services import PaymentService, _mark_order_payment_progress
from restaurant.models import Restaurant
from device.models import Device, GuestSession
from order.models import Cart, Order


class PreOrderPaymentSettlementTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="preorder-settlement@example.com",
            username="Preorder Settlement",
            password="password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Preorder Settlement",
            location="Dubai",
            phone_number="+971500004321",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table P",
                user=self.owner,
                restaurant=self.restaurant,
            )

    def test_fully_paid_preorder_enters_pending_kitchen_state(self):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="awaiting_payment",
            payment_status="unpaid",
            total_price="50.00",
        )

        _mark_order_payment_progress(order, "50.00")

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(order.status, "pending")
        self.assertEqual(str(order.amount_paid), "50.00")


class CompletedGuestPaymentSessionTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="completed-guest-payment@example.com",
            username="Completed Guest Payment",
            password="password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Completed Guest Payment",
            location="Dubai",
            phone_number="+971500004322",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table Card",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.session = GuestSession.objects.create(
            device=self.device,
            session_token="completed-card-session",
        )
        self.order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=self.session,
            status="awaiting_payment",
            payment_status="unpaid",
            total_price="50.00",
        )
        Cart.objects.create(guest_session=self.session, device=self.device)
        self.payment = Payment.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            order=self.order,
            provider="stripe",
            transaction_id="txn_completed_card_session",
            amount="50.00",
            status="pending",
            created_by="guest",
        )

    def test_full_card_payment_retires_session_and_clears_cart(self):
        with (
            patch.object(PaymentService, "_emit_order_update"),
            patch.object(PaymentService, "_emit_payment_update"),
            patch("payment.services.async_to_sync") as async_to_sync,
        ):
            async_to_sync.return_value = lambda *_args, **_kwargs: None
            result = PaymentService._finalize_completed_payment(
                self.payment,
                {"amount": "50.00", "status": "completed"},
            )

        self.session.refresh_from_db()
        self.order.refresh_from_db()
        self.assertTrue(result["fully_paid"])
        self.assertEqual(self.order.payment_status, "paid")
        self.assertFalse(self.session.is_active)
        self.assertFalse(Cart.objects.filter(guest_session=self.session).exists())
        self.assertTrue(Order.objects.filter(pk=self.order.pk).exists())

    def test_payment_does_not_retire_session_while_another_order_is_unpaid(self):
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=self.session,
            status="pending",
            payment_status="unpaid",
            total_price="25.00",
        )

        with (
            patch.object(PaymentService, "_emit_order_update"),
            patch.object(PaymentService, "_emit_payment_update"),
            patch("payment.services.async_to_sync") as async_to_sync,
        ):
            async_to_sync.return_value = lambda *_args, **_kwargs: None
            result = PaymentService._finalize_completed_payment(
                self.payment,
                {"amount": "50.00", "status": "completed"},
            )

        self.session.refresh_from_db()
        self.assertTrue(result["fully_paid"])
        self.assertTrue(self.session.is_active)
        self.assertTrue(Cart.objects.filter(guest_session=self.session).exists())


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

    def test_selected_processor_is_visible_with_other_assigned_providers(self):
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="paytabs",
            is_enabled=True,
        )
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="checkout",
            is_enabled=True,
        )

        response = self.client.get("/api/payment-providers/enabled/")

        self.assertEqual(response.status_code, 200)
        providers = {item["provider"]: item for item in response.json()}
        self.assertEqual(set(providers), {"checkout", "paytabs", "stripe"})
        self.assertFalse(providers["stripe"]["credentialsConfigured"])
        self.assertEqual(providers["stripe"]["connectionStatus"], "not_configured")

        stripe_gateway = PaymentGateway.objects.get(
            restaurant=self.restaurant,
            provider="stripe",
        )
        self.assertTrue(stripe_gateway.is_enabled)

    def test_explicit_non_default_processor_does_not_expose_region_default(self):
        self.restaurant.payment_processor = "paytabs"
        self.restaurant.default_payment_provider = "paytabs"
        self.restaurant.save(update_fields=["payment_processor", "default_payment_provider"])
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="paytabs",
            is_enabled=True,
        )

        response = self.client.get("/api/payment-providers/enabled/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["provider"] for item in response.json()], ["paytabs"])

    def test_all_registered_providers_have_adapters(self):
        self.assertEqual(
            set(PAYMENT_PROVIDER_CODES),
            set(PROVIDER_CLASSES),
        )
