from django.core.management.base import BaseCommand

from restaurant.models import Restaurant

from order.upsell import warm_restaurant_upsell_intelligence


class Command(BaseCommand):
    help = "Precompute versioned menu intelligence used by the AI upsell shortlist."

    def add_arguments(self, parser):
        parser.add_argument("--restaurant-id", type=int, default=None)

    def handle(self, *args, **options):
        restaurants = Restaurant.objects.filter(items__isnull=False).distinct().order_by("id")
        restaurant_id = options.get("restaurant_id")
        if restaurant_id:
            restaurants = restaurants.filter(id=restaurant_id)

        warmed = 0
        item_count = 0
        for restaurant in restaurants.iterator():
            intelligence = warm_restaurant_upsell_intelligence(restaurant.id)
            if not intelligence:
                continue
            warmed += 1
            item_count += len(intelligence.get("available_item_ids", []))

        self.stdout.write(
            self.style.SUCCESS(
                f"Warmed upsell intelligence for {warmed} restaurants and {item_count} available items."
            )
        )
