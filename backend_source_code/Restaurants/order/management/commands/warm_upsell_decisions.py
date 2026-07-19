from concurrent.futures import ThreadPoolExecutor, as_completed

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from item.models import Item
from restaurant.models import Restaurant

from order.models import UpsellLLMDecision
from order.upsell_precompute import precompute_source_item_upsell_batch


class Command(BaseCommand):
    help = "Precompute persistent LLM upsell decisions for available menu items."

    def add_arguments(self, parser):
        parser.add_argument("--restaurant-id", type=int, default=None)
        parser.add_argument("--workers", type=int, default=2)
        parser.add_argument("--batch-size", type=int, default=6)
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

        workers = max(1, min(int(options.get("workers") or 2), 2))
        batch_size = max(2, min(int(options.get("batch_size") or 6), 10))
        force_refresh = bool(options.get("force"))
        batches = []
        for current_restaurant_id in sorted({restaurant_id for restaurant_id, _ in jobs}):
            item_ids = [
                item_id
                for restaurant_id, item_id in jobs
                if restaurant_id == current_restaurant_id
            ]
            batches.extend(
                (current_restaurant_id, item_ids[index : index + batch_size])
                for index in range(0, len(item_ids), batch_size)
            )
        counts = {}
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="upsell-llm-warm") as executor:
            futures = {
                executor.submit(
                    precompute_source_item_upsell_batch,
                    restaurant_id,
                    item_ids,
                    force_refresh=force_refresh,
                ): (restaurant_id, item_ids)
                for restaurant_id, item_ids in batches
            }
            for future in as_completed(futures):
                batch_result = future.result()
                for result in batch_result.get("results") or []:
                    result_status = str(result.get("status") or "unknown")
                    counts[result_status] = counts.get(result_status, 0) + 1

        summary = ", ".join(f"{key}={value}" for key, value in sorted(counts.items()))
        self.stdout.write(
            self.style.SUCCESS(
                f"Warmed {len(jobs)} item decisions in {len(batches)} batches: {summary}"
            )
        )
