import json
import time
import hmac
import hashlib
from datetime import datetime, timezone as datetime_timezone
from unittest.mock import Mock, patch

import stripe
import requests
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APIRequestFactory

from accounts.models import User
from payment.models import Payment, PaymentGateway, PaymentProviderEvent
from payment.models import StripeDetails
from payment.adapters import CashAdapter
from payment.provider_registry import PAYMENT_PROVIDER_CODES, PROVIDER_CLASSES
from payment.services import PaymentService, _mark_order_payment_progress
from restaurant.models import Restaurant
from device.models import Device, GuestSession
from order.models import Cart, Order


class GuestPaymentVerificationAccessTests(TestCase):
    def test_guest_return_can_reach_payment_verification(self):
        response = APIClient().post(
            "/api/customer/payment/verify/",
            {"session_id": "cs_test_missing_guest_return"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "Payment record not found")


class PayTabsReturnFlowTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="paytabs-return@example.com",
            username="PayTabs Return",
            password="password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="PayTabs Return Restaurant",
            location="Dubai",
            phone_number="+971500004398",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table PayTabs",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="pending",
            payment_status="unpaid",
            total_price="50.00",
        )
        self.gateway = PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="paytabs",
            is_enabled=True,
            is_active=True,
            connection_status="connected",
        )
        self.gateway.set_credentials({
            "profile_id": "123456",
            "server_key": "paytabs-test-server-key",
        })
        self.gateway.save()
        self.payment = Payment.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            order=self.order,
            provider="paytabs",
            transaction_id="TST_RETURN_123",
            amount="50.00",
            status="pending",
            raw_response={
                "_client_success_url": "https://customer.example/thankyou",
                "_client_cancel_url": "https://customer.example/dashboard/orders/",
            },
        )
        self.client = APIClient()

    @staticmethod
    def _query_response(response_status, message):
        response = Mock(status_code=200)
        response.json.return_value = {
            "tran_ref": "TST_RETURN_123",
            "cart_amount": "50.00",
            "payment_result": {
                "response_status": response_status,
                "response_message": message,
            },
        }
        return response

    @patch("payment.adapters.requests.post")
    def test_camel_case_post_return_verifies_and_redirects_to_thank_you(self, request_post):
        request_post.return_value = self._query_response("A", "Authorised")

        response = self.client.post(
            "/api/customer/payment/paytabs/return/",
            {
                "tranRef": "TST_RETURN_123",
                "respStatus": "A",
                "respMessage": "Authorised",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://customer.example/thankyou?session_id=TST_RETURN_123",
        )
        self.payment.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.payment.status, "completed")
        self.assertEqual(self.order.payment_status, "paid")
        request_post.assert_called_once()

    @patch("payment.adapters.requests.post")
    def test_get_return_reads_query_parameters(self, request_post):
        request_post.return_value = self._query_response("A", "Authorised")

        response = self.client.get(
            "/api/customer/payment/paytabs/return/",
            {"tranRef": "TST_RETURN_123", "respStatus": "A"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("/thankyou?session_id=TST_RETURN_123", response["Location"])

    @patch("payment.adapters.requests.post")
    def test_declined_payment_returns_plain_reason_code(self, request_post):
        request_post.return_value = self._query_response("D", "Declined")

        response = self.client.post(
            "/api/customer/payment/paytabs/return/",
            {"tranRef": "TST_RETURN_123", "respStatus": "D"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://customer.example/dashboard/orders/?payment=failed&reason=payment_declined",
        )
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "failed")

    @patch("payment.adapters.requests.post", side_effect=requests.RequestException("network down"))
    def test_verification_outage_does_not_falsely_mark_payment_failed(self, _request_post):
        response = self.client.post(
            "/api/customer/payment/paytabs/return/",
            {"tranRef": "TST_RETURN_123", "respStatus": "A"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://customer.example/dashboard/orders/?payment=pending&reason=verification_unavailable",
        )
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "pending")

    def test_missing_transaction_reference_returns_actionable_reason(self):
        response = self.client.post("/api/customer/payment/paytabs/return/", {})

        self.assertEqual(response.status_code, 302)
        self.assertIn("payment=failed", response["Location"])
        self.assertIn("reason=missing_transaction_reference", response["Location"])


class PaymentAdminDateFilterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="payment-date-owner@example.com",
            username="Payment Date Owner",
            password="password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Payment Date Restaurant",
            location="Dubai",
            phone_number="+971500004399",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table Date",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def _create_paid_order(self, created_at, *, with_payment):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="served",
            payment_status="paid",
            total_price="25.00",
        )
        Order.objects.filter(pk=order.pk).update(
            created_time=created_at,
            updated_time=created_at,
        )

        if not with_payment:
            return f"derived_{order.id}"

        payment = Payment.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            order=order,
            provider="cash",
            transaction_id=f"payment-date-{order.id}",
            amount="25.00",
            status="completed",
        )
        Payment.objects.filter(pk=payment.pk).update(
            created_at=created_at,
            updated_at=created_at,
        )
        return payment.id

    def test_date_range_filters_real_and_derived_payments_inclusively(self):
        before_range = datetime(2026, 6, 1, 23, 59, tzinfo=datetime_timezone.utc)
        start_boundary = datetime(2026, 6, 2, 0, 0, tzinfo=datetime_timezone.utc)
        end_boundary = datetime(2026, 6, 28, 23, 59, 59, tzinfo=datetime_timezone.utc)
        after_range = datetime(2026, 6, 29, 0, 0, tzinfo=datetime_timezone.utc)

        excluded_real = self._create_paid_order(before_range, with_payment=True)
        included_real = self._create_paid_order(start_boundary, with_payment=True)
        included_derived = self._create_paid_order(end_boundary, with_payment=False)
        excluded_derived = self._create_paid_order(after_range, with_payment=False)

        response = self.client.get(
            "/owners/payments/?created_at__gte=2026-06-02&created_at__lte=2026-06-28"
        )

        self.assertEqual(response.status_code, 200)
        result_ids = {entry["id"] for entry in response.json()["results"]}
        self.assertEqual(result_ids, {included_real, included_derived})
        self.assertNotIn(excluded_real, result_ids)
        self.assertNotIn(excluded_derived, result_ids)

    def test_timezone_aware_datetime_boundaries_are_respected(self):
        before_range = datetime(2026, 6, 1, 18, 29, 59, tzinfo=datetime_timezone.utc)
        start_boundary = datetime(2026, 6, 1, 18, 30, tzinfo=datetime_timezone.utc)
        end_boundary = datetime(2026, 6, 28, 18, 29, 59, 999000, tzinfo=datetime_timezone.utc)
        after_range = datetime(2026, 6, 28, 18, 30, tzinfo=datetime_timezone.utc)

        excluded_before = self._create_paid_order(before_range, with_payment=True)
        included_start = self._create_paid_order(start_boundary, with_payment=True)
        included_end = self._create_paid_order(end_boundary, with_payment=True)
        excluded_after = self._create_paid_order(after_range, with_payment=True)

        response = self.client.get(
            "/owners/payments/",
            {
                "created_at__gte": "2026-06-01T18:30:00.000Z",
                "created_at__lte": "2026-06-28T18:29:59.999Z",
            },
        )

        self.assertEqual(response.status_code, 200)
        result_ids = {entry["id"] for entry in response.json()["results"]}
        self.assertEqual(result_ids, {included_start, included_end})
        self.assertNotIn(excluded_before, result_ids)
        self.assertNotIn(excluded_after, result_ids)


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

    def test_payment_preserves_latest_kitchen_status(self):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="preparing",
            payment_status="unpaid",
            total_price="50.00",
        )

        _mark_order_payment_progress(order, "50.00")

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(order.status, "preparing")

    def test_cash_waiting_status_moves_to_served_after_payment(self):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="awaiting_cash",
            payment_status="pending_cash",
            total_price="50.00",
        )

        _mark_order_payment_progress(order, "50.00")

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(order.status, "served")

    def test_cash_request_preserves_latest_fulfilment_status(self):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="served",
            payment_status="unpaid",
            total_price="50.00",
        )

        CashAdapter(None).create_payment_session(
            order,
            "https://customer.example/payment/success",
            "https://customer.example/payment/cancel",
            amount="50.00",
            metadata={"suppress_cash_alert": True},
        )

        order.refresh_from_db()
        self.assertEqual(order.status, "served")
        self.assertEqual(order.payment_status, "pending_cash")


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

    def test_completed_card_payment_preserves_preparing_status(self):
        self.order.status = "preparing"
        self.order.save(update_fields=["status", "updated_time"])

        with (
            patch.object(PaymentService, "_emit_order_update"),
            patch.object(PaymentService, "_emit_payment_update"),
            patch("payment.services.async_to_sync") as async_to_sync,
        ):
            async_to_sync.return_value = lambda *_args, **_kwargs: None
            PaymentService._finalize_completed_payment(
                self.payment,
                {"amount": "50.00", "status": "completed"},
            )

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, "paid")
        self.assertEqual(self.order.status, "preparing")


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

    def test_unconfigured_gateway_returns_customer_safe_error(self):
        PaymentGateway.objects.create(
            restaurant=self.restaurant,
            provider="stripe",
            is_enabled=True,
            is_active=True,
        )

        with self.assertRaisesMessage(
            ValidationError,
            "Online payments are not configured for this restaurant",
        ):
            PaymentService.get_adapter(self.restaurant, provider="stripe")
