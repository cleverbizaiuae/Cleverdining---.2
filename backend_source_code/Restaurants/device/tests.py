from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from accounts.models import ChefStaff, User
from restaurant.models import Restaurant

from order.models import Order
from message.models import ChatMessage

from .models import Device, GuestSession
from .session_services import SESSION_INACTIVITY_TIMEOUT, expire_inactive_guest_sessions
from .views import SimpleDeviceListView, _resolve_user_restaurant_ids


class RestaurantResolutionTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Test Restaurant",
            location="Dubai",
            phone_number="+971500000001",
            owner=self.owner,
        )

    def test_owner_restaurant_is_resolved(self):
        self.assertEqual(_resolve_user_restaurant_ids(self.owner), [self.restaurant.id])

    def test_active_manager_restaurant_is_resolved(self):
        manager = User.objects.create_user(
            email="manager@example.com",
            username="manager",
            password="test-password",
            role="manager",
        )
        ChefStaff.objects.create(
            user=manager,
            restaurant=self.restaurant,
            action="active",
        )

        self.assertEqual(_resolve_user_restaurant_ids(manager), [self.restaurant.id])

    def test_hold_staff_restaurant_is_not_resolved(self):
        staff = User.objects.create_user(
            email="staff@example.com",
            username="staff",
            password="test-password",
            role="staff",
        )
        ChefStaff.objects.create(
            user=staff,
            restaurant=self.restaurant,
            action="hold",
        )

        self.assertEqual(_resolve_user_restaurant_ids(staff), [])


class DeviceListErrorTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.owner = User.objects.create_user(
            email="owner2@example.com",
            username="owner2",
            password="test-password",
            role="owner",
        )
        Restaurant.objects.create(
            resturent_name="Error Test Restaurant",
            location="London",
            phone_number="+447000000001",
            owner=self.owner,
        )

    @patch("device.views.Device.objects.filter", side_effect=RuntimeError("database unavailable"))
    def test_database_errors_return_explicit_resilient_error_payload(self, _filter):
        request = self.factory.get("/owners/devices/")
        force_authenticate(request, user=self.owner)

        response = SimpleDeviceListView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "table_list_failed")
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["error"], "Unable to load tables.")
        self.assertNotIn("database unavailable", str(response.data))

    def test_owner_device_list_does_not_select_optional_restaurant_columns(self):
        device_user = User.objects.create_user(
            email="device@example.com",
            username="deviceuser",
            password="test-password",
            role="customer",
        )
        restaurant = self.owner.restaurants.only("id").get()
        Device.objects.create(
            table_name="T1",
            region="Primary",
            table_number="1",
            user=device_user,
            restaurant=restaurant,
        )
        request = self.factory.get("/owners/devices/")
        force_authenticate(request, user=self.owner)

        with CaptureQueriesContext(connection) as captured:
            response = SimpleDeviceListView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        sql = "\n".join(query["sql"] for query in captured.captured_queries).lower()
        self.assertNotIn("whatsapp_provider", sql)
        self.assertNotIn("whatsapp_360dialog_channel_id", sql)

    @patch("device.views._send_device_credentials_email_async")
    @patch("device.models.Device.generate_qr_code")
    def test_optional_area_stays_blank_when_omitted(self, _generate_qr, _send_email):
        client = APIClient()
        client.force_authenticate(self.owner)

        response = client.post(
            "/owners/devices/",
            {"table_name": "Area Optional", "table_number": "12", "capacity": 4},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        device = Device.objects.get(table_name="Area Optional")
        self.assertEqual(device.region, "")
        self.assertEqual(response.json()["region"], "")


class ResolveTableSessionIsolationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="session-owner@example.com",
            username="session-owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Session Test Restaurant",
            location="Dubai",
            phone_number="+971500000099",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 9",
                table_number="9",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.client = APIClient()

    def test_paid_guest_is_replaced_and_new_guest_has_no_orders(self):
        previous_session = GuestSession.objects.create(
            device=self.device,
            session_token="paid-guest-session",
        )
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=previous_session,
            status="delivered",
            payment_status="paid",
            total_price="42.00",
            amount_paid="42.00",
        )

        response = self.client.post(
            "/api/customer/resolve-table/",
            {"device_id": self.device.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_resumed"])
        self.assertNotEqual(response.json()["guest_session_id"], previous_session.id)
        previous_session.refresh_from_db()
        self.assertFalse(previous_session.is_active)

        orders_response = self.client.get(
            "/api/customer/uncomplete/orders/?include_settled=1",
            HTTP_X_GUEST_SESSION_TOKEN=response.json()["session_token"],
        )
        self.assertEqual(orders_response.status_code, 200)
        self.assertEqual(orders_response.json()["results"], [])

    def test_unpaid_guest_session_is_resumed(self):
        active_session = GuestSession.objects.create(
            device=self.device,
            session_token="active-guest-session",
        )
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=active_session,
            status="pending",
            payment_status="unpaid",
            total_price="25.00",
        )

        response = self.client.post(
            "/api/customer/resolve-table/",
            {"device_id": self.device.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_resumed"])
        self.assertEqual(response.json()["guest_session_id"], active_session.id)


class GuestSessionInactivityTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="heartbeat-owner@example.com",
            username="heartbeat-owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Heartbeat Test Restaurant",
            location="Dubai",
            phone_number="+971500000077",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 7",
                table_number="7",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.session = GuestSession.objects.create(
            device=self.device,
            session_token="heartbeat-guest-session",
            expires_at=timezone.now() + timedelta(hours=24),
        )

    def test_visible_guest_heartbeat_refreshes_last_seen(self):
        stale_time = timezone.now() - SESSION_INACTIVITY_TIMEOUT - timedelta(minutes=1)
        GuestSession.objects.filter(pk=self.session.pk).update(last_seen_at=stale_time)

        response = APIClient().post(
            "/api/customer/session/heartbeat/",
            HTTP_X_GUEST_SESSION_TOKEN=self.session.session_token,
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["active"])
        self.session.refresh_from_db()
        self.assertGreater(self.session.last_seen_at, stale_time)
        self.assertEqual(
            expire_inactive_guest_sessions(
                [self.restaurant.id],
                at=self.session.last_seen_at + SESSION_INACTIVITY_TIMEOUT - timedelta(seconds=1),
            ),
            0,
        )

    def test_expired_session_cannot_be_revived_by_heartbeat(self):
        self.session.is_active = False
        self.session.save(update_fields=["is_active", "last_seen_at"])

        response = APIClient().post(
            "/api/customer/session/heartbeat/",
            HTTP_X_GUEST_SESSION_TOKEN=self.session.session_token,
        )

        self.assertEqual(response.status_code, 410)
        self.assertFalse(response.json()["active"])

    def test_manager_table_request_closes_abandoned_session(self):
        stale_time = timezone.now() - SESSION_INACTIVITY_TIMEOUT - timedelta(minutes=1)
        GuestSession.objects.filter(pk=self.session.pk).update(last_seen_at=stale_time)
        client = APIClient()
        client.force_authenticate(user=self.owner)

        response = client.get("/owners/devices/")

        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertFalse(self.session.is_active)


class ActiveSessionMessageStateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="message-owner@example.com",
            username="message-owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Message Test Restaurant",
            location="Dubai",
            phone_number="+971500000088",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 4",
                table_number="4",
                user=self.owner,
                restaurant=self.restaurant,
            )

        inactive_session = GuestSession.objects.create(
            device=self.device,
            session_token="inactive-message-session",
            is_active=False,
        )
        self.active_session = GuestSession.objects.create(
            device=self.device,
            session_token="active-message-session",
            is_active=True,
        )
        ChatMessage.objects.create(
            sender=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            guest_session=inactive_session,
            message="Old unread message",
            is_from_device=True,
            is_read=False,
        )
        self.active_message = ChatMessage.objects.create(
            sender=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            guest_session=self.active_session,
            message="Current unread message",
            is_from_device=True,
            is_read=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_table_list_only_reports_current_session_unread_messages(self):
        response = self.client.get("/owners/devicesall/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        table = response.json()[0]
        self.assertEqual(table["active_session_id"], self.active_session.id)
        self.assertEqual(table["unread_count"], 1)
        self.assertIsNotNone(table["last_message_time"])

    def test_global_badge_only_counts_current_session_messages(self):
        response = self.client.get("/message/chat/unread-count/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["unread_count"], 1)
