"""Ireland (EUR) and Ghana (GHS) region support.

Also pins down that UAE and UK behaviour is unchanged.
"""

from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from accounts.models import User
from payment.adapters import _order_country_alpha2, _order_currency
from restaurant.models import Restaurant
from restaurant.region_config import (
    DEFAULT_REGION,
    SUPPORTED_REGIONS,
    UnsupportedRegionError,
    get_region_config,
    infer_region,
    normalize_region,
    require_supported_region,
    resolve_region_defaults,
)


class RegionConfigTests(SimpleTestCase):
    def test_ireland_settings(self):
        config = get_region_config("IE")
        self.assertEqual(config["currency"], "EUR")
        self.assertEqual(config["timezone"], "Europe/Dublin")
        self.assertEqual(config["country_code"], "+353")
        self.assertEqual(config["country_alpha2"], "IE")
        self.assertEqual(config["locale"], "en-IE")
        self.assertEqual(config["default_payment_provider"], "stripe")
        self.assertNotIn("payme", config["payments"])
        self.assertNotIn("paytabs", config["payments"])

    def test_ghana_settings(self):
        config = get_region_config("GH")
        self.assertEqual(config["currency"], "GHS")
        self.assertEqual(config["timezone"], "Africa/Accra")
        self.assertEqual(config["country_code"], "+233")
        self.assertEqual(config["country_alpha2"], "GH")
        self.assertEqual(config["locale"], "en-GH")
        self.assertEqual(config["payments"], ["stripe", "cash"])

    def test_existing_regions_unchanged(self):
        uae = get_region_config("UAE")
        self.assertEqual(
            (uae["currency"], uae["timezone"], uae["country_code"], uae["payments"]),
            ("AED", "Asia/Dubai", "+971", ["stripe", "checkout", "paytabs", "cash"]),
        )
        uk = get_region_config("UK")
        self.assertEqual(
            (uk["currency"], uk["timezone"], uk["country_code"], uk["payments"]),
            ("GBP", "Europe/London", "+44", ["stripe", "checkout", "payme", "cash"]),
        )
        self.assertEqual(DEFAULT_REGION, "UAE")

    def test_every_region_matches_model_choices(self):
        choice_codes = {code for code, _ in Restaurant.REGION_CHOICES}
        self.assertEqual(choice_codes, set(SUPPORTED_REGIONS))

    def test_country_and_city_aliases(self):
        for value in ["Ireland", "IE", "IRL", "Republic of Ireland", "Éire", "Dublin", "cork"]:
            self.assertEqual(infer_region(country=value), "IE", value)
        for value in ["Ghana", "GH", "GHA", "Accra", "kumasi"]:
            self.assertEqual(infer_region(country=value), "GH", value)
        # Northern Ireland is part of the UK, not Ireland.
        self.assertEqual(infer_region(country="Northern Ireland"), "UK")
        self.assertEqual(infer_region(country="Belfast"), "UK")

    def test_currency_inference(self):
        self.assertEqual(infer_region(currency="EUR"), "IE")
        self.assertEqual(infer_region(currency="ghs"), "GH")
        self.assertEqual(infer_region(currency="GBP"), "UK")
        self.assertEqual(infer_region(currency="AED"), "UAE")

    def test_read_paths_keep_uae_fallback_for_legacy_rows(self):
        self.assertEqual(normalize_region(None), "UAE")
        self.assertEqual(normalize_region(""), "UAE")
        self.assertEqual(normalize_region("XX"), "UAE")
        self.assertEqual(normalize_region("ie"), "IE")
        self.assertEqual(normalize_region("gh"), "GH")

    def test_strict_resolver_rejects_unknown_countries(self):
        self.assertEqual(require_supported_region(region="Ireland"), "IE")
        self.assertEqual(require_supported_region(country="Ghana"), "GH")
        self.assertEqual(require_supported_region(), "UAE")
        with self.assertRaises(UnsupportedRegionError):
            require_supported_region(region="Nigeria")
        with self.assertRaises(UnsupportedRegionError):
            require_supported_region(country="France")

    def test_resolve_region_defaults(self):
        defaults = resolve_region_defaults(region="GH")
        self.assertEqual(defaults["currency"], "GHS")
        self.assertEqual(defaults["country_code"], "+233")
        self.assertEqual(defaults["label"], "Ghana")

    def test_payment_country_and_currency_follow_region(self):
        for region, alpha2, currency in [
            ("UAE", "AE", "AED"),
            ("UK", "GB", "GBP"),
            ("IE", "IE", "EUR"),
            ("GH", "GH", "GHS"),
        ]:
            order = SimpleNamespace(restaurant=SimpleNamespace(region=region, currency=""))
            self.assertEqual(_order_country_alpha2(order), alpha2)
            self.assertEqual(_order_currency(order), currency)


class RegionRegistrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _register(self, email, phone, **extra):
        payload = {
            "email": email,
            "password": "test-password",
            "username": "Region Owner",
            "resturent_name": f"Restaurant {phone}",
            "location": "Main Street",
            "phone_number": phone,
        }
        payload.update(extra)
        return self.client.post("/owners/register/", payload, format="json")

    def test_owner_registration_in_ireland_uses_euros(self):
        response = self._register("ie-owner@example.com", "+353861234567", region="IE", city="Dublin")
        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(owner__email="ie-owner@example.com")
        self.assertEqual(restaurant.region, "IE")
        self.assertEqual(restaurant.currency, "EUR")
        self.assertEqual(restaurant.timezone, "Europe/Dublin")
        self.assertEqual(restaurant.country_code, "+353")
        self.assertEqual(restaurant.country, "Ireland")
        self.assertEqual(restaurant.default_payment_provider, "stripe")

    def test_owner_registration_by_country_name_in_ghana(self):
        response = self._register("gh-owner@example.com", "+233241234567", country="Ghana", city="Accra")
        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(owner__email="gh-owner@example.com")
        self.assertEqual(restaurant.region, "GH")
        self.assertEqual(restaurant.currency, "GHS")
        self.assertEqual(restaurant.timezone, "Africa/Accra")
        self.assertEqual(restaurant.country_code, "+233")

    def test_unsupported_payment_processor_falls_back_to_region_default(self):
        response = self._register(
            "gh-paytabs@example.com", "+233241234568", region="GH", payment_processor="paytabs"
        )
        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(owner__email="gh-paytabs@example.com")
        self.assertEqual(restaurant.default_payment_provider, "stripe")

    def test_unknown_country_is_rejected_instead_of_becoming_aed(self):
        response = self._register("fr-owner@example.com", "+33612345678", country="France")
        self.assertEqual(response.status_code, 400)
        self.assertIn("region", response.json())
        self.assertFalse(User.objects.filter(email="fr-owner@example.com").exists())

    def test_uae_registration_is_unchanged(self):
        response = self._register("uae-owner@example.com", "+971500000111", region="UAE", country="UAE")
        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(owner__email="uae-owner@example.com")
        self.assertEqual(
            (restaurant.region, restaurant.currency, restaurant.timezone, restaurant.country_code, restaurant.country),
            ("UAE", "AED", "Asia/Dubai", "+971", "UAE"),
        )

    def test_registration_with_no_region_or_country_still_defaults_to_uae(self):
        response = self._register("legacy-owner@example.com", "+971500000112")
        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(owner__email="legacy-owner@example.com")
        self.assertEqual((restaurant.region, restaurant.currency), ("UAE", "AED"))

    def test_super_admin_creates_ghana_restaurant(self):
        response = self.client.post(
            "/owners/registered-restaurants/",
            {
                "owner_name": "Accra Owner",
                "email": "accra-owner@example.com",
                "password": "test-password",
                "resturent_name": "Accra Kitchen",
                "location": "Osu",
                "phone_number": "+233201234567",
                "region": "GH",
                "city": "Accra",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(owner__email="accra-owner@example.com")
        self.assertEqual((restaurant.region, restaurant.currency, restaurant.country), ("GH", "GHS", "Ghana"))

    def test_super_admin_create_rejects_unknown_region(self):
        response = self.client.post(
            "/owners/registered-restaurants/",
            {
                "owner_name": "Unknown Owner",
                "email": "unknown-region@example.com",
                "password": "test-password",
                "resturent_name": "Unknown Kitchen",
                "location": "Somewhere",
                "phone_number": "+10000000001",
                "region": "XX",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Restaurant.objects.filter(owner__email="unknown-region@example.com").exists())


class SuperAdminRegionUpdateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        owner = User.objects.create_user(
            email="move-owner@example.com",
            username="Move Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Moving Restaurant",
            location="Dubai",
            phone_number="+971500009111",
            owner=owner,
        )

    def test_switching_region_to_ireland_updates_currency_timezone_and_code(self):
        response = self.client.patch(
            f"/owners/registered-restaurants/{self.restaurant.id}/",
            {"region": "IE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.json())
        self.restaurant.refresh_from_db()
        self.assertEqual(
            (self.restaurant.region, self.restaurant.currency, self.restaurant.timezone, self.restaurant.country_code),
            ("IE", "EUR", "Europe/Dublin", "+353"),
        )

    def test_unknown_region_is_rejected_and_restaurant_unchanged(self):
        response = self.client.patch(
            f"/owners/registered-restaurants/{self.restaurant.id}/",
            {"region": "Narnia"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.restaurant.refresh_from_db()
        self.assertEqual((self.restaurant.region, self.restaurant.currency), ("UAE", "AED"))

    def test_region_filter_accepts_new_regions(self):
        Restaurant.objects.filter(pk=self.restaurant.pk).update(region="GH", currency="GHS")
        response = self.client.get("/owners/registered-restaurants/?region=GH")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()], [str(self.restaurant.id)])
        response = self.client.get("/owners/registered-restaurants/?region=IE")
        self.assertEqual(response.json(), [])
