from django.core.management.base import BaseCommand

from category.models import Category
from item.models import Item
from item.pranay_menu import seed_pranay_menu
from restaurant.models import Restaurant


class Command(BaseCommand):
    help = "Idempotently add the curated production menu to Pranay's restaurant."

    def add_arguments(self, parser):
        parser.add_argument("--restaurant-id", type=int, default=8)
        parser.add_argument("--restaurant-name", default="Pranay")
        parser.add_argument("--refresh-images", action="store_true")

    def handle(self, *args, **options):
        restaurant_id = options["restaurant_id"]
        expected_name = options["restaurant_name"].strip()
        restaurant = Restaurant.objects.filter(pk=restaurant_id).first()
        if restaurant is None:
            self.stdout.write(
                self.style.WARNING(
                    f"Skipping Pranay menu: restaurant {restaurant_id} does not exist in this environment."
                )
            )
            return
        if restaurant.resturent_name.strip().casefold() != expected_name.casefold():
            self.stdout.write(
                self.style.WARNING(
                    f"Skipping Pranay menu for restaurant {restaurant_id}: expected {expected_name!r}, "
                    f"found {restaurant.resturent_name!r}."
                )
            )
            return

        result = seed_pranay_menu(
            restaurant,
            Category,
            Item,
            refresh_images=options["refresh_images"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Pranay menu ready: "
                f"{result['categories']} categories, {result['items']} items "
                f"({result['created_items']} created, {result['updated_items']} updated)."
            )
        )
