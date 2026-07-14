import shutil
import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import User
from category.models import Category
from item.models import Item
from order.upsell import build_item_context_upsell_suggestions
from restaurant.models import Restaurant

from .pranay_menu import PRANAY_MENU


class PranayMenuSeedTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media_root = tempfile.mkdtemp()
        cls.settings_override = override_settings(MEDIA_ROOT=cls.media_root)
        cls.settings_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.settings_override.disable()
        shutil.rmtree(cls.media_root, ignore_errors=True)

    def setUp(self):
        self.owner = User.objects.create_user(
            email="pranay-menu-owner@example.com",
            username="Pranay Menu Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            id=8,
            resturent_name="Pranay",
            location="Dubai",
            phone_number="+971500008888",
            owner=self.owner,
        )

    def test_seed_creates_complete_menu_with_images_and_is_idempotent(self):
        call_command("seed_pranay_menu")
        call_command("seed_pranay_menu")

        seeded_names = [category["name"] for category in PRANAY_MENU]
        categories = Category.objects.filter(
            restaurant=self.restaurant,
            Category_name__in=seeded_names,
        )
        items = Item.objects.filter(
            restaurant=self.restaurant,
            category__in=categories,
        )

        self.assertEqual(categories.count(), 8)
        self.assertEqual(items.count(), 40)
        for category in categories:
            self.assertEqual(category.items.count(), 5)
            self.assertTrue(category.image)
            self.assertTrue(category.image.storage.exists(category.image.name))
        for item in items:
            self.assertTrue(item.availability)
            self.assertGreater(len(item.tags), 1)
            self.assertTrue(item.image1.storage.exists(item.image1.name))

    def test_balanced_menu_recommends_missing_meal_roles(self):
        call_command("seed_pranay_menu")
        burger = Item.objects.get(restaurant=self.restaurant, item_name="Classic Cheeseburger")
        drink = Item.objects.get(restaurant=self.restaurant, item_name="Classic Lemonade")

        after_burger = build_item_context_upsell_suggestions(
            self.restaurant,
            [burger.id],
            trigger_point="add_to_cart",
            source_item_id=burger.id,
            apply_surface_limit=False,
        )
        self.assertGreaterEqual(len(after_burger), 3)
        self.assertEqual(after_burger[0]["item"].category.category_type, "drink")
        self.assertNotIn("shake", after_burger[0]["item"].item_name.lower())
        self.assertTrue(all(row["item"].category.category_type != "main" for row in after_burger))
        self.assertLessEqual(
            sum("shake" in row["item"].item_name.lower() for row in after_burger[:4]),
            1,
        )
        self.assertTrue(all(row["item"].id != burger.id for row in after_burger))

        completed_drink = build_item_context_upsell_suggestions(
            self.restaurant,
            [burger.id, drink.id],
            trigger_point="cart",
            apply_surface_limit=False,
        )
        self.assertGreaterEqual(len(completed_drink), 2)
        self.assertTrue(
            all(row["item"].category.category_type in {"starter", "dessert", "other"} for row in completed_drink[:2])
        )
