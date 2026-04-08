from __future__ import annotations

from decimal import Decimal
from typing import Dict, List

from django.db.models import Count

from item.models import Item
from order.models import Cart, OrderItem
from restaurant.models import Restaurant
from core.region_config import normalize_region


MAIN_KEYWORDS = {
    "main",
    "burger",
    "pizza",
    "pasta",
    "sandwich",
    "steak",
    "entree",
    "meal",
}

DRINK_KEYWORDS = {
    "drink",
    "beverage",
    "juice",
    "soda",
    "coffee",
    "tea",
    "shake",
    "mocktail",
    "water",
}

SIDE_KEYWORDS = {
    "side",
    "fries",
    "starter",
    "snack",
    "appetizer",
}

DESSERT_KEYWORDS = {
    "dessert",
    "cake",
    "ice cream",
    "sweet",
    "brownie",
    "pastry",
}


HIGH_CART_DESSERT_THRESHOLD_BY_REGION = {
    "UAE": Decimal("120.00"),
    "UK": Decimal("40.00"),
}


def _normalize_text(value: str | None) -> str:
    return (value or "").strip().lower()


def _item_search_blob(item: Item) -> str:
    raw_tags = getattr(item, "tags", []) or []
    tag_values = [str(tag) for tag in raw_tags if isinstance(tag, (str, int, float))]
    parts = [
        item.item_name,
        item.description,
        getattr(item.category, "Category_name", ""),
        getattr(item.sub_category, "Category_name", "") if item.sub_category else "",
        " ".join(tag_values),
    ]
    return " ".join(_normalize_text(part) for part in parts if part)


def _matches_keywords(item: Item, keywords: set[str]) -> bool:
    blob = _item_search_blob(item)
    return any(keyword in blob for keyword in keywords)


def _is_main(item: Item) -> bool:
    return _matches_keywords(item, MAIN_KEYWORDS)


def _is_drink(item: Item) -> bool:
    return _matches_keywords(item, DRINK_KEYWORDS)


def _is_side(item: Item) -> bool:
    return _matches_keywords(item, SIDE_KEYWORDS)


def _is_dessert(item: Item) -> bool:
    return _matches_keywords(item, DESSERT_KEYWORDS)


def _is_burger(item: Item) -> bool:
    return "burger" in _item_search_blob(item)


def _effective_item_price(item: Item) -> Decimal:
    price = item.price or Decimal("0")
    discount = item.discount_percentage or Decimal("0")
    if discount > 0:
        price = price - ((price * discount) / Decimal("100"))
    return price if price > 0 else Decimal("0")


def _cart_total(cart: Cart) -> Decimal:
    total = Decimal("0")
    for cart_item in cart.items.select_related("item").all():
        total += _effective_item_price(cart_item.item) * Decimal(cart_item.quantity)
    return total


def _category_candidates(
    items: List[Item],
    predicate,
    limit: int,
) -> List[Item]:
    selected: List[Item] = []
    for item in items:
        if predicate(item):
            selected.append(item)
        if len(selected) >= limit:
            break
    return selected


def _add_suggestion(
    suggestions: List[Dict],
    seen_ids: set[int],
    item: Item | None,
    *,
    rule: str,
    message: str,
    score: int,
) -> None:
    if not item or item.id in seen_ids:
        return
    seen_ids.add(item.id)
    suggestions.append(
        {
            "item": item,
            "rule": rule,
            "message": message,
            "score": score,
        }
    )


def _popular_pairings(restaurant: Restaurant, cart_item_ids: set[int], limit: int) -> List[int]:
    if not cart_item_ids:
        return []

    order_ids = (
        OrderItem.objects.filter(order__restaurant=restaurant, item_id__in=cart_item_ids)
        .values_list("order_id", flat=True)
        .distinct()
    )
    if not order_ids:
        return []

    paired = (
        OrderItem.objects.filter(order__restaurant=restaurant, order_id__in=order_ids)
        .exclude(item_id__in=cart_item_ids)
        .values("item_id")
        .annotate(order_count=Count("order_id", distinct=True))
        .filter(order_count__gte=2)
        .order_by("-order_count")[:limit]
    )
    return [entry["item_id"] for entry in paired]


def build_cart_upsell_suggestions(cart: Cart, *, limit: int = 4) -> List[Dict]:
    """
    Rule-based v1 upsell engine.
    Kept intentionally modular so it can be replaced by an AI recommender later.
    """
    limit = max(1, min(limit, 10))

    cart_items = list(cart.items.select_related("item__category", "item__sub_category").all())
    if not cart_items:
        return []

    restaurant = cart.device.restaurant
    cart_item_ids = {cart_item.item_id for cart_item in cart_items}

    available_items = list(
        Item.objects.select_related("category", "sub_category", "restaurant")
        .filter(restaurant=restaurant, availability=True)
        .exclude(id__in=cart_item_ids)
        .order_by("item_name")
    )
    if not available_items:
        return []

    available_by_id = {item.id: item for item in available_items}
    suggestions: List[Dict] = []
    seen_ids: set[int] = set()

    has_main = any(_is_main(cart_item.item) for cart_item in cart_items)
    has_drink = any(_is_drink(cart_item.item) for cart_item in cart_items)
    has_burger = any(_is_burger(cart_item.item) for cart_item in cart_items)

    # Rule 1: Main without drink -> suggest drink
    if has_main and not has_drink:
        for candidate in _category_candidates(available_items, _is_drink, limit=2):
            _add_suggestion(
                suggestions,
                seen_ids,
                candidate,
                rule="main_without_drink",
                message="Add a drink to complete your meal.",
                score=95,
            )

    # Rule 2: Burger -> suggest fries + drink
    if has_burger:
        fries_candidate = next((item for item in available_items if "fries" in _item_search_blob(item)), None)
        _add_suggestion(
            suggestions,
            seen_ids,
            fries_candidate,
            rule="burger_pairing",
            message="Most customers pair this with fries.",
            score=92,
        )
        drink_candidate = next((item for item in available_items if _is_drink(item)), None)
        _add_suggestion(
            suggestions,
            seen_ids,
            drink_candidate,
            rule="burger_pairing",
            message="Pair your burger with a drink.",
            score=90,
        )

    # Rule 3: High cart value -> suggest dessert
    region = normalize_region(getattr(restaurant, "region", None))
    threshold = HIGH_CART_DESSERT_THRESHOLD_BY_REGION.get(region, Decimal("100.00"))
    if _cart_total(cart) >= threshold:
        dessert_candidate = next((item for item in available_items if _is_dessert(item)), None)
        _add_suggestion(
            suggestions,
            seen_ids,
            dessert_candidate,
            rule="high_value_dessert",
            message="Finish with a dessert before checkout.",
            score=88,
        )

    # Rule 4: Frequently bought together
    for item_id in _popular_pairings(restaurant, cart_item_ids, limit=4):
        _add_suggestion(
            suggestions,
            seen_ids,
            available_by_id.get(item_id),
            rule="frequent_pairing",
            message="Often purchased together by other guests.",
            score=85,
        )

    # Fallback: suggest side items if no strong rule matched
    if not suggestions:
        for candidate in _category_candidates(available_items, _is_side, limit=2):
            _add_suggestion(
                suggestions,
                seen_ids,
                candidate,
                rule="fallback_side",
                message="You might like this add-on.",
                score=70,
            )

    return suggestions[:limit]
