from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import ChefStaff, User
from device.models import Device
from restaurant.models import Restaurant

from .models import Order


class OrderWalkInTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="walk-in-owner@example.com",
            username="Walk In Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Walk In Restaurant",
            location="Dubai",
            phone_number="+971500000811",
            owner=self.owner,
        )
        self.device = Device.objects.create(
            table_name="Table 5",
            restaurant=self.restaurant,
            user=self.owner,
        )
        self.order = Order.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            status="pending",
            payment_status="unpaid",
            total_price="22.00",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_owner_can_mark_and_unmark_only_the_walk_in_field(self):
        original_status = self.order.status
        original_payment_status = self.order.payment_status

        response = self.client.patch(
            f"/api/orders/{self.order.id}/walk-in",
            {"isWalkIn": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["isWalkIn"])
        self.assertTrue(response.data["is_walk_in"])
        self.order.refresh_from_db()
        self.assertTrue(self.order.is_walk_in)
        self.assertEqual(self.order.status, original_status)
        self.assertEqual(self.order.payment_status, original_payment_status)

        response = self.client.patch(
            f"/api/orders/{self.order.id}/walk-in",
            {"isWalkIn": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_walk_in)

    def test_walk_in_requires_a_boolean(self):
        response = self.client.patch(
            f"/api/orders/{self.order.id}/walk-in",
            {"isWalkIn": "true"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_walk_in)

    def test_active_walk_in_count_is_returned_for_owner_and_staff(self):
        self.order.is_walk_in = True
        self.order.save(update_fields=["is_walk_in"])
        completed = Order.objects.create(
            device=self.device,
            restaurant=self.restaurant,
            status="delivered",
            payment_status="paid",
            is_walk_in=True,
            total_price="12.00",
        )

        owner_response = self.client.get("/owners/orders/")
        self.assertEqual(owner_response.status_code, 200)
        self.assertEqual(owner_response.data["results"]["stats"]["walk_ins"], 1)

        staff = User.objects.create_user(
            email="walk-in-staff@example.com",
            username="Walk In Staff",
            password="test-password",
            role="staff",
        )
        ChefStaff.objects.create(
            restaurant=self.restaurant,
            user=staff,
            action="active",
        )
        self.client.force_authenticate(staff)
        staff_response = self.client.get("/api/staff/orders/")
        self.assertEqual(staff_response.status_code, 200)
        self.assertEqual(staff_response.data["results"]["stats"]["walk_ins"], 1)
        self.assertTrue(completed.is_walk_in)

    def test_user_from_another_restaurant_cannot_change_the_marker(self):
        other_owner = User.objects.create_user(
            email="walk-in-other@example.com",
            username="Other Owner",
            password="test-password",
            role="owner",
        )
        Restaurant.objects.create(
            resturent_name="Other Restaurant",
            location="Dubai",
            phone_number="+971500000812",
            owner=other_owner,
        )
        self.client.force_authenticate(other_owner)

        response = self.client.patch(
            f"/api/orders/{self.order.id}/walk-in",
            {"isWalkIn": True},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_walk_in)
