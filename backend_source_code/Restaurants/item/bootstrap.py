import logging
import threading

from django.db import connection, transaction

from category.models import Category
from item.models import Item
from item.pranay_menu import PRANAY_MENU, seed_pranay_menu
from restaurant.models import Restaurant


logger = logging.getLogger(__name__)

_bootstrap_lock = threading.Lock()
_bootstrap_complete = False
_PRANAY_RESTAURANT_ID = 8
_PRANAY_PHONE = "17678060045"
_POSTGRES_LOCK_ID = 820260714


def ensure_pranay_production_menu():
    """Seed the verified production account once when Render skips release commands."""
    global _bootstrap_complete
    if _bootstrap_complete:
        return

    with _bootstrap_lock:
        if _bootstrap_complete:
            return
        try:
            with transaction.atomic():
                if connection.vendor == "postgresql":
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [_POSTGRES_LOCK_ID])

                restaurant = (
                    Restaurant.objects.select_for_update()
                    .filter(pk=_PRANAY_RESTAURANT_ID, phone_number=_PRANAY_PHONE)
                    .first()
                )
                if restaurant is None:
                    _bootstrap_complete = True
                    return

                expected_names = {
                    item_data[0]
                    for category_data in PRANAY_MENU
                    for item_data in category_data["items"]
                }
                present_names = set(
                    Item.objects.filter(
                        restaurant=restaurant,
                        item_name__in=expected_names,
                    ).values_list("item_name", flat=True)
                )
                if present_names != expected_names:
                    result = seed_pranay_menu(restaurant, Category, Item)
                    logger.info(
                        "Production menu bootstrap completed for restaurant %s: %s",
                        restaurant.pk,
                        result,
                    )
            _bootstrap_complete = True
        except Exception:
            # A menu bootstrap must never take the customer or manager app down.
            logger.exception("Production menu bootstrap failed; it will retry on the next request")

