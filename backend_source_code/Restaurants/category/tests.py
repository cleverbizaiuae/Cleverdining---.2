from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from restaurant.models import Restaurant

from .models import Category


class CategoryOrderingTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="category-order-owner@example.com",
            username="Category Order Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Category Order Restaurant",
            location="Dubai",
            phone_number="+971500001111",
            owner=self.owner,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def create_category(self, name, display_order, parent=None):
        return Category.objects.create(
            restaurant=self.restaurant,
            Category_name=name,
            slug=name.lower().replace(" ", "-"),
            display_order=display_order,
            parent_category=parent,
        )

    def ordered_ids(self, parent=None):
        return list(
            Category.objects.filter(
                restaurant=self.restaurant,
                parent_category=parent,
            )
            .order_by("display_order", "id")
            .values_list("id", flat=True)
        )

    def test_owner_can_move_top_level_category_up(self):
        first = self.create_category("Starters", 0)
        second = self.create_category("Mains", 1)
        third = self.create_category("Desserts", 2)

        response = self.client.post(
            f"/owners/categories/{second.id}/move/",
            {"direction": "up"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(self.ordered_ids(), [second.id, first.id, third.id])

    def test_move_rejects_invalid_direction(self):
        category = self.create_category("Starters", 0)

        response = self.client.post(
            f"/owners/categories/{category.id}/move/",
            {"direction": "sideways"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("direction", response.json())

    def test_subcategory_move_is_limited_to_its_parent(self):
        drinks = self.create_category("Drinks", 0)
        desserts = self.create_category("Desserts", 1)
        hot = self.create_category("Hot Drinks", 0, drinks)
        cold = self.create_category("Cold Drinks", 1, drinks)
        cakes = self.create_category("Cakes", 0, desserts)
        ice_cream = self.create_category("Ice Cream", 1, desserts)

        response = self.client.post(
            f"/owners/sub-categories/{cold.id}/move/",
            {"direction": "up"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(self.ordered_ids(drinks), [cold.id, hot.id])
        self.assertEqual(self.ordered_ids(desserts), [cakes.id, ice_cream.id])
