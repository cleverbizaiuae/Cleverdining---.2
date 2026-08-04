from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import ChefStaff, User
from device.models import Device
from restaurant.models import BusinessDay, Restaurant

from .models import Order


class ManagerOrderHistoryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="order-history-owner@example.com",
            username="Order History Owner",
            password="test-password",
            role="owner",
        )
        self.manager = User.objects.create_user(
            email="order-history-manager@example.com",
            username="Order History Manager",
            password="test-password",
            role="manager",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Order History Restaurant",
            location="Dubai",
            phone_number="+971500008881",
            owner=self.owner,
        )
        ChefStaff.objects.create(
            restaurant=self.restaurant,
            user=self.manager,
            action="accepted",
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 1",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def test_starting_a_business_day_keeps_older_orders_in_manager_list(self):
        older_order = Order.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            status="delivered",
            payment_status="paid",
            total_price="42.00",
        )
        active_day = BusinessDay.objects.create(restaurant=self.restaurant)
        current_order = Order.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            business_day=active_day,
            status="pending",
            payment_status="unpaid",
            total_price="18.00",
        )

        response = self.client.get("/owners/orders/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            [order["id"] for order in payload["results"]["orders"]],
            [current_order.id, older_order.id],
        )
        self.assertEqual(payload["results"]["stats"]["total_completed_orders"], 1)
