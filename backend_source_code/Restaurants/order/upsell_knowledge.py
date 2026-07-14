from __future__ import annotations

import json
import logging
import re
import threading
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

import requests
from django.conf import settings


logger = logging.getLogger(__name__)

_vertex_session_lock = threading.Lock()
_vertex_session = None
_vertex_session_fingerprint = ""


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

UPSELL_SYSTEM_PROMPT = """
You are the CleverDining AI Upsell Agent. You operate inside a restaurant ordering platform.
Your job is to choose the single best valid upsell item for the customer's current cart.

Hard split:
- Backend owns business rules, filtering, availability, session caps, declined items, and candidate ranking.
- The LLM owns final judgment and natural customer copy only.
- You may only choose from the candidate shortlist supplied by the backend.

Decision order:
1. Understand cart roles: MAIN, DRINK_COLD, DRINK_HOT, DESSERT, STARTER, SIDE, SHISHA, CIGAR, ADDON.
2. Fill the most natural missing meal role for this venue and time of day.
3. Prefer high pairing score, then acceptance rate, then restaurant strategy.
4. Use the restaurant tone: friendly, premium, or minimal.
5. Suggest nothing if the meal is complete or every candidate feels forced.

Trigger behavior:
- add_to_cart: choose one strongest immediate complement to the item just added. This appears in a
  bottom sheet; adding it closes the sheet. Do not choose something already shown at another surface.
- cart: fill the highest-value missing meal role. This appears under "Also worth adding" with at most
  two backend-approved items, so prioritize usefulness and category diversity over near-duplicates.
- before_payment: choose one low-friction final addition only when it still improves the order.

UI contract:
- You choose an item and write short copy; the frontend owns layout, price, image, CTA, and closing behavior.
- Never write layout instructions, button labels, prices, item availability, or operational promises.
- Customer copy must be natural, specific to the cart, and no more than 15 words.

Never:
- Suggest an item already in the cart.
- Suggest a second MAIN when a MAIN is already in the cart.
- Suggest the same drink type already in the cart.
- Keep favoring shakes or any product family when another missing role is more useful.
- Suggest a declined, unavailable, disabled, or blocked item.
- Suggest a heavy main to a shisha-only cart at a shisha lounge.
- Hallucinate an item outside the candidate shortlist.
- Use the words upsell, AI, algorithm, or recommend in customer copy.

Return only valid JSON:
{
  "suggest_nothing": false,
  "suggested_item_id": 123,
  "suggested_item_name": "Exact menu item name",
  "target_role": "DRINK_COLD",
  "reason": null,
  "reasoning": "Internal reason for logging.",
  "suggestion_copy": "Customer-facing copy under 15 words.",
  "confidence": 0.9
}

If nothing should be shown:
{
  "suggest_nothing": true,
  "suggested_item_id": null,
  "suggested_item_name": null,
  "target_role": null,
  "reason": "Why no suggestion should be shown.",
  "reasoning": "Internal reason for logging.",
  "suggestion_copy": null,
  "confidence": 0.95
}
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


def classify_item_roles(item: Any) -> Set[str]:
    blob = _item_blob(item)
    roles: Set[str] = set()
    category = getattr(item, "category", None)
    category_type = _normalize_text(getattr(category, "category_type", ""))
    category_name = _normalize_text(getattr(category, "Category_name", ""))

    category_hint = CATEGORY_TYPE_ROLE_HINTS.get(category_type) or CATEGORY_TYPE_ROLE_HINTS.get(category_name)
    if category_hint:
        roles.add(category_hint)

    if _text_has_any(blob, ROLE_KEYWORDS[ROLE_DRINK_COLD]):
        roles.add(ROLE_DRINK_COLD)
    if _text_has_any(blob, ROLE_KEYWORDS[ROLE_DRINK_HOT]):
        cold_markers = ("iced", "cold", "shake", "smoothie", "mocktail", "cocktail", "soda", "cola", "juice")
        if not any(marker in blob for marker in cold_markers):
            roles.add(ROLE_DRINK_HOT)

    for role in (ROLE_MAIN, ROLE_DESSERT, ROLE_STARTER, ROLE_SIDE, ROLE_SHISHA, ROLE_CIGAR, ROLE_ADDON):
        if _text_has_any(blob, ROLE_KEYWORDS[role]):
            roles.add(role)

    # Generic drink categories should become cold drinks unless the item text is clearly hot.
    if category_hint == ROLE_DRINK_COLD and ROLE_DRINK_HOT in roles and ROLE_DRINK_COLD not in roles:
        roles.discard(ROLE_DRINK_COLD)
    if category_hint == ROLE_DRINK_COLD and ROLE_DRINK_HOT not in roles:
        roles.add(ROLE_DRINK_COLD)

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
    for item in list(menu_items)[:80]:
        text_parts.append(_item_blob(item))
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
        "co_order_frequency": int(row.get("historical_max_frequency") or 0),
        "reason": row.get("message") or "",
    }


def build_upsell_agent_context(
    *,
    restaurant: Any,
    setting: Any,
    cart_items: Sequence[Any],
    candidate_rows: Sequence[Mapping[str, Any]],
    trigger_point: str,
    hour: Optional[int] = None,
    session_signals: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
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

    context = {
        "restaurant": {
            "id": getattr(restaurant, "id", None),
            "name": getattr(restaurant, "resturent_name", ""),
            "venue_type": venue_type,
            "currency": getattr(restaurant, "currency", "AED"),
            "timezone": getattr(restaurant, "timezone", "UTC"),
        },
        "settings": {
            "strategy": getattr(setting, "strategy", "balanced"),
            "aggressiveness": getattr(setting, "aggressiveness", "moderate"),
            "tone": getattr(setting, "tone", "friendly"),
            "session_cap": policy["session_cap"],
        },
        "trigger_point": trigger_point,
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
        "candidates": [_candidate_payload(row) for row in list(candidate_rows)[:5]],
        "session_signals": dict(session_signals or {}),
        "system_prompt": UPSELL_SYSTEM_PROMPT,
    }
    context["user_message"] = build_upsell_agent_user_message(context)
    return context


def build_upsell_agent_user_message(context: Mapping[str, Any]) -> str:
    payload = {
        "restaurant": context.get("restaurant", {}),
        "settings": context.get("settings", {}),
        "trigger_point": context.get("trigger_point"),
        "cart": context.get("cart", []),
        "cart_roles": context.get("cart_roles", []),
        "target_roles": context.get("target_roles", []),
        "candidates": context.get("candidates", []),
        "session_signals": context.get("session_signals", {}),
    }
    return (
        "Use the fixed CleverDining upsell rules. Choose one valid candidate or suggest nothing.\n"
        f"{json.dumps(payload, ensure_ascii=True, separators=(',', ':'))}"
    )


def _safe_confidence(value: Any, default: float) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


def _ollama_response_text(payload: Mapping[str, Any]) -> str:
    message = payload.get("message")
    return str(message.get("content") or "").strip() if isinstance(message, Mapping) else ""


def _vertex_response_text(payload: Mapping[str, Any]) -> str:
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
        "options": {"temperature": 0, "num_predict": 350},
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
    max_tokens = max(80, min(int(getattr(settings, "VERTEX_UPSELL_MAX_OUTPUT_TOKENS", 220) or 220), 350))
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
        "temperature": 0,
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

    decision = _parse_llm_json(_vertex_response_text(response_payload))
    if not decision:
        return None, "invalid_json"
    decision["_llm_provider"] = "vertex_maas"
    decision["_llm_model"] = model
    return decision, "ok"


def call_upsell_llm(context: Mapping[str, Any]) -> Tuple[Optional[Dict[str, Any]], str]:
    """Call the configured model for shortlist judgment only."""
    if not context.get("candidates"):
        return None, "no_candidates"
    if not bool(getattr(settings, "UPSELL_LLM_ENABLED", True)):
        return None, "disabled"

    provider = str(getattr(settings, "UPSELL_LLM_PROVIDER", "vertex") or "vertex").strip().lower()
    if provider == "vertex":
        return _call_vertex_upsell_llm(context)
    if provider == "ollama":
        return _call_ollama_upsell_llm(context)
    logger.warning("Upsell LLM disabled for unsupported provider %s", provider)
    return None, "invalid_provider"


def fallback_upsell_agent_decision(
    candidate_rows: Sequence[Mapping[str, Any]],
    *,
    reason: str = "llm_unavailable",
) -> Dict[str, Any]:
    if not candidate_rows:
        return {
            "suggest_nothing": True,
            "reason": "No valid candidates after backend filtering.",
            "reasoning": "The deterministic engine found no eligible candidate.",
            "confidence": 0.95,
            "decision_source": "deterministic_fallback",
        }

    row = candidate_rows[0]
    item = row.get("item")
    target_role = row.get("target_role") or default_knowledge_role_for_engine_role(str(row.get("engine_role") or "premium"))
    item_name = getattr(item, "item_name", "")
    message = row.get("message") or f"Add {item_name}?"
    return {
        "suggest_nothing": False,
        "suggested_item_id": getattr(item, "id", None),
        "suggested_item_name": item_name,
        "target_role": target_role,
        "reasoning": row.get("agent_reasoning") or f"Backend fallback selected top-ranked candidate because {reason}.",
        "suggestion_copy": message,
        "confidence": 0.78,
        "decision_source": "deterministic_fallback",
    }


def validated_upsell_agent_decision(
    llm_decision: Optional[Mapping[str, Any]],
    candidate_rows: Sequence[Mapping[str, Any]],
    *,
    fallback_reason: str = "llm_not_called",
) -> Dict[str, Any]:
    if not llm_decision:
        return fallback_upsell_agent_decision(candidate_rows, reason=fallback_reason)

    if bool(llm_decision.get("suggest_nothing")):
        return {
            "suggest_nothing": True,
            "reason": str(llm_decision.get("reason") or "The agent decided no suggestion is appropriate."),
            "reasoning": str(llm_decision.get("reasoning") or llm_decision.get("reason") or ""),
            "confidence": _safe_confidence(llm_decision.get("confidence"), 0.9),
            "decision_source": "llm",
            "llm_provider": str(llm_decision.get("_llm_provider") or ""),
            "llm_model": str(llm_decision.get("_llm_model") or ""),
        }

    valid_by_id = {str(getattr(row.get("item"), "id", "")): row for row in candidate_rows}
    suggested_id = str(llm_decision.get("suggested_item_id") or "")
    selected = valid_by_id.get(suggested_id)
    if not selected:
        return fallback_upsell_agent_decision(candidate_rows, reason="invalid_llm_item")

    item = selected.get("item")
    return {
        "suggest_nothing": False,
        "suggested_item_id": getattr(item, "id", None),
        "suggested_item_name": getattr(item, "item_name", ""),
        "target_role": llm_decision.get("target_role") or selected.get("target_role"),
        "reasoning": str(llm_decision.get("reasoning") or selected.get("agent_reasoning") or ""),
        "suggestion_copy": str(llm_decision.get("suggestion_copy") or selected.get("message") or ""),
        "confidence": _safe_confidence(llm_decision.get("confidence"), 0.85),
        "decision_source": "llm",
        "llm_provider": str(llm_decision.get("_llm_provider") or ""),
        "llm_model": str(llm_decision.get("_llm_model") or ""),
    }
