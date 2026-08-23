from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from category.models import Category
from device.models import Device, GuestSession, Reservation
from device.session_services import expire_inactive_guest_sessions, occupied_device_count
from item.models import Item
from restaurant.models import Restaurant

from .models import ItemAssociation, Order, OrderItem, UpsellSetting
from .upsell import apply_suggestion_tone
from .upsell_views import _compute_pairing_intelligence


class IssueRegressionFixture(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="issues-25-40-owner@example.com",
            username="issues-25-40-owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Issues 25-40 Restaurant",
            location="Dubai",
            phone_number="+971500004040",
            owner=self.owner,
            currency="AED",
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 25",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.session = GuestSession.objects.create(
            device=self.device,
            session_token="issues-25-40-session",
        )
        self.category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Mains",
            slug="issues-25-40-mains",
            category_type="main",
        )
        self.item = Item.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            item_name="Truffle Pasta",
            slug="truffle-pasta-25-40",
            description="Pasta",
            price="40.00",
        )
        self.client = APIClient()


class RevenueAndOrderCountRegressionTests(IssueRegressionFixture):
    def setUp(self):
        super().setUp()
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="pending",
            payment_status="unpaid",
            total_price="10.00",
        )
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="completed",
            payment_status="paid",
            total_price="20.00",
        )
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            status="cancelled",
            payment_status="paid",
            total_price="30.00",
        )

    def test_cancelled_orders_are_excluded_and_card_matches_graph_count(self):
        daily_response = self.client.get(
            "/api/daily-stats/",
            {"restaurantId": self.restaurant.id},
        )
        sales_response = self.client.get(
            "/api/analytics/sales/",
            {"restaurantId": self.restaurant.id},
        )

        self.assertEqual(daily_response.status_code, 200)
        self.assertEqual(daily_response.json()["totalOrders"], 2)
        self.assertEqual(daily_response.json()["totalRevenue"], 20.0)
        self.assertEqual(sales_response.status_code, 200)
        self.assertEqual(sum(sales_response.json()["orders"]), 2)
        self.assertEqual(sum(sales_response.json()["revenue"]), 20.0)


class OrderReservationAndNotificationRegressionTests(IssueRegressionFixture):
    def _place_order(self):
        return self.client.post(
            "/api/customer/orders/",
            {
                "order_items": [{"item": self.item.id, "quantity": 1}],
                "guest_session_token": self.session.session_token,
                "payment_method": "card",
            },
            format="json",
            HTTP_X_GUEST_SESSION_TOKEN=self.session.session_token,
        )

    def test_order_is_rejected_while_table_reservation_is_active(self):
        current = timezone.now()
        Reservation.objects.create(
            customer_name="Reserved Guest",
            device=self.device,
            restaurant=self.restaurant,
            table_name=self.device.table_name,
            guest_no=2,
            cell_number="+971500000001",
            reservation_time=current - timedelta(minutes=5),
            end_time=current + timedelta(minutes=55),
            status="confirmed",
        )

        response = self._place_order()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "table_reserved")
        self.assertFalse(Order.objects.exists())

    def test_owner_cancellation_sends_targeted_customer_notice(self):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=self.session,
            status="pending",
            payment_status="unpaid",
            total_price="40.00",
        )
        sent_events = []

        def fake_async_to_sync(_callable):
            return lambda group, payload: sent_events.append((group, payload))

        self.client.force_authenticate(self.owner)
        with patch("order.views.async_to_sync", side_effect=fake_async_to_sync):
            response = self.client.patch(
                f"/owners/orders/status/{order.id}/",
                {"status": "cancelled"},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        customer_events = [
            payload for group, payload in sent_events
            if group == f"restaurant_chat_{self.restaurant.id}"
            and payload.get("type") == "order_cancelled"
        ]
        self.assertEqual(len(customer_events), 1)
        self.assertEqual(customer_events[0]["guest_session_id"], self.session.id)
        self.assertEqual(customer_events[0]["device_id"], self.device.id)

    def test_cancelled_order_remains_visible_in_manager_order_history(self):
        order = Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=self.session,
            status="cancelled",
            payment_status="unpaid",
            total_price="40.00",
        )
        self.client.force_authenticate(self.owner)

        response = self.client.get("/owners/orders/")

        self.assertEqual(response.status_code, 200)
        order_ids = [row["id"] for row in response.json()["results"]["orders"]]
        self.assertIn(order.id, order_ids)


class TableOccupancyAndSessionRegressionTests(IssueRegressionFixture):
    def test_idle_sessions_expire_and_only_occupied_tables_are_active(self):
        with patch("device.models.Device.generate_qr_code"):
            live_order_device = Device.objects.create(
                table_name="Table 26",
                user=self.owner,
                restaurant=self.restaurant,
            )
            unused_device = Device.objects.create(
                table_name="Table 27",
                user=self.owner,
                restaurant=self.restaurant,
            )
        GuestSession.objects.filter(pk=self.session.pk).update(
            last_seen_at=timezone.now() - timedelta(minutes=31),
        )
        Order.objects.create(
            restaurant=self.restaurant,
            device=live_order_device,
            status="preparing",
            payment_status="unpaid",
            total_price="15.00",
        )

        expired = expire_inactive_guest_sessions([self.restaurant.id])

        self.session.refresh_from_db()
        self.assertEqual(expired, 1)
        self.assertFalse(self.session.is_active)
        self.assertEqual(occupied_device_count(self.restaurant.id), 1)
        self.assertNotEqual(unused_device.id, live_order_device.id)

    def test_delivered_order_does_not_keep_table_active(self):
        Order.objects.create(
            restaurant=self.restaurant,
            device=self.device,
            guest_session=self.session,
            status="delivered",
            payment_status="paid",
            total_price="24.00",
            amount_paid="24.00",
        )
        GuestSession.objects.filter(pk=self.session.pk).update(
            last_seen_at=timezone.now() - timedelta(minutes=31),
        )

        expired = expire_inactive_guest_sessions([self.restaurant.id])

        self.session.refresh_from_db()
        self.assertEqual(expired, 1)
        self.assertFalse(self.session.is_active)
        self.assertEqual(occupied_device_count(self.restaurant.id), 0)


class ReservationDeletionRegressionTests(IssueRegressionFixture):
    def test_owner_can_delete_reservation(self):
        reservation = Reservation.objects.create(
            customer_name="Delete Me",
            device=self.device,
            restaurant=self.restaurant,
            table_name=self.device.table_name,
            guest_no=2,
            cell_number="+971500000002",
            reservation_time=timezone.now() + timedelta(days=1),
            status="confirmed",
        )
        self.client.force_authenticate(self.owner)

        response = self.client.delete(f"/owners/reservations/{reservation.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Reservation.objects.filter(pk=reservation.id).exists())


class UpsellToneAndPairingRegressionTests(IssueRegressionFixture):
    def test_premium_and_minimal_tones_are_applied_to_final_copy(self):
        setting = UpsellSetting.objects.create(restaurant=self.restaurant, tone="premium")
        self.assertEqual(
            apply_suggestion_tone(setting, self.item, "Generic model response"),
            "Complete your selection with Truffle Pasta.",
        )

        setting.tone = "minimal"
        self.assertEqual(
            apply_suggestion_tone(setting, self.item, "Generic model response"),
            "Add Truffle Pasta? +AED 40.00",
        )

    def test_pairing_intelligence_does_not_manufacture_reverse_pairing(self):
        target = Item.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            item_name="Sparkling Water",
            slug="sparkling-water-25-40",
            description="Water",
            price="8.00",
        )
        for _ in range(2):
            order = Order.objects.create(
                restaurant=self.restaurant,
                device=self.device,
                status="completed",
                payment_status="paid",
                total_price="48.00",
            )
            OrderItem.objects.create(order=order, item=self.item, quantity=1, price=self.item.price)
            OrderItem.objects.create(order=order, item=target, quantity=1, price=target.price)

        _compute_pairing_intelligence(self.restaurant)

        self.assertTrue(ItemAssociation.objects.filter(
            restaurant=self.restaurant,
            source_item=self.item,
            target_item=target,
        ).exists())
        self.assertFalse(ItemAssociation.objects.filter(
            restaurant=self.restaurant,
            source_item=target,
            target_item=self.item,
        ).exists())
