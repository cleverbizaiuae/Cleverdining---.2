from concurrent.futures import ThreadPoolExecutor, as_completed

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from item.models import Item
from restaurant.models import Restaurant

from order.models import UpsellLLMDecision
from order.upsell_precompute import precompute_source_item_upsell


class Command(BaseCommand):
    help = "Precompute persistent LLM upsell decisions for available menu items."

    def add_arguments(self, parser):
        parser.add_argument("--restaurant-id", type=int, default=None)
        parser.add_argument("--workers", type=int, default=2)
        parser.add_argument("--force", action="store_true")

    def handle(self, *args, **options):
        if not bool(getattr(settings, "UPSELL_LLM_ENABLED", True)):
            self.stdout.write(self.style.WARNING("Upsell LLM is disabled; nothing to warm."))
            return

        UpsellLLMDecision.objects.filter(expires_at__lte=timezone.now()).delete()

        restaurants = Restaurant.objects.all().order_by("id")
        restaurant_id = options.get("restaurant_id")
        if restaurant_id:
            restaurants = restaurants.filter(id=restaurant_id)
        jobs = list(
            Item.objects.filter(
                restaurant_id__in=restaurants.values_list("id", flat=True),
                availability=True,
            )
            .order_by("restaurant_id", "id")
            .values_list("restaurant_id", "id")
        )
        if not jobs:
            self.stdout.write("No available menu items found.")
            return

        workers = max(1, min(int(options.get("workers") or 2), 4))
        force_refresh = bool(options.get("force"))
        counts = {}
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="upsell-llm-warm") as executor:
            futures = {
                executor.submit(
                    precompute_source_item_upsell,
                    restaurant_id,
                    item_id,
                    force_refresh=force_refresh,
                ): (restaurant_id, item_id)
                for restaurant_id, item_id in jobs
            }
            for future in as_completed(futures):
                result = future.result()
                result_status = str(result.get("status") or "unknown")
                counts[result_status] = counts.get(result_status, 0) + 1

        summary = ", ".join(f"{key}={value}" for key, value in sorted(counts.items()))
        self.stdout.write(self.style.SUCCESS(f"Warmed {len(jobs)} item decisions: {summary}"))
