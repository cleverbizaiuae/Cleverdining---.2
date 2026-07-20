from __future__ import annotations

import copy
import hashlib
import json
import logging
import re
import threading
import time
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple
from zoneinfo import ZoneInfo

import requests
from django.conf import settings
from django.core.cache import cache
from django.db import DatabaseError
from django.utils import timezone

from .upsell_cache import get_restaurant_upsell_cache_versions


logger = logging.getLogger(__name__)

_vertex_session_lock = threading.Lock()
_vertex_session = None
_vertex_session_fingerprint = ""

_upsell_llm_jobs_lock = threading.Lock()
_upsell_llm_jobs: Set[str] = set()

_OPENROUTER_FREE_RATE_LIMIT_CACHE_KEY = "upsell:openrouter:free-rate-limited"


ROLE_MAIN = "MAIN"
ROLE_DRINK_COLD = "DRINK_COLD"
ROLE_DRINK_HOT = "DRINK_HOT"
ROLE_DESSERT = "DESSERT"
ROLE_STARTER = "STARTER"
ROLE_SIDE = "SIDE"
ROLE_SHISHA = "SHISHA"
ROLE_CIGAR = "CIGAR"
ROLE_ADDON = "ADDON"

ALL_KNOWLEDGE_ROLES = (
    ROLE_MAIN,
    ROLE_DRINK_COLD,
    ROLE_DRINK_HOT,
    ROLE_DESSERT,
    ROLE_STARTER,
    ROLE_SIDE,
    ROLE_SHISHA,
    ROLE_CIGAR,
    ROLE_ADDON,
)

ROLE_TO_ENGINE_ROLE = {
    ROLE_MAIN: "main",
    ROLE_DRINK_COLD: "drinks",
    ROLE_DRINK_HOT: "drinks",
    ROLE_DESSERT: "desserts",
    ROLE_STARTER: "starters",
    ROLE_SIDE: "starters",
    ROLE_SHISHA: "premium",
    ROLE_CIGAR: "premium",
    ROLE_ADDON: "premium",
}

ENGINE_ROLE_TO_DEFAULT_KNOWLEDGE_ROLE = {
    "main": ROLE_MAIN,
    "drinks": ROLE_DRINK_COLD,
    "desserts": ROLE_DESSERT,
    "starters": ROLE_STARTER,
    "premium": ROLE_ADDON,
}

ROLE_KEYWORDS: Dict[str, Sequence[str]] = {
    ROLE_MAIN: (
        "main",
        "burger",
        "cheeseburger",
        "slider",
        "pizza",
        "pasta",
        "steak",
        "shawarma",
        "biryani",
        "mandi",
        "kabsa",
        "sandwich",
        "wrap",
        "sushi platter",
        "curry",
        "grill",
        "entree",
        "meal",
    ),
    ROLE_DRINK_COLD: (
        "cold drink",
        "drink",
        "beverage",
        "juice",
        "smoothie",
        "shake",
        "milkshake",
        "soda",
        "cola",
        "coke",
        "pepsi",
        "fanta",
        "sprite",
        "water",
        "lemonade",
        "mocktail",
        "cocktail",
        "mojito",
        "beer",
        "wine",
        "sake",
        "iced coffee",
        "iced tea",
        "energy drink",
    ),
    ROLE_DRINK_HOT: (
        "hot drink",
        "coffee",
        "espresso",
        "latte",
        "cappuccino",
        "americano",
        "mocha",
        "tea",
        "karak",
        "chai",
        "hot chocolate",
        "hot choc",
    ),
    ROLE_DESSERT: (
        "dessert",
        "sweet",
        "cake",
        "cheesecake",
        "brownie",
        "ice cream",
        "gelato",
        "sundae",
        "sorbet",
        "kunafa",
        "baklava",
        "waffle",
        "pastry",
        "muffin",
        "croissant",
        "mochi",
        "tiramisu",
    ),
    ROLE_STARTER: (
        "starter",
        "appetizer",
        "appetiser",
        "salad",
        "soup",
        "wings",
        "hummus",
        "mezze",
        "bruschetta",
        "edamame",
        "calamari",
        "spring roll",
        "garlic bread",
        "nachos",
    ),
    ROLE_SIDE: (
        "side",
        "fries",
        "chips",
        "rice",
        "coleslaw",
        "slaw",
        "bread",
        "sauce",
        "dip",
        "extra",
    ),
    ROLE_SHISHA: ("shisha", "hookah", "waterpipe", "double apple", "flavour", "flavor"),
    ROLE_CIGAR: ("cigar", "tobacco"),
    ROLE_ADDON: ("addon", "add-on", "upgrade", "premium", "bottle service", "extra shot"),
}

CATEGORY_TYPE_ROLE_HINTS = {
    "main": ROLE_MAIN,
    "mains": ROLE_MAIN,
    "food": ROLE_MAIN,
    "drink": ROLE_DRINK_COLD,
    "drinks": ROLE_DRINK_COLD,
    "beverage": ROLE_DRINK_COLD,
    "beverages": ROLE_DRINK_COLD,
    "dessert": ROLE_DESSERT,
    "desserts": ROLE_DESSERT,
    "starter": ROLE_STARTER,
    "starters": ROLE_STARTER,
    "appetizer": ROLE_STARTER,
    "appetizers": ROLE_STARTER,
    "side": ROLE_SIDE,
    "sides": ROLE_SIDE,
    "shisha": ROLE_SHISHA,
    "hookah": ROLE_SHISHA,
    "cigar": ROLE_CIGAR,
    "addon": ROLE_ADDON,
    "add-on": ROLE_ADDON,
    "premium": ROLE_ADDON,
}

VENUE_TYPES = {
    "restaurant": "General restaurant - standard meal completion logic.",
    "cafe": "Coffee shop - hot drinks, pastries, cakes, and light food.",
    "shisha_lounge": "Shisha primary - cold drinks first, then light snacks.",
    "beach_club": "Social venue - drinks and light sharing food.",
    "fine_dining": "Premium venue - high-value contextual suggestions only.",
    "fast_food": "Quick service - simple combos with low friction.",
    "sushi": "Japanese venue - sushi pairings, Japanese drinks, starters.",
    "bar": "Drinks primary - light food secondary.",
    "food_truck": "Simple menu - drinks and sides as upsells.",
    "hotel_dining": "Broad audience - conservative, universal suggestions.",
}

VENUE_KEYWORDS = {
    "shisha_lounge": ("shisha", "hookah", "lounge"),
    "cafe": ("cafe", "coffee", "espresso", "bakery", "pastry"),
    "sushi": ("sushi", "japanese", "maki", "sashimi", "nigiri"),
    "fine_dining": ("fine dining", "steakhouse", "wagyu", "chateau", "wine cellar"),
    "fast_food": ("burger", "pizza", "fried chicken", "quick service", "fast food"),
    "beach_club": ("beach", "pool", "club"),
    "bar": ("bar", "pub", "cocktail", "wine"),
}

AGGRESSIVENESS_POLICY = {
    "subtle": {
        "session_cap": 2,
        "menu_max_calls": 1,
        "cart_max_calls": 1,
        "menu_visible": 2,
        "cart_visible": 2,
    },
    "moderate": {
        "session_cap": 4,
        "menu_max_calls": 2,
        "cart_max_calls": 2,
        "menu_visible": 2,
        "cart_visible": 4,
    },
    "aggressive": {
        "session_cap": 6,
        "menu_max_calls": 3,
        "cart_max_calls": 3,
        "menu_visible": 2,
        "cart_visible": 4,
    },
}

STRATEGY_INSTRUCTIONS = {
    "balanced": "Prefer the valid candidate with the strongest acceptance and pairing evidence.",
    "max_revenue": "Within the required target role, prefer the highest-priced natural valid candidate.",
    "move_stock": "Within the required target role, prefer valid low-selling or inventory-priority candidates.",
}

TONE_INSTRUCTIONS = {
    "friendly": "Write warm, casual, helpful copy without pressure.",
    "premium": "Write refined, understated copy with no hype or slang.",
    "minimal": "Write short, direct copy with no filler.",
}

UPSELL_SYSTEM_PROMPT = """
You are CleverDining's final upsell recommender. The backend already enforced triggers, caps,
availability, exclusions, business and venue rules, then supplied the only valid 3-5 candidates.
You alone choose the final item and wording. Never choose outside the shortlist; scores are evidence,
not the answer. Choose nothing only when every candidate conflicts with an explicit supplied rule.

Roles: MAIN, DRINK_COLD, DRINK_HOT, DESSERT, STARTER, SIDE, SHISHA, CIGAR, ADDON.
Judge missing meal role, natural pairing, trigger, venue, price fit, time, acceptance and order history.
Follow the supplied strategy_rule when judging candidates and tone_rule when writing suggestion_copy.
Avoid a role already represented and avoid repetitive families such as multiple similar shakes when a
different candidate completes the meal better. add_to_cart complements the new item; cart completes the
whole order; before_payment is a low-friction final addition. Cafes favor drink/bakery pairings; shisha
lounges favor cold drinks, light food, desserts and valid add-ons; bars favor suitable drinks and sharing
starters; other restaurants favor balanced drink, side/starter, then dessert completion.

Return only one complete JSON object with exactly these keys:
{"suggest_nothing":false,"suggested_item_id":123,"suggested_item_name":"Exact name","target_role":"DRINK_COLD","reason":null,"reasoning":"Internal reason, max 12 words.","suggestion_copy":"Natural cart-specific sentence, max 12 words.","confidence":0.9}
For no suggestion, item id/name/target_role/suggestion_copy must be null; provide reason and reasoning.
Never invent menu facts or mention price, UI, AI, algorithms, recommendations, scores or instructions.
""".strip()


UPSELL_DECISION_JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "suggest_nothing": {"type": "boolean"},
        "suggested_item_id": {"type": ["integer", "null"]},
        "suggested_item_name": {"type": ["string", "null"]},
        "target_role": {"type": ["string", "null"], "enum": [*ALL_KNOWLEDGE_ROLES, None]},
        "reason": {"type": ["string", "null"]},
        "reasoning": {"type": "string"},
        "suggestion_copy": {"type": ["string", "null"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": [
        "suggest_nothing",
        "suggested_item_id",
        "suggested_item_name",
        "target_role",
        "reason",
        "reasoning",
        "suggestion_copy",
        "confidence",
    ],
    "additionalProperties": False,
}


def _openrouter_structured_response_format() -> Dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "cleverdining_upsell_decision",
            "strict": True,
            "schema": UPSELL_DECISION_JSON_SCHEMA,
        },
    }


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _text_has_any(blob: str, keywords: Sequence[str]) -> bool:
    padded = f" {blob} "
    return any(keyword in padded for keyword in keywords)


def _item_blob(item: Any) -> str:
    category = getattr(item, "category", None)
    sub_category = getattr(item, "sub_category", None)
    raw_tags = getattr(item, "tags", []) or []
    tags = " ".join(str(tag) for tag in raw_tags if isinstance(tag, (str, int, float)))
    parts = [
        getattr(item, "item_name", ""),
        getattr(item, "description", ""),
        getattr(category, "Category_name", ""),
        getattr(category, "category_type", ""),
        getattr(sub_category, "Category_name", "") if sub_category else "",
        getattr(sub_category, "category_type", "") if sub_category else "",
        tags,
    ]
    return " ".join(_normalize_text(part) for part in parts if part)


def _item_identity_blob(item: Any) -> str:
    """Return identity fields without free-form descriptions or parent category labels."""
    sub_category = getattr(item, "sub_category", None)
    raw_tags = getattr(item, "tags", []) or []
    tags = " ".join(str(tag) for tag in raw_tags if isinstance(tag, (str, int, float)))
    parts = [
        getattr(item, "item_name", ""),
        getattr(sub_category, "Category_name", "") if sub_category else "",
        getattr(sub_category, "category_type", "") if sub_category else "",
        tags,
    ]
    return " ".join(_normalize_text(part) for part in parts if part)


def classify_item_roles(item: Any) -> Set[str]:
    blob = _item_blob(item)
    identity_blob = _item_identity_blob(item)
    category = getattr(item, "category", None)
    category_type = _normalize_text(getattr(category, "category_type", ""))
    category_name = _normalize_text(getattr(category, "Category_name", ""))

    # A specific category name (for example Shisha) is more informative than a
    # broad category_type such as premium. Category metadata is authoritative:
    # descriptions often mention pairings such as espresso or fries and must not
    # turn one menu item into several cart roles.
    category_hint = CATEGORY_TYPE_ROLE_HINTS.get(category_name) or CATEGORY_TYPE_ROLE_HINTS.get(category_type)
    if category_hint:
        if category_hint != ROLE_DRINK_COLD:
            return {category_hint}

        cold_markers = (
            "iced",
            "cold",
            "shake",
            "smoothie",
            "mocktail",
            "cocktail",
            "soda",
            "cola",
            "juice",
            "water",
            "lemonade",
        )
        is_cold = any(marker in identity_blob for marker in cold_markers)
        is_hot = _text_has_any(identity_blob, ROLE_KEYWORDS[ROLE_DRINK_HOT])
        return {ROLE_DRINK_HOT if is_hot and not is_cold else ROLE_DRINK_COLD}

    roles: Set[str] = set()

    if _text_has_any(blob, ROLE_KEYWORDS[ROLE_DRINK_COLD]):
        roles.add(ROLE_DRINK_COLD)
    if _text_has_any(blob, ROLE_KEYWORDS[ROLE_DRINK_HOT]):
        cold_markers = ("iced", "cold", "shake", "smoothie", "mocktail", "cocktail", "soda", "cola", "juice")
        if not any(marker in blob for marker in cold_markers):
            roles.add(ROLE_DRINK_HOT)

    for role in (ROLE_MAIN, ROLE_DESSERT, ROLE_STARTER, ROLE_SIDE, ROLE_SHISHA, ROLE_CIGAR, ROLE_ADDON):
        if _text_has_any(blob, ROLE_KEYWORDS[role]):
            roles.add(role)

    return roles


def classify_cart_roles(items: Iterable[Any]) -> Set[str]:
    roles: Set[str] = set()
    for item in items:
        roles.update(classify_item_roles(item))
    return roles


def knowledge_roles_to_engine_roles(roles: Iterable[str]) -> List[str]:
    mapped: List[str] = []
    for role in roles:
        engine_role = ROLE_TO_ENGINE_ROLE.get(role)
        if engine_role and engine_role not in mapped:
            mapped.append(engine_role)
    return mapped


def default_knowledge_role_for_engine_role(engine_role: str) -> str:
    return ENGINE_ROLE_TO_DEFAULT_KNOWLEDGE_ROLE.get(engine_role, ROLE_ADDON)


def infer_venue_type(restaurant: Any, menu_items: Iterable[Any] = ()) -> str:
    explicit = _normalize_text(getattr(restaurant, "venue_type", ""))
    if explicit in VENUE_TYPES:
        return explicit

    text_parts = [
        getattr(restaurant, "resturent_name", ""),
        getattr(restaurant, "name", ""),
        getattr(restaurant, "location", ""),
    ]
    # Do not infer the entire venue from the current cart. A tiramisu mentioning
    # espresso, for example, must not turn a general restaurant into a cafe.
    # Restaurants can set venue_type explicitly; otherwise use stable restaurant
    # metadata and fall back conservatively to the general restaurant policy.
    blob = " ".join(_normalize_text(part) for part in text_parts if part)

    for venue_type, keywords in VENUE_KEYWORDS.items():
        if _text_has_any(blob, keywords):
            return venue_type
    return "restaurant"


def _filter_declined_roles(roles: List[str], declined_roles: Optional[Set[str]]) -> List[str]:
    if not declined_roles:
        return roles
    return [role for role in roles if role not in declined_roles]


def get_gap_priority(
    cart_roles: Set[str],
    *,
    venue_type: str = "restaurant",
    hour: Optional[int] = None,
    declined_roles: Optional[Set[str]] = None,
) -> List[str]:
    if not cart_roles:
        return []

    has_main = ROLE_MAIN in cart_roles
    has_cold_drink = ROLE_DRINK_COLD in cart_roles
    has_hot_drink = ROLE_DRINK_HOT in cart_roles
    has_any_drink = has_cold_drink or has_hot_drink
    has_dessert = ROLE_DESSERT in cart_roles
    has_starter = ROLE_STARTER in cart_roles
    has_side = ROLE_SIDE in cart_roles
    has_shisha_or_cigar = bool({ROLE_SHISHA, ROLE_CIGAR} & cart_roles)
    is_morning = hour is not None and 6 <= hour < 11

    if has_main and has_any_drink and has_dessert and has_side:
        return []

    if venue_type == "shisha_lounge" or has_shisha_or_cigar:
        if not has_any_drink:
            return _filter_declined_roles([ROLE_DRINK_COLD], declined_roles)
        if not (has_starter or has_side):
            return _filter_declined_roles([ROLE_STARTER, ROLE_SIDE], declined_roles)
        if not has_dessert:
            return _filter_declined_roles([ROLE_DESSERT], declined_roles)
        return []

    if venue_type == "cafe":
        if has_hot_drink and not has_main:
            return _filter_declined_roles([ROLE_DESSERT, ROLE_STARTER], declined_roles)
        if has_main and not has_any_drink:
            preferred = [ROLE_DRINK_HOT, ROLE_DRINK_COLD] if is_morning else [ROLE_DRINK_COLD, ROLE_DRINK_HOT]
            return _filter_declined_roles(preferred, declined_roles)

    if has_main and not has_any_drink:
        preferred = [ROLE_DRINK_HOT, ROLE_DRINK_COLD] if is_morning else [ROLE_DRINK_COLD, ROLE_DRINK_HOT]
        return _filter_declined_roles(preferred + [ROLE_SIDE, ROLE_DESSERT, ROLE_STARTER], declined_roles)
    if has_main and has_any_drink and not has_dessert:
        return _filter_declined_roles([ROLE_DESSERT, ROLE_SIDE, ROLE_STARTER], declined_roles)
    if has_main and has_dessert and not has_any_drink:
        preferred = [ROLE_DRINK_HOT, ROLE_DRINK_COLD] if is_morning else [ROLE_DRINK_COLD, ROLE_DRINK_HOT]
        return _filter_declined_roles(preferred + [ROLE_SIDE], declined_roles)
    if has_main and has_any_drink and has_dessert:
        return _filter_declined_roles([ROLE_SIDE, ROLE_STARTER, ROLE_ADDON], declined_roles)
    if has_hot_drink and not has_main:
        return _filter_declined_roles([ROLE_DESSERT, ROLE_STARTER], declined_roles)
    if has_cold_drink and not has_main:
        return _filter_declined_roles([ROLE_MAIN, ROLE_STARTER, ROLE_DESSERT], declined_roles)
    if has_dessert and not has_any_drink:
        return _filter_declined_roles([ROLE_DRINK_HOT, ROLE_DRINK_COLD], declined_roles)
    if has_starter and not has_main:
        return _filter_declined_roles([ROLE_MAIN, ROLE_DRINK_COLD, ROLE_DESSERT], declined_roles)
    return []


def get_aggressiveness_policy(aggressiveness: Optional[str]) -> Dict[str, int]:
    return dict(AGGRESSIVENESS_POLICY.get(_normalize_text(aggressiveness) or "moderate", AGGRESSIVENESS_POLICY["moderate"]))


def _as_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except Exception:
        return Decimal("0")


def _candidate_payload(row: Mapping[str, Any]) -> Dict[str, Any]:
    item = row.get("item")
    item_roles = sorted(row.get("candidate_roles") or classify_item_roles(item))
    category = getattr(item, "category", None)
    sub_category = getattr(item, "sub_category", None)
    return {
        "id": getattr(item, "id", None),
        "name": getattr(item, "item_name", ""),
        "description": getattr(item, "description", "") or "",
        "category": getattr(category, "Category_name", "") or "",
        "sub_category": getattr(sub_category, "Category_name", "") if sub_category else "",
        "price": str(_as_decimal(getattr(item, "price", "0"))),
        "roles": item_roles,
        "target_role": row.get("target_role") or (item_roles[0] if item_roles else ""),
        "score": int(row.get("score") or 0),
        "pairing_score": float(row.get("historical_max_strength") or 0.0),
        "acceptance_rate": float(row.get("historical_acceptance_rate") or 0.0),
        "co_order_frequency": int(row.get("historical_max_frequency") or 0),
        "order_count_7d": int(row.get("order_count_7d") or 0),
        "order_count_30d": int(row.get("order_count_30d") or 0),
        "inventory_priority": bool(row.get("inventory_priority")),
        "backend_reason": row.get("agent_reasoning") or "",
        "manual_pair_rule": bool(row.get("manual_pair")),
    }


def _local_restaurant_now(restaurant: Any) -> datetime:
    timezone_name = str(getattr(restaurant, "timezone", "UTC") or "UTC")
    try:
        return timezone.localtime(timezone.now(), timezone=ZoneInfo(timezone_name))
    except Exception:
        return timezone.localtime(timezone.now())


def build_upsell_agent_context(
    *,
    restaurant: Any,
    setting: Any,
    cart_items: Sequence[Any],
    candidate_rows: Sequence[Mapping[str, Any]],
    trigger_point: str,
    hour: Optional[int] = None,
    source_item_id: Optional[int] = None,
    session_signals: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    menu_generation, config_generation = get_restaurant_upsell_cache_versions(
        getattr(restaurant, "id", 0)
    )
    venue_type = infer_venue_type(restaurant, cart_items)
    cart_roles = sorted(classify_cart_roles(cart_items))
    policy = get_aggressiveness_policy(getattr(setting, "aggressiveness", "moderate"))
    target_roles: List[str] = []
    for row in candidate_rows:
        target_role = row.get("target_role")
        if target_role and target_role not in target_roles:
            target_roles.append(str(target_role))
    if not target_roles:
        target_roles = get_gap_priority(set(cart_roles), venue_type=venue_type, hour=hour)

    candidate_payloads = [_candidate_payload(row) for row in list(candidate_rows)[:5]]
    recommendation_required = bool(candidate_payloads) and trigger_point in {
        "add_to_cart",
        "cart",
    }
    signals = dict(session_signals or {})
    local_now = _local_restaurant_now(restaurant)
    trigger_item = next(
        (item for item in cart_items if source_item_id and getattr(item, "id", None) == source_item_id),
        None,
    )
    session_context = {
        "suggestions_shown": int(signals.get("suggestions_shown") or 0),
        "session_cap": policy["session_cap"],
        "declined_roles": sorted(str(role) for role in (signals.get("declined_roles") or [])),
        "declined_item_ids": sorted(int(item_id) for item_id in (signals.get("declined_item_ids") or [])),
        "excluded_item_ids": sorted(int(item_id) for item_id in (signals.get("excluded_item_ids") or [])),
        "category_declines": signals.get("category_declines") or {},
        "category_views": signals.get("category_views") or {},
        "recently_removed_category_ids": signals.get("recently_removed_category_ids") or [],
    }
    smart_rules = {
        "always_suggest_candidate_ids": [
            candidate["id"] for candidate in candidate_payloads if candidate.get("manual_pair_rule")
        ],
        "never_suggest_item_ids": session_context["excluded_item_ids"],
        "venue_rule": f"Apply the {venue_type} behavior from the fixed system prompt.",
        "candidate_list_is_final": True,
    }
    pairing_summary = [
        {
            "candidate_id": candidate["id"],
            "pairing_score": candidate["pairing_score"],
            "co_order_frequency": candidate["co_order_frequency"],
            "acceptance_rate": candidate["acceptance_rate"],
        }
        for candidate in candidate_payloads
    ]

    context = {
        "knowledge_version": {
            "menu": menu_generation,
            "config": config_generation,
        },
        "restaurant": {
            "id": getattr(restaurant, "id", None),
            "name": getattr(restaurant, "resturent_name", ""),
            "venue_type": venue_type,
            "currency": getattr(restaurant, "currency", "AED"),
            "timezone": getattr(restaurant, "timezone", "UTC"),
            "current_time": local_now.isoformat(),
            "current_day": local_now.strftime("%A"),
            "current_hour": int(local_now.hour),
        },
        "settings": {
            "strategy": getattr(setting, "strategy", "balanced"),
            "aggressiveness": getattr(setting, "aggressiveness", "moderate"),
            "tone": getattr(setting, "tone", "friendly"),
            "session_cap": policy["session_cap"],
        },
        "trigger_point": trigger_point,
        "recommendation_required": recommendation_required,
        "trigger": {
            "point": trigger_point,
            "source_item_id": getattr(trigger_item, "id", source_item_id),
            "source_item_name": getattr(trigger_item, "item_name", "") if trigger_item else "",
        },
        "cart": [
            {
                "id": getattr(item, "id", None),
                "name": getattr(item, "item_name", ""),
                "description": getattr(item, "description", "") or "",
                "price": str(_as_decimal(getattr(item, "price", "0"))),
                "roles": sorted(classify_item_roles(item)),
            }
            for item in cart_items
        ],
        "cart_roles": cart_roles,
        "target_roles": target_roles,
        "candidates": candidate_payloads,
        "session": session_context,
        "session_signals": signals,
        "smart_rules": smart_rules,
        "pairing_summary": pairing_summary,
        "system_prompt": UPSELL_SYSTEM_PROMPT,
    }
    context["user_message"] = build_upsell_agent_user_message(context)
    return context


def _canonical_strategy_setting(value: Any) -> str:
    strategy = _normalize_text(value) or "balanced"
    return {
        "highest_margin": "max_revenue",
        "premium_experience": "max_revenue",
        "margin": "max_revenue",
        "inventory_movement": "move_stock",
        "volume": "move_stock",
        "highest_conversion": "balanced",
    }.get(strategy, strategy)


def _canonical_tone_setting(value: Any) -> str:
    tone = _normalize_text(value) or "friendly"
    return {"professional": "premium", "luxury_casual": "premium"}.get(tone, tone)


def build_upsell_agent_user_message(context: Mapping[str, Any]) -> str:
    restaurant = context.get("restaurant", {})
    session = context.get("session", {})
    candidates = context.get("candidates", [])
    strategy = _canonical_strategy_setting(context.get("settings", {}).get("strategy"))
    tone = _canonical_tone_setting(context.get("settings", {}).get("tone"))
    payload = {
        "r": {
            "venue_type": restaurant.get("venue_type"),
            "hour": restaurant.get("current_hour"),
        },
        "strategy": context.get("settings", {}).get("strategy"),
        "strategy_rule": STRATEGY_INSTRUCTIONS.get(strategy, STRATEGY_INSTRUCTIONS["balanced"]),
        "tone": context.get("settings", {}).get("tone"),
        "tone_rule": TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["friendly"]),
        "trigger": context.get("trigger", {"point": context.get("trigger_point")}),
        "recommendation_required": bool(context.get("recommendation_required")),
        "cart_roles": context.get("cart_roles", []),
        "cart": [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "price": item.get("price"),
                "roles": item.get("roles"),
            }
            for item in context.get("cart", [])
            if isinstance(item, Mapping)
        ],
        "targets": context.get("target_roles", []),
        "excluded": {
            "declined_roles": session.get("declined_roles", []),
            "declined_item_ids": session.get("declined_item_ids", []),
            "excluded_item_ids": session.get("excluded_item_ids", []),
        },
        "candidates": [
            {
                "id": candidate.get("id"),
                "name": candidate.get("name"),
                "description": str(candidate.get("description") or "")[:96],
                "price": candidate.get("price"),
                "roles": candidate.get("roles"),
                "target": candidate.get("target_role"),
                "score": candidate.get("score"),
                "pair": candidate.get("pairing_score"),
                "accept": candidate.get("acceptance_rate"),
                "orders_30d": candidate.get("order_count_30d"),
                "inventory_priority": candidate.get("inventory_priority"),
                "manual": candidate.get("manual_pair_rule"),
            }
            for candidate in candidates
            if isinstance(candidate, Mapping)
        ],
    }
    selection_instruction = (
        "A recommendation is required for this surface. The shortlist contains only valid items, "
        "so set suggest_nothing=false and choose exactly one candidate."
        if context.get("recommendation_required")
        else "Choose nothing only if every candidate conflicts with an explicit supplied rule."
    )
    return (
        "VALID CANDIDATE SHORTLIST is final. Choose only from candidates; return complete JSON. "
        f"{selection_instruction}\n"
        + json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    )


def _ollama_response_text(payload: Mapping[str, Any]) -> str:
    message = payload.get("message")
    return str(message.get("content") or "").strip() if isinstance(message, Mapping) else ""


def _openai_compatible_response_text(payload: Mapping[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping):
        return ""
    message = choices[0].get("message")
    return str(message.get("content") or "").strip() if isinstance(message, Mapping) else ""


def _get_vertex_authorized_session(credentials_json: str):
    """Build and cache an authenticated Vertex session without storing keys in code."""
    global _vertex_session, _vertex_session_fingerprint

    fingerprint = str(hash(credentials_json))
    with _vertex_session_lock:
        if _vertex_session is not None and _vertex_session_fingerprint == fingerprint:
            return _vertex_session

        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        credentials_info = json.loads(credentials_json)
        credentials = service_account.Credentials.from_service_account_info(
            credentials_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        _vertex_session = AuthorizedSession(credentials)
        _vertex_session_fingerprint = fingerprint
        return _vertex_session


def _parse_llm_json(raw_text: str) -> Optional[Dict[str, Any]]:
    text = str(raw_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError):
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(text[start : end + 1])
        except (TypeError, ValueError):
            return None
    return dict(parsed) if isinstance(parsed, Mapping) else None


def _canonicalize_llm_decision_for_context(
    decision: Optional[Mapping[str, Any]],
    context: Mapping[str, Any],
) -> Optional[Dict[str, Any]]:
    """Normalize model formatting without changing its recommendation choice."""
    if not isinstance(decision, Mapping) or not isinstance(decision.get("suggest_nothing"), bool):
        return None

    provider = str(decision.get("_llm_provider") or "")
    model = str(decision.get("_llm_model") or "")
    try:
        confidence = float(decision.get("confidence"))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(confidence, 1.0))

    reasoning = " ".join(str(decision.get("reasoning") or "").split()).strip()
    if bool(decision.get("suggest_nothing")):
        if context.get("recommendation_required"):
            return None
        reason = " ".join(str(decision.get("reason") or reasoning).split()).strip()
        if not reason:
            return None
        return {
            "suggest_nothing": True,
            "suggested_item_id": None,
            "suggested_item_name": None,
            "target_role": None,
            "reason": reason,
            "reasoning": reasoning or reason,
            "suggestion_copy": None,
            "confidence": confidence,
            "_llm_provider": provider,
            "_llm_model": model,
        }

    try:
        selected_id = int(decision.get("suggested_item_id"))
    except (TypeError, ValueError):
        return None
    candidates = [
        candidate
        for candidate in (context.get("candidates") or [])
        if isinstance(candidate, Mapping)
    ]
    selected = next(
        (candidate for candidate in candidates if int(candidate.get("id") or 0) == selected_id),
        None,
    )
    if not selected:
        return None

    valid_roles = {
        str(role)
        for role in (selected.get("roles") or [])
        if str(role) in ALL_KNOWLEDGE_ROLES
    }
    selected_target = str(selected.get("target_role") or "")
    if selected_target in ALL_KNOWLEDGE_ROLES:
        valid_roles.add(selected_target)
    target_role = str(decision.get("target_role") or "")
    if target_role not in valid_roles:
        target_role = selected_target if selected_target in valid_roles else next(iter(sorted(valid_roles)), "")
    if not target_role:
        return None

    suggestion_copy = " ".join(str(decision.get("suggestion_copy") or "").split()).strip()
    copy_words = re.findall(r"\b[\w'-]+\b", suggestion_copy)
    if not suggestion_copy or _FORBIDDEN_COPY_WORDS.search(suggestion_copy):
        return None
    if len(copy_words) > 15:
        suggestion_copy = " ".join(copy_words[:15]) + "."
    if not reasoning:
        reasoning = suggestion_copy.rstrip(".!?")

    return {
        "suggest_nothing": False,
        "suggested_item_id": selected_id,
        "suggested_item_name": str(selected.get("name") or "").strip(),
        "target_role": target_role,
        "reason": None,
        "reasoning": reasoning,
        "suggestion_copy": suggestion_copy,
        "confidence": confidence,
        "_llm_provider": provider,
        "_llm_model": model,
    }


def _call_ollama_upsell_llm(context: Mapping[str, Any]) -> Tuple[Optional[Dict[str, Any]], str]:
    base_url = str(getattr(settings, "OLLAMA_BASE_URL", "") or "").strip().rstrip("/")
    if not base_url:
        return None, "missing_base_url"
    if not re.fullmatch(r"https?://[^\s]+", base_url):
        logger.warning("Upsell LLM disabled for invalid Ollama base URL")
        return None, "invalid_base_url"

    model = str(getattr(settings, "OLLAMA_UPSELL_MODEL", "qwen3:4b-instruct") or "qwen3:4b-instruct").strip()
    if not re.fullmatch(r"[A-Za-z0-9._:/-]+", model):
        logger.warning("Upsell LLM disabled for invalid Ollama model name")
        return None, "invalid_model"

    timeout = max(0.5, min(float(getattr(settings, "OLLAMA_UPSELL_TIMEOUT_SECONDS", 2.0) or 2.0), 8.0))
    keep_alive = str(getattr(settings, "OLLAMA_KEEP_ALIVE", "10m") or "10m").strip()[:20]
    request_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": str(context.get("system_prompt") or UPSELL_SYSTEM_PROMPT)},
            {
                "role": "user",
                "content": str(context.get("user_message") or build_upsell_agent_user_message(context)),
            }
        ],
        "stream": False,
        "think": False,
        "format": UPSELL_DECISION_JSON_SCHEMA,
        "keep_alive": keep_alive,
        "options": {"temperature": 0.0, "num_predict": 300},
    }
    headers = {"Content-Type": "application/json"}
    api_key = str(getattr(settings, "OLLAMA_API_KEY", "") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = requests.post(
            f"{base_url}/api/chat",
            headers=headers,
            json=request_payload,
            timeout=timeout,
        )
    except requests.Timeout:
        return None, "timeout"
    except requests.RequestException:
        logger.warning("Upsell Ollama request failed", exc_info=True)
        return None, "network_error"

    if response.status_code < 200 or response.status_code >= 300:
        logger.warning("Upsell Ollama request returned HTTP %s", response.status_code)
        return None, f"http_{response.status_code}"

    try:
        response_payload = response.json()
    except ValueError:
        return None, "invalid_response"

    decision = _parse_llm_json(_ollama_response_text(response_payload))
    if not decision:
        return None, "invalid_json"
    decision["_llm_provider"] = "ollama"
    decision["_llm_model"] = model
    return decision, "ok"


def _call_openrouter_upsell_llm(context: Mapping[str, Any]) -> Tuple[Optional[Dict[str, Any]], str]:
    api_key = str(getattr(settings, "OPENROUTER_API_KEY", "") or "").strip()
    primary_model = str(
        getattr(settings, "OPENROUTER_UPSELL_MODEL", "openrouter/free") or "openrouter/free"
    ).strip()
    if not api_key:
        return None, "missing_openrouter_key"
    if len(api_key) < 20 or re.search(r"\s", api_key):
        logger.warning("Upsell LLM disabled for invalid OpenRouter API key format")
        return None, "invalid_openrouter_key"
    if not re.fullmatch(r"[A-Za-z0-9._:/-]+", primary_model):
        logger.warning("Upsell LLM disabled for invalid OpenRouter model name")
        return None, "invalid_model"

    fallback_models_raw = str(
        getattr(settings, "OPENROUTER_UPSELL_FALLBACK_MODELS", "openrouter/free") or "openrouter/free"
    )
    fast_free_models_raw = str(
        getattr(
            settings,
            "OPENROUTER_UPSELL_FAST_FREE_MODELS",
            "meta-llama/llama-3.2-3b-instruct:free",
        )
        or ""
    )
    paid_fallback_models_raw = str(
        getattr(
            settings,
            "OPENROUTER_UPSELL_PAID_FALLBACK_MODELS",
            (
                "mistralai/mistral-nemo,"
                "meta-llama/llama-3.1-8b-instruct,"
                "openai/gpt-oss-20b"
            ),
        )
        or ""
    )
    fast_free_models = fast_free_models_raw.split(",")
    free_models = [primary_model, *fallback_models_raw.split(","), "openrouter/free"]
    low_latency_models = paid_fallback_models_raw.split(",")
    prefer_low_latency = bool(
        getattr(settings, "OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS", True)
    )
    model_priority = (
        [*low_latency_models, *fast_free_models, *free_models]
        if prefer_low_latency
        else [*free_models, *low_latency_models]
    )
    models: List[str] = []
    for candidate_model in model_priority:
        candidate_model = candidate_model.strip()
        if not candidate_model or candidate_model in models:
            continue
        if not re.fullmatch(r"[A-Za-z0-9._:/-]+", candidate_model):
            logger.warning("Ignoring invalid OpenRouter fallback model name")
            continue
        models.append(candidate_model)

    def is_free_model(model_name: str) -> bool:
        return model_name == "openrouter/free" or model_name.endswith(":free")

    free_rate_limited = bool(cache.get(_OPENROUTER_FREE_RATE_LIMIT_CACHE_KEY))
    if free_rate_limited:
        models = [model for model in models if not is_free_model(model)]
    if not models:
        return None, "http_429" if free_rate_limited else "invalid_model"

    timeout = max(
        0.5,
        min(float(getattr(settings, "OPENROUTER_UPSELL_TIMEOUT_SECONDS", 3.0) or 3.0), 8.0),
    )
    total_timeout = max(
        timeout,
        min(
            float(getattr(settings, "OPENROUTER_UPSELL_TOTAL_TIMEOUT_SECONDS", 4.0) or 4.0),
            8.0,
        ),
    )
    max_tokens = max(
        180,
        min(int(getattr(settings, "OPENROUTER_UPSELL_MAX_OUTPUT_TOKENS", 220) or 220), 260),
    )
    messages = [
        {"role": "system", "content": str(context.get("system_prompt") or UPSELL_SYSTEM_PROMPT)},
        {
            "role": "user",
            "content": str(context.get("user_message") or build_upsell_agent_user_message(context)),
        },
    ]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://officialcleverdiningcustomer.netlify.app",
        "X-OpenRouter-Title": "CleverDining AI Upsell",
    }
    last_status = "network_error"
    rate_limited_free_models = 0
    total_free_models = sum(1 for model in models if is_free_model(model))
    request_deadline = time.monotonic() + total_timeout
    low_latency_route = [
        model.strip()
        for model in low_latency_models
        if model.strip() in models and not is_free_model(model.strip())
    ][:1] if prefer_low_latency else []
    fallback_models = [model for model in models if model not in low_latency_route]

    if low_latency_route:
        request_payload = {
            "model": low_latency_route[0],
            "messages": messages,
            "response_format": _openrouter_structured_response_format(),
            "temperature": 0.0,
            "max_tokens": max_tokens,
            "stream": False,
            "provider": {
                "sort": {"by": "latency", "partition": "none"},
                "preferred_max_latency": {"p90": 3},
                "max_price": {"prompt": 0.2, "completion": 0.8},
                "require_parameters": True,
            },
        }
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=request_payload,
                timeout=min(timeout, total_timeout),
            )
        except requests.Timeout:
            response = None
            last_status = "timeout"
            logger.warning("Upsell OpenRouter latency-routed request timed out")
        except requests.RequestException:
            response = None
            last_status = "network_error"
            logger.warning("Upsell OpenRouter latency-routed request failed", exc_info=True)

        if response is not None:
            if response.status_code in {401, 403}:
                return None, f"http_{response.status_code}"
            if response.status_code < 200 or response.status_code >= 300:
                last_status = f"http_{response.status_code}"
                logger.warning(
                    "Upsell OpenRouter latency router returned HTTP %s",
                    response.status_code,
                )
            else:
                try:
                    response_payload = response.json()
                except ValueError:
                    response_payload = None
                    last_status = "invalid_response"
                if response_payload:
                    decision = _parse_llm_json(_openai_compatible_response_text(response_payload))
                    if decision:
                        decision["_llm_provider"] = "openrouter"
                        decision["_llm_model"] = str(
                            response_payload.get("model") or low_latency_route[0]
                        )
                        return decision, "ok"
                    last_status = "invalid_json"
                    logger.warning("Upsell OpenRouter latency router returned invalid JSON")

    for model in fallback_models:
        remaining_time = request_deadline - time.monotonic()
        if remaining_time < 0.5:
            last_status = "timeout"
            break
        request_payload = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
            "max_tokens": max_tokens,
            "stream": False,
        }
        attempt_timeout = max(0.5, min(timeout, remaining_time))
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=request_payload,
                timeout=attempt_timeout,
            )
        except requests.Timeout:
            last_status = "timeout"
            logger.warning("Upsell OpenRouter model %s timed out", model)
            continue
        except requests.RequestException:
            last_status = "network_error"
            logger.warning("Upsell OpenRouter model %s request failed", model, exc_info=True)
            continue

        if response.status_code < 200 or response.status_code >= 300:
            last_status = f"http_{response.status_code}"
            logger.warning("Upsell OpenRouter model %s returned HTTP %s", model, response.status_code)
            if is_free_model(model):
                if response.status_code == 429:
                    rate_limited_free_models += 1
                    if rate_limited_free_models == total_free_models:
                        cooldown = max(
                            30,
                            min(
                                int(
                                    getattr(
                                        settings,
                                        "OPENROUTER_UPSELL_FREE_RATE_LIMIT_COOLDOWN_SECONDS",
                                        300,
                                    )
                                    or 300
                                ),
                                900,
                            ),
                        )
                        cache.set(_OPENROUTER_FREE_RATE_LIMIT_CACHE_KEY, True, timeout=cooldown)
            # Authentication and permission failures apply to every model.
            if response.status_code in {401, 403}:
                break
            continue
        try:
            response_payload = response.json()
        except ValueError:
            last_status = "invalid_response"
            continue

        decision = _parse_llm_json(_openai_compatible_response_text(response_payload))
        if not decision:
            last_status = "invalid_json"
            logger.warning("Upsell OpenRouter model %s returned invalid JSON", model)
            continue
        decision["_llm_provider"] = "openrouter"
        decision["_llm_model"] = str(response_payload.get("model") or model)
        if is_free_model(model):
            cache.delete(_OPENROUTER_FREE_RATE_LIMIT_CACHE_KEY)
        return decision, "ok"

    return None, last_status


def call_openrouter_upsell_llm_batch(
    contexts: Sequence[Mapping[str, Any]],
) -> Tuple[Dict[int, Dict[str, Any]], str]:
    """Ask the LLM to judge several independently validated shortlists at once."""
    api_key = str(getattr(settings, "OPENROUTER_API_KEY", "") or "").strip()
    if not api_key:
        return {}, "missing_openrouter_key"
    if len(api_key) < 20 or re.search(r"\s", api_key):
        return {}, "invalid_openrouter_key"

    context_by_source: Dict[int, Mapping[str, Any]] = {}
    batch_entries: List[Dict[str, Any]] = []
    for context in contexts:
        source_item_id = _context_source_item_id(context)
        candidates = [
            candidate
            for candidate in (context.get("candidates") or [])
            if isinstance(candidate, Mapping)
        ]
        if not source_item_id or not candidates or source_item_id in context_by_source:
            continue
        context_by_source[source_item_id] = context
        strategy = _canonical_strategy_setting((context.get("settings") or {}).get("strategy"))
        tone = _canonical_tone_setting((context.get("settings") or {}).get("tone"))
        batch_entries.append(
            {
                "source_item_id": source_item_id,
                "venue_type": (context.get("restaurant") or {}).get("venue_type"),
                "strategy": (context.get("settings") or {}).get("strategy"),
                "strategy_rule": STRATEGY_INSTRUCTIONS.get(
                    strategy,
                    STRATEGY_INSTRUCTIONS["balanced"],
                ),
                "tone": (context.get("settings") or {}).get("tone"),
                "tone_rule": TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["friendly"]),
                "cart": [
                    {
                        "id": item.get("id"),
                        "name": item.get("name"),
                        "price": item.get("price"),
                        "roles": item.get("roles"),
                    }
                    for item in (context.get("cart") or [])
                    if isinstance(item, Mapping)
                ],
                "target_roles": context.get("target_roles") or [],
                "candidates": [
                    {
                        "id": candidate.get("id"),
                        "name": candidate.get("name"),
                        "description": str(candidate.get("description") or "")[:80],
                        "price": candidate.get("price"),
                        "roles": candidate.get("roles"),
                        "target_role": candidate.get("target_role"),
                        "score": candidate.get("score"),
                        "pairing_score": candidate.get("pairing_score"),
                        "acceptance_rate": candidate.get("acceptance_rate"),
                        "order_count_30d": candidate.get("order_count_30d"),
                        "inventory_priority": candidate.get("inventory_priority"),
                    }
                    for candidate in candidates
                ],
            }
        )
    if not batch_entries:
        return {}, "no_candidates"

    primary_model = str(
        getattr(settings, "OPENROUTER_UPSELL_MODEL", "openrouter/free") or "openrouter/free"
    ).strip()
    paid_models = str(
        getattr(settings, "OPENROUTER_UPSELL_PAID_FALLBACK_MODELS", "mistralai/mistral-nemo")
        or ""
    ).split(",")
    free_models = str(
        getattr(settings, "OPENROUTER_UPSELL_FALLBACK_MODELS", "openrouter/free")
        or ""
    ).split(",")
    prefer_low_latency = bool(
        getattr(settings, "OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS", True)
    )
    model_priority = (
        [*paid_models, primary_model, *free_models]
        if prefer_low_latency
        else [primary_model, *free_models, *paid_models]
    )
    models: List[str] = []
    free_rate_limited = bool(cache.get(_OPENROUTER_FREE_RATE_LIMIT_CACHE_KEY))
    for model in model_priority:
        model = model.strip()
        if not model or model in models or not re.fullmatch(r"[A-Za-z0-9._:/-]+", model):
            continue
        if free_rate_limited and (model == "openrouter/free" or model.endswith(":free")):
            continue
        models.append(model)
    if not models:
        return {}, "invalid_model"

    timeout = max(
        4.0,
        min(
            float(getattr(settings, "OPENROUTER_UPSELL_BATCH_TIMEOUT_SECONDS", 20.0) or 20.0),
            60.0,
        ),
    )
    max_tokens = max(
        600,
        min(
            int(getattr(settings, "OPENROUTER_UPSELL_BATCH_MAX_OUTPUT_TOKENS", 1400) or 1400),
            4000,
        ),
    )
    batch_prompt = (
        "The backend has already applied every business rule and supplied independent valid "
        "candidate shortlists. For each source_item_id, you alone choose the final item and copy. "
        "Never choose outside that entry's candidates. Prefer a missing meal role and varied, "
        "natural pairings. Return one decision for every source_item_id. Each decision must include "
        "source_item_id plus exactly the standard upsell keys. Output only JSON as "
        "{\"decisions\":[...]} with no markdown.\n"
        + json.dumps({"entries": batch_entries}, ensure_ascii=True, separators=(",", ":"))
    )
    messages = [
        {"role": "system", "content": UPSELL_SYSTEM_PROMPT},
        {"role": "user", "content": batch_prompt},
    ]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://officialcleverdiningcustomer.netlify.app",
        "X-OpenRouter-Title": "CleverDining AI Upsell Warmup",
    }
    last_status = "network_error"
    for model in models:
        request_payload = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
            "max_tokens": max_tokens,
            "stream": False,
        }
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=request_payload,
                timeout=timeout,
            )
        except requests.Timeout:
            last_status = "timeout"
            continue
        except requests.RequestException:
            logger.warning("Upsell OpenRouter batch request failed", exc_info=True)
            last_status = "network_error"
            continue

        if response.status_code < 200 or response.status_code >= 300:
            last_status = f"http_{response.status_code}"
            if response.status_code in {401, 403}:
                break
            continue
        try:
            response_payload = response.json()
        except ValueError:
            last_status = "invalid_response"
            continue
        parsed = _parse_llm_json(_openai_compatible_response_text(response_payload))
        raw_decisions = parsed.get("decisions") if isinstance(parsed, Mapping) else None
        if not isinstance(raw_decisions, list):
            last_status = "invalid_json"
            continue

        resolved: Dict[int, Dict[str, Any]] = {}
        response_model = str(response_payload.get("model") or model)
        for raw_decision in raw_decisions:
            if not isinstance(raw_decision, Mapping):
                continue
            try:
                source_item_id = int(raw_decision.get("source_item_id") or 0)
            except (TypeError, ValueError):
                continue
            context = context_by_source.get(source_item_id)
            if not context or source_item_id in resolved:
                continue
            decision = dict(raw_decision)
            decision.pop("source_item_id", None)
            decision["_llm_provider"] = "openrouter"
            decision["_llm_model"] = response_model
            canonical = _canonicalize_llm_decision_for_context(decision, context)
            if canonical:
                resolved[source_item_id] = canonical
        if resolved:
            return resolved, "ok"
        last_status = "invalid_llm_response"

    return {}, last_status


def _call_vertex_upsell_llm(context: Mapping[str, Any]) -> Tuple[Optional[Dict[str, Any]], str]:
    project_id = str(getattr(settings, "VERTEX_UPSELL_PROJECT_ID", "") or "").strip()
    location = str(getattr(settings, "VERTEX_UPSELL_LOCATION", "us-central1") or "us-central1").strip()
    model = str(
        getattr(settings, "VERTEX_UPSELL_MODEL", "openai/gpt-oss-20b-maas")
        or "openai/gpt-oss-20b-maas"
    ).strip()
    credentials_json = str(getattr(settings, "VERTEX_UPSELL_SERVICE_ACCOUNT_JSON", "") or "").strip()

    if not project_id:
        return None, "missing_vertex_project"
    if not credentials_json:
        return None, "missing_vertex_credentials"
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", project_id):
        return None, "invalid_vertex_project"
    if not re.fullmatch(r"[a-z0-9-]+", location):
        return None, "invalid_vertex_location"
    if not re.fullmatch(r"[A-Za-z0-9._:/-]+", model):
        return None, "invalid_vertex_model"

    try:
        session = _get_vertex_authorized_session(credentials_json)
    except Exception:
        logger.warning("Upsell Vertex credentials could not be loaded", exc_info=True)
        return None, "invalid_vertex_credentials"

    timeout = max(0.5, min(float(getattr(settings, "VERTEX_UPSELL_TIMEOUT_SECONDS", 3.0) or 3.0), 8.0))
    max_tokens = max(300, min(int(getattr(settings, "VERTEX_UPSELL_MAX_OUTPUT_TOKENS", 300) or 300), 350))
    request_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": str(context.get("system_prompt") or UPSELL_SYSTEM_PROMPT)},
            {
                "role": "user",
                "content": str(context.get("user_message") or build_upsell_agent_user_message(context)),
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
        "max_tokens": max_tokens,
        "stream": False,
    }
    endpoint = (
        f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}"
        f"/locations/{location}/endpoints/openapi/chat/completions"
    )

    try:
        response = session.post(endpoint, json=request_payload, timeout=timeout)
    except requests.Timeout:
        return None, "timeout"
    except Exception:
        logger.warning("Upsell Vertex request failed", exc_info=True)
        return None, "network_error"

    if response.status_code < 200 or response.status_code >= 300:
        logger.warning("Upsell Vertex request returned HTTP %s", response.status_code)
        return None, f"http_{response.status_code}"
    try:
        response_payload = response.json()
    except ValueError:
        return None, "invalid_response"

    decision = _parse_llm_json(_openai_compatible_response_text(response_payload))
    if not decision:
        return None, "invalid_json"
    decision["_llm_provider"] = "vertex_maas"
    decision["_llm_model"] = model
    return decision, "ok"


def _upsell_llm_decision_cache_key(context: Mapping[str, Any], cache_scope: str) -> str:
    restaurant = context.get("restaurant") if isinstance(context.get("restaurant"), Mapping) else {}
    settings_context = context.get("settings") if isinstance(context.get("settings"), Mapping) else {}
    cart = context.get("cart") if isinstance(context.get("cart"), list) else []
    candidates = context.get("candidates") if isinstance(context.get("candidates"), list) else []
    payload = {
        "scope": cache_scope,
        "trigger_point": context.get("trigger_point"),
        "recommendation_required": bool(context.get("recommendation_required")),
        "knowledge_version": context.get("knowledge_version") or {},
        "restaurant": {
            "id": restaurant.get("id"),
            "venue_type": restaurant.get("venue_type"),
            "current_day": restaurant.get("current_day"),
            "current_hour": restaurant.get("current_hour"),
        },
        "settings": {
            "strategy": settings_context.get("strategy"),
            "aggressiveness": settings_context.get("aggressiveness"),
            "tone": settings_context.get("tone"),
        },
        "cart": sorted(
            (
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "price": item.get("price"),
                    "roles": item.get("roles"),
                }
                for item in cart
                if isinstance(item, Mapping)
            ),
            key=lambda item: int(item.get("id") or 0),
        ),
        "target_roles": context.get("target_roles") or [],
        "candidates": [
            {
                "id": candidate.get("id"),
                "name": candidate.get("name"),
                "price": candidate.get("price"),
                "target_role": candidate.get("target_role"),
                "score": candidate.get("score"),
                "pairing_score": candidate.get("pairing_score"),
                "acceptance_rate": candidate.get("acceptance_rate"),
                "order_count_30d": candidate.get("order_count_30d"),
                "inventory_priority": candidate.get("inventory_priority"),
            }
            for candidate in candidates
            if isinstance(candidate, Mapping)
        ],
    }
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    return f"upsell:llm-decision:v2:{digest}"


def _persistent_upsell_context_payload(
    context: Mapping[str, Any],
    cache_scope: str,
) -> Dict[str, Any]:
    """Stable context used for precomputed decisions; wall-clock time is excluded."""
    restaurant = context.get("restaurant") if isinstance(context.get("restaurant"), Mapping) else {}
    settings_context = context.get("settings") if isinstance(context.get("settings"), Mapping) else {}
    cart = context.get("cart") if isinstance(context.get("cart"), list) else []
    candidates = context.get("candidates") if isinstance(context.get("candidates"), list) else []
    return {
        "scope": cache_scope,
        "trigger_point": context.get("trigger_point"),
        "recommendation_required": bool(context.get("recommendation_required")),
        "restaurant": {
            "id": restaurant.get("id"),
            "venue_type": restaurant.get("venue_type"),
        },
        "settings": {
            "strategy": settings_context.get("strategy"),
            "aggressiveness": settings_context.get("aggressiveness"),
            "tone": settings_context.get("tone"),
        },
        "cart": sorted(
            (
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "price": item.get("price"),
                    "roles": item.get("roles"),
                }
                for item in cart
                if isinstance(item, Mapping)
            ),
            key=lambda item: int(item.get("id") or 0),
        ),
        "target_roles": context.get("target_roles") or [],
        "candidates": [
            {
                "id": candidate.get("id"),
                "name": candidate.get("name"),
                "price": candidate.get("price"),
                "roles": candidate.get("roles"),
                "target_role": candidate.get("target_role"),
                "score": candidate.get("score"),
                "pairing_score": candidate.get("pairing_score"),
                "acceptance_rate": candidate.get("acceptance_rate"),
                "order_count_30d": candidate.get("order_count_30d"),
                "inventory_priority": candidate.get("inventory_priority"),
            }
            for candidate in candidates
            if isinstance(candidate, Mapping)
        ],
    }


def _persistent_upsell_context_key(context: Mapping[str, Any], cache_scope: str) -> str:
    payload = _persistent_upsell_context_payload(context, cache_scope)
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()


def _persistent_settings_signature(context: Mapping[str, Any]) -> str:
    settings_context = context.get("settings") if isinstance(context.get("settings"), Mapping) else {}
    payload = {
        "strategy": settings_context.get("strategy"),
        "aggressiveness": settings_context.get("aggressiveness"),
        "tone": settings_context.get("tone"),
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()


def _context_source_item_id(context: Mapping[str, Any]) -> Optional[int]:
    trigger = context.get("trigger") if isinstance(context.get("trigger"), Mapping) else {}
    try:
        source_item_id = int(trigger.get("source_item_id") or 0)
    except (TypeError, ValueError):
        return None
    return source_item_id if source_item_id > 0 else None


def _context_cart_item_ids(context: Mapping[str, Any]) -> List[int]:
    cart = context.get("cart") if isinstance(context.get("cart"), list) else []
    item_ids: List[int] = []
    for item in cart:
        if not isinstance(item, Mapping):
            continue
        try:
            item_id = int(item.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if item_id > 0 and item_id not in item_ids:
            item_ids.append(item_id)
    return item_ids


def persist_upsell_llm_decision(
    context: Mapping[str, Any],
    decision: Mapping[str, Any],
    *,
    cache_scope: str,
    source_item_id: Optional[int] = None,
) -> bool:
    """Persist only an LLM-produced decision; request-time validation still applies."""
    restaurant = context.get("restaurant") if isinstance(context.get("restaurant"), Mapping) else {}
    try:
        restaurant_id = int(restaurant.get("id") or 0)
    except (TypeError, ValueError):
        return False
    if restaurant_id <= 0 or not isinstance(decision, Mapping):
        return False

    canonical = _canonicalize_llm_decision_for_context(decision, context)
    if not canonical:
        return False
    try:
        selected_item_id = int(canonical.get("suggested_item_id") or 0) or None
    except (TypeError, ValueError):
        selected_item_id = None
    candidate_ids = [
        int(candidate.get("id"))
        for candidate in (context.get("candidates") or [])
        if isinstance(candidate, Mapping) and str(candidate.get("id") or "").isdigit()
    ]
    resolved_source_item_id = source_item_id or _context_source_item_id(context)
    cache_days = max(
        1,
        min(int(getattr(settings, "UPSELL_LLM_PERSISTENT_CACHE_DAYS", 7) or 7), 30),
    )
    try:
        from .models import UpsellLLMDecision

        UpsellLLMDecision.objects.update_or_create(
            context_key=_persistent_upsell_context_key(context, cache_scope),
            defaults={
                "restaurant_id": restaurant_id,
                "source_item_id": resolved_source_item_id,
                "selected_item_id": selected_item_id,
                "settings_signature": _persistent_settings_signature(context),
                "candidate_ids": candidate_ids,
                "decision": canonical,
                "expires_at": timezone.now() + timedelta(days=cache_days),
            },
        )
    except DatabaseError:
        logger.warning("Persistent upsell decision table is unavailable", exc_info=True)
        return False
    return True


def _load_persisted_upsell_llm_decision(
    context: Mapping[str, Any],
    *,
    cache_scope: str,
) -> Optional[Dict[str, Any]]:
    restaurant = context.get("restaurant") if isinstance(context.get("restaurant"), Mapping) else {}
    try:
        restaurant_id = int(restaurant.get("id") or 0)
    except (TypeError, ValueError):
        return None
    if restaurant_id <= 0:
        return None

    try:
        from .models import UpsellLLMDecision

        now = timezone.now()
        record = UpsellLLMDecision.objects.filter(
            restaurant_id=restaurant_id,
            context_key=_persistent_upsell_context_key(context, cache_scope),
            expires_at__gt=now,
        ).first()
        cache_source = "exact"
        if record and isinstance(record.decision, Mapping):
            decision = _canonicalize_llm_decision_for_context(record.decision, context)
            if decision:
                decision["_llm_persistent_cache_hit"] = True
                decision["_llm_persistent_cache_source"] = cache_source
                return decision

        cart_item_ids = _context_cart_item_ids(context)
        source_item_id = _context_source_item_id(context)
        if source_item_id and source_item_id in cart_item_ids:
            cart_item_ids.remove(source_item_id)
            cart_item_ids.insert(0, source_item_id)
        if cart_item_ids:
            records = list(
                UpsellLLMDecision.objects.filter(
                    restaurant_id=restaurant_id,
                    source_item_id__in=cart_item_ids,
                    settings_signature=_persistent_settings_signature(context),
                    expires_at__gt=now,
                )
                .order_by("-updated_at")
                [:50]
            )
            records.sort(
                key=lambda candidate_record: (
                    0 if candidate_record.source_item_id == source_item_id else 1,
                    -candidate_record.updated_at.timestamp(),
                )
            )
            for candidate_record in records:
                if not isinstance(candidate_record.decision, Mapping):
                    continue
                decision = _canonicalize_llm_decision_for_context(candidate_record.decision, context)
                if not decision:
                    continue
                decision["_llm_persistent_cache_hit"] = True
                decision["_llm_persistent_cache_source"] = "cart_source_item"
                decision["_llm_persistent_source_item_id"] = candidate_record.source_item_id
                return decision
        return None
    except DatabaseError:
        logger.warning("Could not read persistent upsell decision", exc_info=True)
        return None


def load_precomputed_upsell_llm_decision(
    context: Mapping[str, Any],
    *,
    cache_scope: str,
) -> Optional[Dict[str, Any]]:
    """Read an existing validated decision without ever invoking a provider."""
    return _load_persisted_upsell_llm_decision(context, cache_scope=cache_scope)


def call_upsell_llm(
    context: Mapping[str, Any],
    *,
    cache_scope: str = "",
    force_refresh: bool = False,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """Call the configured model for shortlist judgment only."""
    if not context.get("candidates"):
        return None, "no_candidates"
    if not bool(getattr(settings, "UPSELL_LLM_ENABLED", True)):
        return None, "disabled"

    decision_cache_key = ""
    if cache_scope and not force_refresh:
        decision_cache_key = _upsell_llm_decision_cache_key(context, cache_scope)
        cached_decision = cache.get(decision_cache_key)
        if isinstance(cached_decision, Mapping):
            decision = dict(cached_decision)
            decision["_llm_cache_hit"] = True
            return decision, "ok"
        persisted_decision = _load_persisted_upsell_llm_decision(
            context,
            cache_scope=cache_scope,
        )
        if persisted_decision:
            cache_seconds = max(
                30,
                min(int(getattr(settings, "UPSELL_LLM_DECISION_CACHE_SECONDS", 900) or 900), 3600),
            )
            cache.set(decision_cache_key, dict(persisted_decision), timeout=cache_seconds)
            return persisted_decision, "ok"
    elif cache_scope:
        decision_cache_key = _upsell_llm_decision_cache_key(context, cache_scope)

    provider = str(getattr(settings, "UPSELL_LLM_PROVIDER", "openrouter") or "openrouter").strip().lower()

    def invoke_provider() -> Tuple[Optional[Dict[str, Any]], str]:
        if provider == "openrouter":
            return _call_openrouter_upsell_llm(context)
        if provider == "vertex":
            return _call_vertex_upsell_llm(context)
        if provider == "ollama":
            return _call_ollama_upsell_llm(context)
        logger.warning("Upsell LLM disabled for unsupported provider %s", provider)
        return None, "invalid_provider"

    decision: Optional[Dict[str, Any]] = None
    status = "invalid_llm_response"
    attempts = 2 if context.get("recommendation_required") else 1
    for attempt in range(attempts):
        raw_decision, status = invoke_provider()
        if raw_decision and status == "ok":
            decision = _canonicalize_llm_decision_for_context(raw_decision, context)
            if decision:
                break
            status = "invalid_llm_response"
        if status not in {"invalid_json", "invalid_llm_response"}:
            break
        if attempt + 1 < attempts:
            logger.info("Retrying mandatory upsell LLM selection after %s", status)

    if not decision or status != "ok":
        return None, status

    if decision_cache_key and decision and status == "ok":
        cache_seconds = max(
            30,
            min(int(getattr(settings, "UPSELL_LLM_DECISION_CACHE_SECONDS", 900) or 900), 3600),
        )
        cache.set(decision_cache_key, dict(decision), timeout=cache_seconds)
        persist_upsell_llm_decision(
            context,
            decision,
            cache_scope=cache_scope,
        )
    return decision, status


def request_upsell_llm_decision(
    context: Mapping[str, Any],
    *,
    cache_scope: str,
    background: bool = False,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """Return a cached decision or start one non-blocking LLM request."""
    if not background:
        return call_upsell_llm(context, cache_scope=cache_scope)
    if not context.get("candidates"):
        return None, "no_candidates"
    if not bool(getattr(settings, "UPSELL_LLM_ENABLED", True)):
        return None, "disabled"

    decision_cache_key = _upsell_llm_decision_cache_key(context, cache_scope)
    cached_decision = cache.get(decision_cache_key)
    if isinstance(cached_decision, Mapping):
        decision = dict(cached_decision)
        decision["_llm_cache_hit"] = True
        return decision, "ok"

    job_status_key = f"{decision_cache_key}:job-status"
    previous_status = cache.get(job_status_key)
    if isinstance(previous_status, str):
        return None, previous_status

    with _upsell_llm_jobs_lock:
        if decision_cache_key in _upsell_llm_jobs:
            return None, "pending"
        _upsell_llm_jobs.add(decision_cache_key)

    cache.set(job_status_key, "pending", timeout=30)
    context_snapshot = copy.deepcopy(dict(context))

    def resolve_decision() -> None:
        try:
            decision, llm_status = call_upsell_llm(
                context_snapshot,
                cache_scope=cache_scope,
            )
            if decision and llm_status == "ok":
                cache.delete(job_status_key)
            else:
                cache.set(job_status_key, llm_status, timeout=15)
        except Exception:
            logger.exception("Background upsell LLM decision failed")
            cache.set(job_status_key, "internal_error", timeout=15)
        finally:
            with _upsell_llm_jobs_lock:
                _upsell_llm_jobs.discard(decision_cache_key)

    try:
        threading.Thread(
            target=resolve_decision,
            name=f"upsell-llm-{decision_cache_key[-10:]}",
            daemon=True,
        ).start()
    except Exception:
        with _upsell_llm_jobs_lock:
            _upsell_llm_jobs.discard(decision_cache_key)
        cache.set(job_status_key, "internal_error", timeout=15)
        logger.exception("Could not start background upsell LLM decision")
        return None, "internal_error"

    return None, "pending"


def no_upsell_agent_decision(*, reason: str) -> Dict[str, Any]:
    """Return no recommendation when the LLM did not make a valid decision."""
    decision_source = "llm_invalid" if reason.startswith("invalid_llm") else "llm_unavailable"
    if reason == "no_candidates":
        decision_source = "no_candidates"
    return {
        "suggest_nothing": True,
        "reason": "No validated LLM recommendation is available.",
        "reasoning": f"No customer-facing recommendation was produced because the LLM status was {reason}.",
        "confidence": 0.0,
        "decision_source": decision_source,
        "llm_status": reason,
    }


_FORBIDDEN_COPY_WORDS = re.compile(r"\b(?:upsell|ai|algorithm|recommend(?:ed|ation|ing)?)\b", re.IGNORECASE)


def _has_complete_llm_shape(decision: Mapping[str, Any]) -> bool:
    required = set(UPSELL_DECISION_JSON_SCHEMA["required"])
    if not required.issubset(decision.keys()):
        return False
    if not isinstance(decision.get("suggest_nothing"), bool):
        return False
    confidence = decision.get("confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        return False
    return 0 <= float(confidence) <= 1


def _is_valid_customer_copy(value: Any) -> bool:
    copy = str(value or "").strip()
    if not copy or _FORBIDDEN_COPY_WORDS.search(copy):
        return False
    words = re.findall(r"\b[\w'-]+\b", copy)
    return 1 <= len(words) <= 15


def validated_upsell_agent_decision(
    llm_decision: Optional[Mapping[str, Any]],
    candidate_rows: Sequence[Mapping[str, Any]],
    *,
    llm_status: str = "llm_not_called",
) -> Dict[str, Any]:
    if not llm_decision:
        return no_upsell_agent_decision(reason=llm_status)
    if not _has_complete_llm_shape(llm_decision):
        return no_upsell_agent_decision(reason="invalid_llm_response")

    if bool(llm_decision.get("suggest_nothing")):
        if not str(llm_decision.get("reason") or "").strip() or not str(llm_decision.get("reasoning") or "").strip():
            return no_upsell_agent_decision(reason="invalid_llm_response")
        if any(
            llm_decision.get(field) is not None
            for field in ("suggested_item_id", "suggested_item_name", "target_role", "suggestion_copy")
        ):
            return no_upsell_agent_decision(reason="invalid_llm_response")
        return {
            "suggest_nothing": True,
            "reason": str(llm_decision["reason"]).strip(),
            "reasoning": str(llm_decision["reasoning"]).strip(),
            "confidence": float(llm_decision["confidence"]),
            "decision_source": "llm",
            "llm_provider": str(llm_decision.get("_llm_provider") or ""),
            "llm_model": str(llm_decision.get("_llm_model") or ""),
        }

    valid_by_id = {str(getattr(row.get("item"), "id", "")): row for row in candidate_rows}
    suggested_id = str(llm_decision.get("suggested_item_id") or "")
    selected = valid_by_id.get(suggested_id)
    if not selected:
        return no_upsell_agent_decision(reason="invalid_llm_item")

    item = selected.get("item")
    item_name = str(getattr(item, "item_name", "") or "").strip()
    if str(llm_decision.get("suggested_item_name") or "").strip() != item_name:
        return no_upsell_agent_decision(reason="invalid_llm_response")

    target_role = str(llm_decision.get("target_role") or "").strip()
    valid_target_roles = set(selected.get("candidate_roles") or classify_item_roles(item))
    selected_target_role = str(selected.get("target_role") or "").strip()
    if selected_target_role:
        valid_target_roles.add(selected_target_role)
    if target_role not in ALL_KNOWLEDGE_ROLES or target_role not in valid_target_roles:
        return no_upsell_agent_decision(reason="invalid_llm_response")

    reasoning = str(llm_decision.get("reasoning") or "").strip()
    suggestion_copy = str(llm_decision.get("suggestion_copy") or "").strip()
    if not reasoning or not _is_valid_customer_copy(suggestion_copy):
        return no_upsell_agent_decision(reason="invalid_llm_response")

    return {
        "suggest_nothing": False,
        "suggested_item_id": getattr(item, "id", None),
        "suggested_item_name": item_name,
        "target_role": target_role,
        "reasoning": reasoning,
        "suggestion_copy": suggestion_copy,
        "confidence": float(llm_decision["confidence"]),
        "decision_source": "llm",
        "llm_provider": str(llm_decision.get("_llm_provider") or ""),
        "llm_model": str(llm_decision.get("_llm_model") or ""),
    }
