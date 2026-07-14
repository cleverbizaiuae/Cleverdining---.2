from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Dict, Iterable, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from django.utils import timezone

from category.models import Category
from item.models import Item
from order.models import Cart, ItemAssociation, UpsellItemSetting, UpsellRule, UpsellSetting
from core.region_config import normalize_region
from .upsell_knowledge import (
    ROLE_ADDON,
    classify_cart_roles,
    classify_item_roles,
    default_knowledge_role_for_engine_role,
    get_gap_priority,
    infer_venue_type,
    knowledge_roles_to_engine_roles,
)


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
    "premium": {
        "cigar",
        "shisha",
        "hookah",
        "premium",
        "add-on",
        "addon",
    },
}

PAIRING_BY_ROLE = {
    "main": ("drinks", "desserts", "starters"),
    "drinks": ("main", "desserts"),
    "starters": ("main", "drinks"),
    "desserts": ("drinks", "main"),
    "premium": ("drinks", "starters"),
}

HIGH_CART_DESSERT_THRESHOLD_BY_REGION = {
    "UAE": Decimal("45.00"),
    "UK": Decimal("30.00"),
}

STARTER_CART_CEILING_BY_REGION = {
    "UAE": Decimal("150.00"),
    "UK": Decimal("150.00"),
}

TRIGGER_TO_SETTING_FIELD = {
    "add_to_cart": "show_after_add_to_cart",
    "cart": "show_in_cart",
    "before_payment": "show_before_payment",
}

FOOD_PROFILE_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "burger": ("burger", "cheeseburger", "slider"),
    "pizza": ("pizza", "margherita", "pepperoni"),
    "pasta": ("pasta", "spaghetti", "penne", "lasagne", "lasagna", "ravioli", "alfredo"),
    "sushi": ("sushi", "maki", "nigiri", "sashimi", "dragon roll", "california roll"),
    "steak": ("steak", "sirloin", "ribeye", "tenderloin", "filet", "fillet"),
    "chicken": ("chicken", "wings", "tender", "grilled chicken"),
    "fish": ("fish", "salmon", "cod", "seafood", "prawn", "shrimp"),
    "biryani": ("biryani", "mandi", "kabsa"),
    "salad_starter": ("salad", "caesar", "fattoush", "tabbouleh"),
    "starter": ("starter", "fries", "nachos", "wings", "mozzarella", "side", "appetizer"),
    "cola": ("cola", "coca", "coke", "pepsi"),
    "juice": ("juice", "lemonade", "orange", "apple", "fresh"),
    "shake": ("shake", "milkshake", "smoothie"),
    "tea": ("tea", "chai", "matcha", "iced tea"),
    "coffee": ("coffee", "espresso", "latte", "cappuccino", "americano", "mocha"),
    "cocktail": ("mocktail", "cocktail", "mojito", "spritz", "margarita"),
    "dessert": ("dessert", "sweet", "pudding"),
    "cake": ("cake", "cheesecake", "brownie", "tiramisu", "pastry"),
    "icecream": ("ice cream", "gelato", "sundae", "sorbet"),
    "shisha": ("shisha", "hookah"),
}

FOOD_PROFILE_PAIRINGS: Dict[str, Tuple[str, ...]] = {
    "burger": ("cola", "shake", "starter", "icecream"),
    "pizza": ("cola", "juice", "salad_starter", "dessert"),
    "pasta": ("juice", "cocktail", "salad_starter", "cake"),
    "sushi": ("tea", "juice", "salad_starter", "dessert"),
    "steak": ("cocktail", "juice", "salad_starter", "cake"),
    "chicken": ("cola", "juice", "salad_starter", "starter"),
    "fish": ("juice", "tea", "salad_starter", "dessert"),
    "biryani": ("cola", "juice", "starter", "dessert"),
    "shisha": ("cocktail", "juice", "starter", "tea"),
    "dessert": ("coffee", "tea"),
    "cake": ("coffee", "tea"),
    "icecream": ("coffee", "tea", "cola"),
}


@dataclass
class SessionSignals:
    category_declines: Dict[int, float]
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


def _item_profiles(item: Item) -> Set[str]:
    blob = f" {_item_search_blob(item)} "
    profiles: Set[str] = set()
    for profile, keywords in FOOD_PROFILE_KEYWORDS.items():
        if any(keyword in blob for keyword in keywords):
            profiles.add(profile)
    return profiles


def _culinary_profile_points(source_item: Item, candidate: Item) -> int:
    source_profiles = _item_profiles(source_item)
    candidate_profiles = _item_profiles(candidate)
    best = 0
    for source_profile in source_profiles:
        ranked_targets = FOOD_PROFILE_PAIRINGS.get(source_profile, ())
        for rank, target_profile in enumerate(ranked_targets):
            if target_profile not in candidate_profiles:
                continue
            if rank == 0:
                best = max(best, 18)
            elif rank == 1:
                best = max(best, 11)
            elif rank == 2:
                best = max(best, 6)
            else:
                best = max(best, 3)
    return best


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


def _parse_id_counts(raw: Optional[str]) -> Dict[int, float]:
    if not raw:
        return {}
    parsed: Dict[int, float] = {}
    for chunk in str(raw).split(","):
        item = chunk.strip()
        if not item:
            continue
        if ":" in item:
            category_id_raw, count_raw = item.split(":", 1)
            try:
                parsed[int(category_id_raw)] = max(0.0, float(count_raw))
            except (TypeError, ValueError):
                continue
        else:
            try:
                parsed[int(item)] = 1.0
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
        category_declines={
            int(k): max(0.0, float(v))
            for k, v in raw_signals.get("category_declines", {}).items()
            if str(k).isdigit()
        },
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
        "premium": set(),
    }
    category_type_to_role = {
        "main": "main",
        "drink": "drinks",
        "drinks": "drinks",
        "beverage": "drinks",
        "beverages": "drinks",
        "dessert": "desserts",
        "desserts": "desserts",
        "starter": "starters",
        "starters": "starters",
        "appetizer": "starters",
        "appetizers": "starters",
        "premium": "premium",
        "addon": "premium",
        "add-on": "premium",
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

    categories = Category.objects.filter(restaurant_id=restaurant_id).values("id", "Category_name", "category_type")
    for category in categories:
        category_name = _normalize_text(category["Category_name"])
        category_id = int(category["id"])
        role_from_type = category_type_to_role.get(_normalize_text(category.get("category_type")))
        if role_from_type:
            roles[role_from_type].add(category_id)
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

    # An explicit restaurant category role is authoritative for eligibility.
    # Culinary keywords still influence pairing scores via _item_profiles(),
    # but must not turn tiramisu into a drink because it contains espresso or
    # turn a shake into a dessert when the restaurant lists it as a beverage.
    if roles:
        return roles

    roles.update(knowledge_roles_to_engine_roles(classify_item_roles(item)))

    if roles:
        return roles

    blob = _item_search_blob(item)
    for role, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in blob for keyword in keywords):
            roles.add(role)
    return roles


def _detect_stage(has_main: bool, has_drink: bool, has_starter_or_dessert: bool) -> str:
    if not has_main:
        return "building"
    if has_main and has_drink and has_starter_or_dessert:
        return "complete"
    return "balanced"


def _legacy_gap_priority(cart_roles: Set[str]) -> List[str]:
    """
    Cart-state knowledge base from the upsell redesign brief.
    The engine fills missing meal roles before scoring and avoids suggesting
    categories already represented in the current cart.
    """
    has_main = "main" in cart_roles
    has_drink = "drinks" in cart_roles
    has_dessert = "desserts" in cart_roles
    has_starter = "starters" in cart_roles

    if has_main and has_drink and has_dessert:
        return [role for role in ["starters", "premium"] if role not in cart_roles]
    if has_main and has_drink:
        return [role for role in ["desserts", "starters"] if role not in cart_roles]
    if has_main and has_dessert:
        return [role for role in ["drinks", "starters"] if role not in cart_roles]
    if has_main:
        return [role for role in ["drinks", "desserts", "starters"] if role not in cart_roles]
    if has_drink:
        return [role for role in ["main", "desserts", "starters"] if role not in cart_roles]
    if has_starter:
        return [role for role in ["main", "drinks", "desserts"] if role not in cart_roles]
    if has_dessert:
        return [role for role in ["drinks", "main"] if role not in cart_roles]
    return []


def _knowledge_gap_priority(
    cart_roles: Set[str],
    *,
    cart_items: Optional[List[Item]] = None,
    restaurant=None,
    hour: Optional[int] = None,
) -> List[str]:
    if cart_items:
        knowledge_roles = classify_cart_roles(cart_items)
        if knowledge_roles:
            venue_type = infer_venue_type(restaurant, cart_items)
            gaps = knowledge_roles_to_engine_roles(
                get_gap_priority(knowledge_roles, venue_type=venue_type, hour=hour)
            )
            return gaps
    return _legacy_gap_priority(cart_roles)


def _flatten_cart_sources(cart_items: Iterable) -> List[Item]:
    return [cart_item.item for cart_item in cart_items if getattr(cart_item, "item", None)]


def _reason_for_top_factor(reasons: Dict[str, int], setting: UpsellSetting) -> str:
    if not reasons:
        return "You might like this add-on."

    top_reason = max(reasons.items(), key=lambda pair: pair[1])[0]
    tone_aliases = {
        "professional": "premium",
        "playful": "friendly",
        "luxury_casual": "friendly",
    }
    tone = tone_aliases.get(setting.tone, setting.tone)
    messages = {
        "gap": {
            "friendly": "Your meal is missing this pairing.",
            "premium": "Recommended to complete this order.",
            "minimal": "Recommended add-on.",
        },
        "pair": {
            "friendly": "Guests often pair these together.",
            "premium": "Commonly purchased together.",
            "minimal": "Popular pairing.",
        },
        "time": {
            "friendly": "A great pick for this time of day.",
            "premium": "Optimized for current service period.",
            "minimal": "Best for right now.",
        },
        "price": {
            "friendly": "A quick add-on without stretching your total.",
            "premium": "Fits your current cart value range.",
            "minimal": "Good value add-on.",
        },
        "priority": {
            "friendly": "Chef-recommended for this table.",
            "premium": "Prioritized by your restaurant settings.",
            "minimal": "Recommended by settings.",
        },
        "default": {
            "friendly": "You might like this add-on.",
            "premium": "Suggested item for this order.",
            "minimal": "Suggested add-on.",
        },
    }
    return messages.get(top_reason, messages["default"]).get(tone, messages["default"]["friendly"])


def _copy_for_pairing(cart_items: List[Item], candidate: Item, setting: UpsellSetting, stage: str, reasons: Dict[str, int]) -> Tuple[str, str]:
    tone_aliases = {
        "professional": "premium",
        "playful": "friendly",
        "luxury_casual": "friendly",
    }
    tone = tone_aliases.get(setting.tone, setting.tone)
    candidate_profiles = _item_profiles(candidate)

    for source in cart_items:
        source_profiles = _item_profiles(source)
        source_name = source.item_name or "your order"
        if "burger" in source_profiles and "cola" in candidate_profiles:
            label = "Perfect with your order"
            reason = f"Burgers and {candidate.item_name} - a timeless combo."
            break
        if "steak" in source_profiles and "cocktail" in candidate_profiles:
            label = "Complete the experience"
            reason = f"A classic alongside your {source_name}."
            break
        if "pasta" in source_profiles and ({"cocktail", "juice"} & candidate_profiles):
            label = "Restaurant favourite"
            reason = "Most pasta orders pair beautifully with a cold drink."
            break
        if ({"burger", "chicken"} & source_profiles) and ({"dessert", "cake", "icecream"} & candidate_profiles):
            label = "Save room for this"
            reason = "A sweet finish customers often add to complete the meal."
            break
        if "coffee" in candidate_profiles and ({"dessert", "cake", "icecream"} & source_profiles):
            label = "Finish on a high"
            reason = "Coffee is a natural finish after dessert."
            break
    else:
        if stage == "complete" and ({"dessert", "cake", "icecream"} & candidate_profiles):
            label = "Save room for this"
            reason = "Complete meals often end with dessert. Don't miss out."
        elif reasons.get("gap", 0) >= 55:
            label = "Complete your meal"
            reason = _reason_for_top_factor(reasons, setting)
        elif reasons.get("pair", 0) > 0:
            label = "Perfect pairing"
            reason = _reason_for_top_factor(reasons, setting)
        else:
            label = "You might also like"
            reason = _reason_for_top_factor(reasons, setting)

    if tone == "premium":
        label_map = {
            "Perfect with your order": "Curated for your selection",
            "Complete your meal": "Complete the experience",
            "Perfect pairing": "Recommended pairing",
            "You might also like": "Selected for your table",
            "Save room for this": "End on a refined note",
        }
        label = label_map.get(label, label)
        if reason.startswith("Your meal"):
            reason = "Recommended to round out this order."
    elif tone == "minimal":
        label = "Recommended"
        reason = f"Add {candidate.item_name}?"

    return label, reason


def _current_hour_for_restaurant(tz_name: str) -> int:
    try:
        current = timezone.localtime(timezone.now(), timezone=ZoneInfo(tz_name))
        return int(current.hour)
    except Exception:
        return int(datetime.utcnow().hour)


def _canonical_strategy(strategy: Optional[str]) -> str:
    aliases = {
        "highest_margin": "max_revenue",
        "premium_experience": "max_revenue",
        "margin": "max_revenue",
        "inventory_movement": "move_stock",
        "volume": "move_stock",
        "highest_conversion": "balanced",
    }
    return aliases.get((strategy or "balanced").strip().lower(), (strategy or "balanced").strip().lower())


def _strategy_bonus(
    setting: UpsellSetting,
    candidate_price: Decimal,
    cart_total: Decimal,
    *,
    is_inventory_priority: bool = False,
    candidate_acceptance_rate: float = 0.0,
) -> int:
    if cart_total <= 0:
        cart_total = Decimal("0.01")
    ratio = candidate_price / cart_total
    strategy = _canonical_strategy(setting.strategy)

    if strategy == "max_revenue":
        if ratio >= Decimal("0.45"):
            return 20
        if ratio >= Decimal("0.30"):
            return 12
        return 0

    if strategy == "balanced":
        if candidate_acceptance_rate >= 0.50:
            return 10
        if candidate_acceptance_rate >= 0.30:
            return 6
        if candidate_acceptance_rate > 0:
            return 3
        return 0

    if strategy == "move_stock":
        if is_inventory_priority:
            return 20
        if ratio <= Decimal("0.25"):
            return 8
        return 0

    return 0


def _tiebreaker_points(item_id: int) -> int:
    # Rotates every 3 minutes to avoid repeatedly suggesting the exact same item.
    bucket = int(timezone.now().timestamp() // 180)
    return int(((item_id * 17) + (bucket * 31)) % 7)


def _active_manual_rules(restaurant_id: int) -> Tuple[Dict[int, Set[int]], Dict[int, Set[int]], Set[int]]:
    pair_rules: Dict[int, Set[int]] = {}
    block_rules: Dict[int, Set[int]] = {}
    global_block_targets: Set[int] = set()
    rules = UpsellRule.objects.filter(restaurant_id=restaurant_id, is_active=True).values(
        "type", "source_item_id", "target_item_id"
    )
    for rule in rules:
        target_item_id = int(rule["target_item_id"])
        if rule["type"] == "pair":
            if not rule["source_item_id"]:
                continue
            source_item_id = int(rule["source_item_id"])
            pair_rules.setdefault(source_item_id, set()).add(target_item_id)
        elif rule["type"] == "block":
            if not rule["source_item_id"]:
                continue
            source_item_id = int(rule["source_item_id"])
            block_rules.setdefault(source_item_id, set()).add(target_item_id)
        elif rule["type"] == "global_block":
            global_block_targets.add(target_item_id)
    return pair_rules, block_rules, global_block_targets


def _historical_signals_by_target(
    restaurant_id: int,
    source_item_ids: Set[int],
    excluded_target_ids: Set[int],
) -> Dict[int, Dict[str, float]]:
    if not source_item_ids:
        return {}

    rows = (
        ItemAssociation.objects.filter(restaurant_id=restaurant_id, source_item_id__in=source_item_ids)
        .exclude(target_item_id__in=excluded_target_ids)
        .values(
            "source_item_id",
            "target_item_id",
            "co_order_frequency",
            "association_strength",
            "times_shown",
            "times_accepted",
        )
    )

    result: Dict[int, Dict[str, float]] = {}
    for row in rows:
        target_item_id = int(row["target_item_id"])
        current = result.setdefault(
            target_item_id,
            {
                "sum_strength": 0.0,
                "max_strength": 0.0,
                "total_frequency": 0.0,
                "max_frequency": 0.0,
                "times_shown": 0.0,
                "times_accepted": 0.0,
            },
        )
        strength = float(row.get("association_strength") or 0)
        frequency = float(row.get("co_order_frequency") or 0)
        shown = float(row.get("times_shown") or 0)
        accepted = float(row.get("times_accepted") or 0)

        current["sum_strength"] += strength
        current["total_frequency"] += frequency
        current["times_shown"] += shown
        current["times_accepted"] += accepted
        current["max_strength"] = max(current["max_strength"], strength)
        current["max_frequency"] = max(current["max_frequency"], frequency)

    for metrics in result.values():
        shown = metrics["times_shown"]
        metrics["acceptance_rate"] = (metrics["times_accepted"] / shown) if shown > 0 else 0.0
    return result


def _build_upsell_suggestions_for_items(
    restaurant,
    cart_source_items: List[Item],
    cart_item_ids: Set[int],
    cart_total: Decimal,
    *,
    limit: int = 4,
    trigger_point: str = "cart",
    source_item_id: Optional[int] = None,
    session_signals: Optional[Dict] = None,
    apply_surface_limit: bool = True,
) -> List[Dict]:
    """
    Shared AI upsell engine.

    The redesign brief requires suggestions to be driven by the current cart's
    meal roles first, then ranked by pairing intelligence, session signals, and
    restaurant rules. This helper accepts plain item context so mobile flows do
    not depend on a persisted backend Cart row being in sync.
    """
    limit = max(1, min(limit, 10))
    setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)

    trigger_setting_field = TRIGGER_TO_SETTING_FIELD.get(trigger_point)
    if not setting.enabled:
        return []
    if trigger_setting_field and not getattr(setting, trigger_setting_field, True):
        return []
    if not cart_source_items:
        return []

    signals = _parse_signals(session_signals)
    role_categories = _derive_role_categories(restaurant.id, setting)
    prioritized_categories = _parse_prioritized_category_ids(setting)
    pair_rules, block_rules, global_block_targets = _active_manual_rules(restaurant.id)

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

    item_setting_rows = UpsellItemSetting.objects.filter(restaurant=restaurant, item_id__in=[item.id for item in available_items]).values(
        "item_id", "enabled", "inventory_priority"
    )
    disabled_item_ids: Set[int] = set()
    inventory_priority_ids: Set[int] = set()
    for row in item_setting_rows:
        item_id = int(row["item_id"])
        if not row.get("enabled", True):
            disabled_item_ids.add(item_id)
        if row.get("inventory_priority"):
            inventory_priority_ids.add(item_id)

    cart_role_set: Set[str] = set()
    for cart_item in cart_source_items:
        cart_role_set.update(_item_roles(cart_item, role_categories))
    cart_knowledge_roles = classify_cart_roles(cart_source_items)
    has_main = "main" in cart_role_set
    has_drink = "drinks" in cart_role_set
    has_starter = "starters" in cart_role_set
    has_dessert = "desserts" in cart_role_set

    stage = _detect_stage(has_main, has_drink, has_starter or has_dessert)
    region = normalize_region(getattr(restaurant, "region", None))
    _ = HIGH_CART_DESSERT_THRESHOLD_BY_REGION.get(region, Decimal("45.00"))
    _ = STARTER_CART_CEILING_BY_REGION.get(region, Decimal("150.00"))
    hour = _current_hour_for_restaurant(getattr(restaurant, "timezone", "UTC"))
    venue_type = infer_venue_type(restaurant, cart_source_items)
    knowledge_gaps = get_gap_priority(cart_knowledge_roles, venue_type=venue_type, hour=hour) if cart_knowledge_roles else []
    generic_unknown_menu = not cart_knowledge_roles and not cart_role_set
    gaps = knowledge_roles_to_engine_roles(knowledge_gaps) if knowledge_gaps or cart_knowledge_roles else _knowledge_gap_priority(
        cart_role_set,
        cart_items=cart_source_items,
        restaurant=restaurant,
        hour=hour,
    )
    if generic_unknown_menu and not gaps:
        gaps = ["premium"]
        knowledge_gaps = [ROLE_ADDON]
    if not gaps:
        return []
    gap_rank = {role: index for index, role in enumerate(gaps)}
    target_knowledge_roles = set(knowledge_gaps)

    blocked_target_ids: Set[int] = set()
    pair_boost_targets: Set[int] = set()
    for source_item in cart_source_items:
        blocked_target_ids.update(block_rules.get(source_item.id, set()))
        pair_boost_targets.update(pair_rules.get(source_item.id, set()))
    blocked_target_ids.update(global_block_targets)

    historical_signals = _historical_signals_by_target(
        restaurant.id,
        source_item_ids={item.id for item in cart_source_items},
        excluded_target_ids=cart_item_ids.union(blocked_target_ids),
    )

    results: List[Dict] = []

    for candidate in available_items:
        if candidate.id in disabled_item_ids:
            continue
        if source_item_id and candidate.id == source_item_id:
            continue
        if candidate.id in blocked_target_ids:
            continue

        candidate_roles = _item_roles(candidate, role_categories)
        if generic_unknown_menu and not candidate_roles:
            candidate_roles = {"premium"}
        if not candidate_roles:
            continue
        candidate_knowledge_roles = classify_item_roles(candidate)
        if generic_unknown_menu and not candidate_knowledge_roles:
            candidate_knowledge_roles = {ROLE_ADDON}

        # The brief's highest-priority guard: do not suggest a role already in
        # the current cart. Pairing intelligence can rank candidates, not break
        # meal-composition rules.
        if candidate_roles & cart_role_set:
            if not candidate_knowledge_roles or (candidate_knowledge_roles & cart_knowledge_roles):
                continue
        if candidate_roles.isdisjoint(set(gaps)):
            continue
        if target_knowledge_roles and candidate_knowledge_roles and candidate_knowledge_roles.isdisjoint(target_knowledge_roles):
            continue

        candidate_category_id = candidate.category_id
        decline_count = signals.category_declines.get(candidate_category_id, 0)
        if decline_count >= 2:
            continue

        score = 0
        reasons: Dict[str, int] = {}

        matching_gap_rank = min((gap_rank.get(role, 99) for role in candidate_roles), default=99)
        matching_target_roles = [role for role in knowledge_gaps if role in candidate_knowledge_roles]
        target_role = (
            matching_target_roles[0]
            if matching_target_roles
            else default_knowledge_role_for_engine_role(min(candidate_roles, key=lambda role: gap_rank.get(role, 99)))
        )
        if matching_gap_rank == 0:
            score += 55
            reasons["gap"] = reasons.get("gap", 0) + 55
        elif matching_gap_rank == 1:
            score += 32
            reasons["gap"] = reasons.get("gap", 0) + 32
        elif matching_gap_rank == 2:
            score += 18
            reasons["gap"] = reasons.get("gap", 0) + 18
        else:
            score -= 25

        if matching_target_roles:
            score += 12
            reasons["gap"] = reasons.get("gap", 0) + 12

        culinary_points = 0
        for cart_source in cart_source_items:
            culinary_points += _culinary_profile_points(cart_source, candidate)
            if culinary_points >= 36:
                culinary_points = 36
                break
        if culinary_points:
            score += culinary_points
            reasons["pair"] = reasons.get("pair", 0) + culinary_points

        category_pair_points = 0
        if trigger_source_item:
            for trigger_role in _item_roles(trigger_source_item, role_categories):
                ranked_targets = list(PAIRING_BY_ROLE.get(trigger_role, ()))
                for rank, paired_engine_role in enumerate(ranked_targets):
                    if paired_engine_role not in candidate_roles:
                        continue
                    if rank == 0:
                        category_pair_points = max(category_pair_points, 14)
                    elif rank == 1:
                        category_pair_points = max(category_pair_points, 8)
                    else:
                        category_pair_points = max(category_pair_points, 4)
        else:
            for source in cart_source_items:
                for source_role in _item_roles(source, role_categories):
                    ranked_targets = list(PAIRING_BY_ROLE.get(source_role, ()))
                    for rank, paired_engine_role in enumerate(ranked_targets):
                        if paired_engine_role not in candidate_roles:
                            continue
                        category_pair_points = max(category_pair_points, 10 if rank == 0 else 5)
        if category_pair_points:
            score += category_pair_points
            reasons["pair"] = reasons.get("pair", 0) + category_pair_points

        time_points = 0
        candidate_profiles = _item_profiles(candidate)
        if 6 <= hour < 11:
            if {"coffee", "tea"} & candidate_profiles:
                time_points = 10
            elif "drinks" in candidate_roles:
                time_points = 6
            elif "main" in candidate_roles:
                time_points = 3
        elif 11 <= hour < 15:
            if "drinks" in candidate_roles:
                time_points = 10
            elif "starters" in candidate_roles:
                time_points = 6
            elif "main" in candidate_roles:
                time_points = 3
        elif 15 <= hour < 18:
            if {"coffee", "tea"} & candidate_profiles:
                time_points = 10
            elif "desserts" in candidate_roles:
                time_points = 6
            elif "drinks" in candidate_roles:
                time_points = 3
        elif 18 <= hour < 23:
            if "drinks" in candidate_roles or "cocktail" in candidate_profiles:
                time_points = 10
            elif "desserts" in candidate_roles:
                time_points = 6
            elif "starters" in candidate_roles:
                time_points = 3
        else:
            if "cocktail" in candidate_profiles:
                time_points = 10
            elif "drinks" in candidate_roles:
                time_points = 6
            elif "desserts" in candidate_roles:
                time_points = 3
        if time_points:
            score += time_points
            reasons["time"] = reasons.get("time", 0) + time_points

        candidate_price = _effective_item_price(candidate)
        if cart_total > 0:
            ratio = candidate_price / cart_total
            if Decimal("0.10") <= ratio <= Decimal("0.45"):
                score += 8
                reasons["price"] = reasons.get("price", 0) + 8
            elif Decimal("0.45") < ratio <= Decimal("0.70"):
                score += 3
                reasons["price"] = reasons.get("price", 0) + 3
            elif ratio > Decimal("1.50"):
                score -= 12

        view_count = signals.category_views.get(candidate_category_id, 0)
        if view_count > 0:
            browsing_points = min(15, view_count * 3)
            score += browsing_points
            reasons["pair"] = reasons.get("pair", 0) + browsing_points

        if candidate_category_id in signals.recently_removed_category_ids:
            score += 8
            reasons["pair"] = reasons.get("pair", 0) + 8

        if decline_count > 0:
            score -= 10 * decline_count

        historical = historical_signals.get(candidate.id)
        historical_acceptance_rate = 0.0
        if historical:
            historical_acceptance_rate = float(historical.get("acceptance_rate", 0.0))
            historical_points = 0
            historical_points += min(40, int(float(historical.get("sum_strength", 0.0)) * 40))
            historical_points += min(20, int(float(historical.get("total_frequency", 0.0))))
            historical_points += min(20, int(historical_acceptance_rate * 20))
            if historical_points:
                score += historical_points
                reasons["pair"] = reasons.get("pair", 0) + historical_points

        if candidate_category_id in prioritized_categories:
            score += 15
            reasons["priority"] = reasons.get("priority", 0) + 15

        if candidate.id in pair_boost_targets:
            score += 200
            reasons["pair"] = reasons.get("pair", 0) + 200

        score += _strategy_bonus(
            setting,
            candidate_price,
            cart_total,
            is_inventory_priority=candidate.id in inventory_priority_ids,
            candidate_acceptance_rate=historical_acceptance_rate,
        )
        score += _tiebreaker_points(candidate.id)

        if score <= 0:
            continue

        label, message = _copy_for_pairing(cart_source_items, candidate, setting, stage, reasons)
        results.append(
            {
                "item": candidate,
                "rule": label,
                "message": message,
                "score": int(score),
                "stage": stage,
                "price": float(candidate_price),
                "gap_rank": matching_gap_rank,
                "target_role": target_role,
                "candidate_roles": sorted(candidate_knowledge_roles),
                "cart_roles": sorted(cart_knowledge_roles),
                "venue_type": venue_type,
                "agent_reasoning": (
                    f"Cart roles {', '.join(sorted(cart_knowledge_roles)) or 'unknown'}; "
                    f"target {target_role}; venue {venue_type}; backend score {int(score)}."
                ),
                "manual_pair": candidate.id in pair_boost_targets,
                "historical_max_strength": float(historical.get("max_strength", 0.0)) if historical else 0.0,
                "historical_max_frequency": int(historical.get("max_frequency", 0.0)) if historical else 0,
                "historical_total_frequency": float(historical.get("total_frequency", 0.0)) if historical else 0.0,
            }
        )

    if not results:
        return []

    best_gap_rank = min(int(row.get("gap_rank", 99)) for row in results)
    results = [row for row in results if int(row.get("gap_rank", 99)) == best_gap_rank]

    strategy = _canonical_strategy(setting.strategy)
    if strategy == "max_revenue":
        results.sort(
            key=lambda row: (
                bool(row.get("manual_pair")),
                -int(row.get("gap_rank", 99)),
                float(row.get("price", 0.0)),
                row["score"],
            ),
            reverse=True,
        )
    elif strategy == "move_stock":
        results.sort(
            key=lambda row: (
                bool(row.get("manual_pair")),
                -int(row.get("gap_rank", 99)),
                -float(row.get("historical_total_frequency", 0.0)),
                row["score"],
            ),
            reverse=True,
        )
    else:
        results.sort(key=lambda row: (bool(row.get("manual_pair")), row["score"]), reverse=True)

    high_confidence = [
        row
        for row in results
        if row.get("historical_max_strength", 0.0) >= 0.5 and row.get("historical_max_frequency", 0) >= 10
    ]
    if high_confidence:
        top_override = max(
            high_confidence,
            key=lambda row: (
                row.get("historical_max_strength", 0.0),
                row.get("historical_max_frequency", 0),
                row["score"],
            ),
        )
        results = [top_override] + [row for row in results if row["item"].id != top_override["item"].id]

    if not apply_surface_limit:
        return results[:limit]

    if trigger_point in {"add_to_cart", "before_payment"}:
        settings_limit = 1
    elif setting.aggressiveness == "subtle":
        settings_limit = 1
    elif setting.aggressiveness == "moderate":
        settings_limit = 2
    else:
        settings_limit = 2

    effective_limit = min(limit, settings_limit)
    return results[:effective_limit]


def build_item_context_upsell_suggestions(
    restaurant,
    cart_item_ids: Iterable[int],
    *,
    limit: int = 4,
    trigger_point: str = "cart",
    source_item_id: Optional[int] = None,
    session_signals: Optional[Dict] = None,
    apply_surface_limit: bool = True,
) -> List[Dict]:
    normalized_ids = []
    seen_ids: Set[int] = set()
    for raw_id in cart_item_ids:
        try:
            item_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if item_id <= 0 or item_id in seen_ids:
            continue
        seen_ids.add(item_id)
        normalized_ids.append(item_id)
    if not normalized_ids:
        return []

    items_by_id = {
        item.id: item
        for item in Item.objects.select_related("category", "sub_category").filter(
            restaurant=restaurant,
            id__in=normalized_ids,
        )
    }
    cart_source_items = [items_by_id[item_id] for item_id in normalized_ids if item_id in items_by_id]
    if not cart_source_items:
        return []

    cart_total = sum((_effective_item_price(item) for item in cart_source_items), Decimal("0"))
    return _build_upsell_suggestions_for_items(
        restaurant,
        cart_source_items,
        {item.id for item in cart_source_items},
        cart_total,
        limit=limit,
        trigger_point=trigger_point,
        source_item_id=source_item_id,
        session_signals=session_signals,
        apply_surface_limit=apply_surface_limit,
    )


def build_cart_upsell_suggestions(
    cart: Cart,
    *,
    limit: int = 4,
    trigger_point: str = "cart",
    source_item_id: Optional[int] = None,
    session_signals: Optional[Dict] = None,
) -> List[Dict]:
    """
    Production scoring engine that adapts to region, session behavior, manual
    rules, and the current cart meal composition.
    """
    cart_items = list(cart.items.select_related("item__category", "item__sub_category").all())
    if not cart_items:
        return []
    return _build_upsell_suggestions_for_items(
        cart.device.restaurant,
        _flatten_cart_sources(cart_items),
        {cart_item.item_id for cart_item in cart_items},
        _cart_total(cart),
        limit=limit,
        trigger_point=trigger_point,
        source_item_id=source_item_id,
        session_signals=session_signals,
    )
