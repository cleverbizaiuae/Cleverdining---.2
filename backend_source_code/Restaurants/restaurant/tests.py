from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from category.models import Category
from item.models import Item
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


class NewRestaurantMenuIsolationTests(TestCase):
    def setUp(self):
        self.existing_owner = User.objects.create_user(
            email="existing-menu-owner@example.com",
            username="Existing Menu Owner",
            password="test-password",
            role="owner",
        )
        self.existing_restaurant = Restaurant.objects.create(
            resturent_name="Existing Menu Restaurant",
            location="Dubai",
            phone_number="+971500001235",
            owner=self.existing_owner,
        )
        self.existing_category = Category.objects.create(
            restaurant=self.existing_restaurant,
            Category_name="Mains",
            slug="mains",
        )
        self.existing_subcategory = Category.objects.create(
            restaurant=self.existing_restaurant,
            Category_name="Burgers",
            slug="burgers",
            parent_category=self.existing_category,
        )
        Item.objects.create(
            item_name="House Burger",
            price="42.00",
            description="Restaurant-specific test item",
            slug="house-burger",
            category=self.existing_category,
            sub_category=self.existing_subcategory,
            restaurant=self.existing_restaurant,
        )
        self.client = APIClient()

    def register_new_restaurant(self):
        response = self.client.post(
            "/owners/register/",
            {
                "email": "empty-menu-owner@example.com",
                "password": "test-password",
                "username": "Empty Menu Owner",
                "resturent_name": "Empty Menu Restaurant",
                "location": "Dubai",
                "phone_number": "+971500009999",
                "region": "UAE",
                "country": "UAE",
                "city": "Dubai",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.json())
        owner = User.objects.get(email="empty-menu-owner@example.com")
        return owner, owner.restaurants.get()

    def test_registration_creates_no_categories_subcategories_or_items(self):
        _, restaurant = self.register_new_restaurant()

        self.assertFalse(Category.objects.filter(restaurant=restaurant).exists())
        self.assertFalse(
            Category.objects.filter(restaurant=restaurant, level__gt=0).exists()
        )
        self.assertFalse(Item.objects.filter(restaurant=restaurant).exists())

    def test_super_admin_registration_creates_an_empty_menu(self):
        response = self.client.post(
            "/owners/registered-restaurants/",
            {
                "owner_name": "Admin Created Owner",
                "email": "admin-created-owner@example.com",
                "password": "test-password",
                "resturent_name": "Admin Created Restaurant",
                "location": "Dubai",
                "phone_number": "+971500009998",
                "region": "UAE",
                "country": "UAE",
                "city": "Dubai",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.json())
        restaurant = Restaurant.objects.get(
            owner__email="admin-created-owner@example.com"
        )
        self.assertFalse(Category.objects.filter(restaurant=restaurant).exists())
        self.assertFalse(Item.objects.filter(restaurant=restaurant).exists())

    def test_new_owner_menu_endpoints_do_not_return_another_restaurants_menu(self):
        owner, _ = self.register_new_restaurant()
        self.client.force_authenticate(owner)

        categories_response = self.client.get("/owners/categories/")
        subcategories_response = self.client.get("/owners/sub-categories/")
        items_response = self.client.get("/owners/items/")

        self.assertEqual(categories_response.status_code, 200)
        self.assertEqual(categories_response.json(), [])
        self.assertEqual(subcategories_response.status_code, 200)
        self.assertEqual(subcategories_response.json(), [])
        self.assertEqual(items_response.status_code, 200)
        items_payload = items_response.json()
        if isinstance(items_payload, dict):
            self.assertEqual(items_payload.get("count"), 0)
            self.assertEqual(items_payload.get("results"), [])
        else:
            self.assertEqual(items_payload, [])
