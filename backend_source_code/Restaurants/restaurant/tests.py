from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from restaurant.models import BrandConfig, Restaurant


class BrandConfigPaymentTimingTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="payment-settings-owner@example.com",
            username="Payment Settings Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Payment Settings Restaurant",
            location="Dubai",
            phone_number="+971500001234",
            owner=self.owner,
        )
        self.config = BrandConfig.objects.create(
            restaurant=self.restaurant,
            restaurant_name="Configured Restaurant",
            primary_color="#123456",
            pay_before_order=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_partial_payment_timing_update_preserves_branding(self):
        response = self.client.put(
            "/api/brand-config/",
            {"payBeforeOrder": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.config.refresh_from_db()
        self.assertTrue(self.config.pay_before_order)
        self.assertEqual(self.config.restaurant_name, "Configured Restaurant")
        self.assertEqual(self.config.primary_color, "#123456")
        self.assertTrue(response.json()["payBeforeOrder"])

    def test_public_config_returns_payment_timing(self):
        self.config.pay_before_order = True
        self.config.save(update_fields=["pay_before_order"])

        self.client.force_authenticate(user=None)
        response = self.client.get(
            "/api/brand-config/",
            {"restaurant_id": self.restaurant.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["payBeforeOrder"])
