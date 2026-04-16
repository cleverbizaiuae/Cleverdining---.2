from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Dict, Iterable, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from category.models import Category
from item.models import Item
from order.models import Cart, UpsellRule, UpsellSetting
from core.region_config import normalize_region


CATEGORY_KEYWORDS = {
    "main": {
        "main",
        "burger",
        "pizza",
        "pasta",
        "sandwich",
        "steak",
        "entree",
        "meal",
        "biryani",
    },
    "drinks": {
        "drink",
        "beverage",
        "juice",
        "soda",
        "coffee",
        "tea",
        "shake",
        "mocktail",
        "water",
    },
    "starters": {
        "starter",
        "appetizer",
        "snack",
        "side",
        "fries",
        "nachos",
    },
    "desserts": {
        "dessert",
        "cake",
        "ice cream",
        "sweet",
        "brownie",
        "pastry",
    },
}

PAIRING_BY_ROLE = {
    "main": {"drinks", "starters", "desserts"},
    "drinks": {"main", "desserts"},
    "starters": {"main", "drinks"},
    "desserts": {"drinks", "main"},
}

HIGH_CART_DESSERT_THRESHOLD_BY_REGION = {
    "UAE": Decimal("45.00"),
    "UK": Decimal("30.00"),
}

TRIGGER_TO_SETTING_FIELD = {
    "add_to_cart": "show_after_add_to_cart",
    "cart": "show_in_cart",
    "before_payment": "show_before_payment",
}


@dataclass
class SessionSignals:
    category_declines: Dict[int, int]
    category_views: Dict[int, int]
    recently_removed_category_ids: Set[int]


def _normalize_text(value: Optional[str]) -> str:
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


def _parse_id_counts(raw: Optional[str]) -> Dict[int, int]:
    if not raw:
        return {}
    parsed: Dict[int, int] = {}
    for chunk in str(raw).split(","):
        item = chunk.strip()
        if not item:
            continue
        if ":" in item:
            category_id_raw, count_raw = item.split(":", 1)
            try:
                parsed[int(category_id_raw)] = max(0, int(count_raw))
            except (TypeError, ValueError):
                continue
        else:
            try:
                parsed[int(item)] = 1
            except (TypeError, ValueError):
                continue
    return parsed


def _parse_id_set(raw: Optional[str]) -> Set[int]:
    if not raw:
        return set()
    ids: Set[int] = set()
    for chunk in str(raw).split(","):
        item = chunk.strip()
        if not item:
            continue
        try:
            ids.add(int(item))
        except (TypeError, ValueError):
            continue
    return ids


def _parse_signals(raw_signals: Optional[Dict]) -> SessionSignals:
    if not isinstance(raw_signals, dict):
        raw_signals = {}
    return SessionSignals(
        category_declines={int(k): int(v) for k, v in raw_signals.get("category_declines", {}).items() if str(k).isdigit()},
        category_views={int(k): int(v) for k, v in raw_signals.get("category_views", {}).items() if str(k).isdigit()},
        recently_removed_category_ids={int(v) for v in raw_signals.get("recently_removed_category_ids", []) if str(v).isdigit()},
    )


def _parse_prioritized_category_ids(setting: UpsellSetting) -> Set[int]:
    values = [chunk.strip() for chunk in (setting.prioritized_categories or "").split(",")]
    result: Set[int] = set()
    for value in values:
        if not value:
            continue
        try:
            result.add(int(value))
        except ValueError:
            continue
    return result


def _derive_role_categories(restaurant_id: int, setting: UpsellSetting) -> Dict[str, Set[int]]:
    roles: Dict[str, Set[int]] = {
        "main": set(),
        "drinks": set(),
        "desserts": set(),
        "starters": set(),
    }

    override_map = setting.category_role_map or {}
    for role in roles:
        raw_values = override_map.get(role) if isinstance(override_map, dict) else None
        if isinstance(raw_values, list):
            for value in raw_values:
                try:
                    roles[role].add(int(value))
                except (TypeError, ValueError):
                    continue

    categories = Category.objects.filter(restaurant_id=restaurant_id).values("id", "Category_name")
    for category in categories:
        category_name = _normalize_text(category["Category_name"])
        category_id = int(category["id"])
        for role, keywords in CATEGORY_KEYWORDS.items():
            if any(keyword in category_name for keyword in keywords):
                roles[role].add(category_id)
    return roles


def _item_roles(item: Item, role_categories: Dict[str, Set[int]]) -> Set[str]:
    roles: Set[str] = set()
    category_id = getattr(item, "category_id", None)
    sub_category_id = getattr(item, "sub_category_id", None)

    for role, category_ids in role_categories.items():
        if category_id in category_ids or (sub_category_id and sub_category_id in category_ids):
            roles.add(role)

    if roles:
        return roles

    blob = _item_search_blob(item)
    for role, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in blob for keyword in keywords):
            roles.add(role)
    return roles


def _detect_stage(has_main: bool, has_drink: bool) -> str:
    if not has_main:
        return "building"
    if has_main and has_drink:
        return "complete"
    return "balanced"


def _gap_priority(stage: str, has_main: bool, has_drink: bool, has_starter: bool, has_dessert: bool, cart_total: Decimal, dessert_threshold: Decimal) -> List[str]:
    if stage == "building":
        return ["main", "drinks", "starters", "desserts"]

    if stage == "balanced":
        gaps: List[str] = []
        if not has_drink:
            gaps.append("drinks")
        if not has_starter:
            gaps.append("starters")
        if cart_total >= dessert_threshold and not has_dessert:
            gaps.append("desserts")
        if not has_main:
            gaps.append("main")
        return gaps or ["drinks", "desserts", "starters"]

    # complete
    gaps = []
    if cart_total >= dessert_threshold and not has_dessert:
        gaps.append("desserts")
    if not has_starter:
        gaps.append("starters")
    if not has_drink:
        gaps.append("drinks")
    return gaps or ["desserts", "drinks", "starters"]


def _flatten_cart_sources(cart_items: Iterable) -> List[Item]:
    return [cart_item.item for cart_item in cart_items if getattr(cart_item, "item", None)]


def _reason_for_top_factor(reasons: Dict[str, int], setting: UpsellSetting) -> str:
    if not reasons:
        return "You might like this add-on."

    top_reason = max(reasons.items(), key=lambda pair: pair[1])[0]
    tone = setting.tone
    messages = {
        "gap": {
            "friendly": "Your meal is missing this pairing.",
            "professional": "Recommended to complete this order.",
            "playful": "A perfect add-on for your plate.",
        },
        "pair": {
            "friendly": "Guests often pair these together.",
            "professional": "Commonly purchased together.",
            "playful": "This combo is a fan favorite.",
        },
        "time": {
            "friendly": "A great pick for this time of day.",
            "professional": "Optimized for current service period.",
            "playful": "This hits different right now.",
        },
        "price": {
            "friendly": "A quick add-on without stretching your total.",
            "professional": "Fits your current cart value range.",
            "playful": "Small upgrade, big satisfaction.",
        },
        "priority": {
            "friendly": "Chef-recommended for this table.",
            "professional": "Prioritized by your restaurant settings.",
            "playful": "Featured pick from this menu.",
        },
        "default": {
            "friendly": "You might like this add-on.",
            "professional": "Suggested item for this order.",
            "playful": "Want to add this too?",
        },
    }
    return messages.get(top_reason, messages["default"]).get(tone, messages["default"]["friendly"])


def _current_hour_for_restaurant(tz_name: str) -> int:
    try:
        current = timezone.localtime(timezone.now(), timezone=ZoneInfo(tz_name))
        return int(current.hour)
    except Exception:
        return int(datetime.utcnow().hour)


def _strategy_bonus(setting: UpsellSetting, candidate_price: Decimal, cart_total: Decimal) -> int:
    if cart_total <= 0:
        return 0
    ratio = candidate_price / cart_total

    if setting.strategy == "margin":
        return 8 if ratio >= Decimal("0.35") else 0
    if setting.strategy == "volume":
        return 8 if ratio <= Decimal("0.25") else 0
    return 0


def _active_manual_rules(restaurant_id: int) -> Tuple[Dict[int, Set[int]], Dict[int, Set[int]]]:
    pair_rules: Dict[int, Set[int]] = {}
    block_rules: Dict[int, Set[int]] = {}
    rules = UpsellRule.objects.filter(restaurant_id=restaurant_id, is_active=True).values(
        "type", "source_item_id", "target_item_id"
    )
    for rule in rules:
        source_item_id = int(rule["source_item_id"])
        target_item_id = int(rule["target_item_id"])
        if rule["type"] == "pair":
            pair_rules.setdefault(source_item_id, set()).add(target_item_id)
        elif rule["type"] == "block":
            block_rules.setdefault(source_item_id, set()).add(target_item_id)
    return pair_rules, block_rules


def build_cart_upsell_suggestions(
    cart: Cart,
    *,
    limit: int = 4,
    trigger_point: str = "cart",
    source_item_id: Optional[int] = None,
    session_signals: Optional[Dict] = None,
) -> List[Dict]:
    """
    Production scoring engine that adapts to region, session behavior, and manual rules.
    """
    limit = max(1, min(limit, 10))
    restaurant = cart.device.restaurant
    setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)

    if not setting.enabled:
        return []
    trigger_field = TRIGGER_TO_SETTING_FIELD.get(trigger_point)
    if trigger_field and not getattr(setting, trigger_field, True):
        return []

    cart_items = list(cart.items.select_related("item__category", "item__sub_category").all())
    if not cart_items:
        return []

    signals = _parse_signals(session_signals)
    role_categories = _derive_role_categories(restaurant.id, setting)
    prioritized_categories = _parse_prioritized_category_ids(setting)
    pair_rules, block_rules = _active_manual_rules(restaurant.id)

    cart_item_ids = {cart_item.item_id for cart_item in cart_items}
    cart_source_items = _flatten_cart_sources(cart_items)
    trigger_source_item = next((item for item in cart_source_items if item.id == source_item_id), None)
    if not trigger_source_item:
        trigger_source_item = cart_source_items[-1] if cart_source_items else None

    available_items = list(
        Item.objects.select_related("category", "sub_category")
        .filter(restaurant=restaurant, availability=True)
        .exclude(id__in=cart_item_ids)
        .order_by("item_name")
    )
    if not available_items:
        return []

    # Cart role state.
    cart_role_set: Set[str] = set()
    for cart_item in cart_source_items:
        cart_role_set.update(_item_roles(cart_item, role_categories))
    has_main = "main" in cart_role_set
    has_drink = "drinks" in cart_role_set
    has_starter = "starters" in cart_role_set
    has_dessert = "desserts" in cart_role_set

    stage = _detect_stage(has_main, has_drink)
    region = normalize_region(getattr(restaurant, "region", None))
    cart_total = _cart_total(cart)
    dessert_threshold = HIGH_CART_DESSERT_THRESHOLD_BY_REGION.get(region, Decimal("45.00"))
    gaps = _gap_priority(stage, has_main, has_drink, has_starter, has_dessert, cart_total, dessert_threshold)
    gap_rank = {role: index for index, role in enumerate(gaps)}

    hour = _current_hour_for_restaurant(getattr(restaurant, "timezone", "UTC"))
    source_roles = _item_roles(trigger_source_item, role_categories) if trigger_source_item else set()
    blocked_target_ids: Set[int] = set()
    pair_boost_targets: Set[int] = set()
    for source_item in cart_source_items:
        blocked_target_ids.update(block_rules.get(source_item.id, set()))
        pair_boost_targets.update(pair_rules.get(source_item.id, set()))

    results: List[Dict] = []

    for candidate in available_items:
        if source_item_id and candidate.id == source_item_id:
            continue
        if candidate.id in blocked_target_ids:
            continue

        candidate_roles = _item_roles(candidate, role_categories)
        if not candidate_roles:
            continue

        # Hard rule: no second main once meal already has a main.
        if has_main and "main" in candidate_roles:
            continue

        candidate_category_id = candidate.category_id
        decline_count = signals.category_declines.get(candidate_category_id, 0)
        decline_threshold = 3 if "drinks" in candidate_roles else 2
        if decline_count >= decline_threshold:
            continue

        score = 0
        reasons: Dict[str, int] = {}

        # 1) Gap fill (max 55)
        matching_gap_rank = min((gap_rank.get(role, 99) for role in candidate_roles), default=99)
        if matching_gap_rank == 0:
            score += 55
            reasons["gap"] = reasons.get("gap", 0) + 55
        elif matching_gap_rank == 1:
            score += 40
            reasons["gap"] = reasons.get("gap", 0) + 40
        elif matching_gap_rank == 2:
            score += 25
            reasons["gap"] = reasons.get("gap", 0) + 25

        # 2) Category pairing (max 20)
        if source_roles:
            pair_targets = set()
            for role in source_roles:
                pair_targets.update(PAIRING_BY_ROLE.get(role, set()))
            if candidate_roles.intersection(pair_targets):
                score += 20
                reasons["pair"] = reasons.get("pair", 0) + 20

        # 3) Subcategory pairing (max 14)
        if trigger_source_item and trigger_source_item.sub_category_id and candidate.sub_category_id:
            if trigger_source_item.sub_category_id == candidate.sub_category_id:
                score += 14
                reasons["pair"] = reasons.get("pair", 0) + 14

        # 4) Time of day (max 10)
        if 5 <= hour <= 11 and ("drinks" in candidate_roles):
            score += 10
            reasons["time"] = reasons.get("time", 0) + 10
        elif 17 <= hour <= 23 and ("drinks" in candidate_roles or "desserts" in candidate_roles):
            score += 10
            reasons["time"] = reasons.get("time", 0) + 10

        # 5) Price sweet spot (max 8)
        candidate_price = _effective_item_price(candidate)
        if cart_total > 0:
            ratio = candidate_price / cart_total
            if Decimal("0.10") <= ratio <= Decimal("0.45"):
                score += 8
                reasons["price"] = reasons.get("price", 0) + 8

        # 6) Browsing behavior (max 15)
        view_count = signals.category_views.get(candidate_category_id, 0)
        if view_count > 0:
            browsing_points = min(15, view_count * 5)
            score += browsing_points
            reasons["pair"] = reasons.get("pair", 0) + browsing_points

        # 7) Recently removed (max 8)
        if candidate_category_id in signals.recently_removed_category_ids:
            score += 8
            reasons["pair"] = reasons.get("pair", 0) + 8

        # 8) Decline penalty (-10 per decline)
        if decline_count > 0:
            score -= 10 * decline_count

        # Settings-driven boosts
        if candidate_category_id in prioritized_categories:
            score += 15
            reasons["priority"] = reasons.get("priority", 0) + 15

        if candidate.id in pair_boost_targets:
            score += 25
            reasons["pair"] = reasons.get("pair", 0) + 25

        score += _strategy_bonus(setting, candidate_price, cart_total)

        if score <= 0:
            continue

        results.append(
            {
                "item": candidate,
                "rule": stage,
                "message": _reason_for_top_factor(reasons, setting),
                "score": int(score),
                "stage": stage,
            }
        )

    if not results:
        return []

    results.sort(key=lambda row: row["score"], reverse=True)

    # Aggressiveness controls default output depth; caller `limit` still caps it.
    aggressive_limit = 2 if setting.aggressiveness == "aggressive" else 1
    effective_limit = min(limit, max(aggressive_limit, limit if trigger_point != "add_to_cart" else aggressive_limit))
    return results[:effective_limit]
