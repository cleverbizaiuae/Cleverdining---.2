from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from customer.views import _customer_payload
from restaurant.exchange_rates import CACHE_KEY, platform_currencies
from restaurant.models import Restaurant


def _live_response(rates):
    response = mock.Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "result": "success",
        "base_code": "AED",
        "time_last_update_utc": "Tue, 24 Nov 2026 00:02:31 +0000",
        "rates": rates,
    }
    return response


class PlatformExchangeRatesTests(TestCase):
    def setUp(self):
        cache.delete(CACHE_KEY)
        self.client = APIClient()

    def tearDown(self):
        cache.delete(CACHE_KEY)

    def test_platform_currencies_follow_regions(self):
        self.assertEqual(platform_currencies(), ["AED", "GBP", "EUR", "GHS"])

    @mock.patch("restaurant.exchange_rates.requests.get")
    def test_live_rates_cover_every_platform_currency(self, mock_get):
        mock_get.return_value = _live_response(
            {"AED": 1, "GBP": 0.2101, "EUR": 0.2489, "GHS": 3.12, "USD": 0.2723}
        )
        response = self.client.get("/api/exchange-rates/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["base"], "AED")
        self.assertEqual(payload["currencies"], ["AED", "GBP", "EUR", "GHS"])
        self.assertEqual(payload["rates"], {"AED": 1.0, "GBP": 0.2101, "EUR": 0.2489, "GHS": 3.12})
        self.assertEqual(payload["approximate"], [])
        self.assertIn("ExchangeRate-API", payload["source"])

    @mock.patch("restaurant.exchange_rates.requests.get")
    def test_rates_are_cached(self, mock_get):
        mock_get.return_value = _live_response({"AED": 1, "GBP": 0.21, "EUR": 0.25, "GHS": 3.1})
        self.client.get("/api/exchange-rates/")
        self.client.get("/api/exchange-rates/")
        self.assertEqual(mock_get.call_count, 1)

    @mock.patch("restaurant.exchange_rates.requests.get", side_effect=OSError("offline"))
    def test_source_outage_falls_back_to_approximate_rates(self, _mock_get):
        response = self.client.get("/api/exchange-rates/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["source"], "fallback")
        self.assertEqual(payload["rates"]["AED"], 1.0)
        self.assertEqual(set(payload["approximate"]), {"GBP", "EUR", "GHS"})
        for code in ("GBP", "EUR", "GHS"):
            self.assertGreater(payload["rates"][code], 0)

    @mock.patch("restaurant.exchange_rates.requests.get")
    def test_missing_currency_uses_fallback_for_that_currency_only(self, mock_get):
        mock_get.return_value = _live_response({"AED": 1, "GBP": 0.21, "EUR": 0.25})
        payload = self.client.get("/api/exchange-rates/").json()
        self.assertEqual(payload["approximate"], ["GHS"])
        self.assertEqual(payload["rates"]["GBP"], 0.21)


class CrmCustomerCurrencyTests(TestCase):
    def test_customer_payload_carries_restaurant_currency(self):
        from customer.models import Customer

        owner = User.objects.create_user(
            email="crm-ie-owner@example.com", username="CRM IE", password="x", role="owner"
        )
        restaurant = Restaurant.objects.create(
            resturent_name="Dublin Bistro",
            location="Dublin",
            phone_number="+353861110000",
            owner=owner,
            region="IE",
            currency="EUR",
        )
        customer = Customer.objects.create(phone="+353861110001", name="Aoife", restaurant=restaurant)
        self.assertEqual(_customer_payload(customer)["currency"], "EUR")

        walk_in = Customer.objects.create(phone="+971500000999", name="No Restaurant")
        self.assertEqual(_customer_payload(walk_in)["currency"], "AED")
