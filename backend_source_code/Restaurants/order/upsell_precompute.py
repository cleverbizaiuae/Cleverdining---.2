from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from django.db import close_old_connections
from django.utils import timezone

from item.models import Item
from restaurant.models import Restaurant

from .models import UpsellSetting
from .upsell import build_item_context_upsell_suggestions
from .upsell_knowledge import (
    build_upsell_agent_context,
    call_upsell_llm,
    persist_upsell_llm_decision,
    validated_upsell_agent_decision,
)


logger = logging.getLogger(__name__)


EMPTY_SESSION_SIGNALS = {
    "category_declines": {},
    "category_views": {},
    "recently_removed_category_ids": [],
    "suggestions_shown": 0,
    "declined_roles": [],
    "declined_item_ids": [],
    "excluded_item_ids": [],
}


def build_precomputed_source_context(
    restaurant: Restaurant,
    source_item: Item,
    *,
    setting: Optional[UpsellSetting] = None,
) -> Dict[str, Any]:
    setting = setting or UpsellSetting.objects.get_or_create(restaurant=restaurant)[0]
    candidate_rows = build_item_context_upsell_suggestions(
        restaurant,
        [source_item.id],
        limit=5,
        trigger_point="add_to_cart",
        source_item_id=source_item.id,
        session_signals=EMPTY_SESSION_SIGNALS,
        apply_surface_limit=False,
    )
    eligible_rows = [
        row
        for row in candidate_rows
        if row.get("item") and row["item"].id != source_item.id
    ]
    context = build_upsell_agent_context(
        restaurant=restaurant,
        setting=setting,
        cart_items=[source_item],
        candidate_rows=eligible_rows,
        trigger_point="add_to_cart",
        hour=timezone.localtime(timezone.now()).hour,
        source_item_id=source_item.id,
        session_signals=EMPTY_SESSION_SIGNALS,
    )
    return {"context": context, "candidate_rows": eligible_rows}


def precompute_source_item_upsell(
    restaurant_id: int,
    source_item_id: int,
    *,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Store an LLM judgment before the customer reaches an upsell surface."""
    close_old_connections()
    try:
        restaurant = Restaurant.objects.filter(id=restaurant_id).first()
        if not restaurant:
            return {"status": "restaurant_not_found", "source_item_id": source_item_id}
        setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)
        if not setting.enabled:
            return {"status": "disabled", "source_item_id": source_item_id}
        source_item = (
            Item.objects.select_related("category", "sub_category")
            .filter(id=source_item_id, restaurant=restaurant, availability=True)
            .first()
        )
        if not source_item:
            return {"status": "item_not_found", "source_item_id": source_item_id}

        prepared = build_precomputed_source_context(
            restaurant,
            source_item,
            setting=setting,
        )
        context = prepared["context"]
        candidate_rows = prepared["candidate_rows"]
        if not candidate_rows:
            return {"status": "no_candidates", "source_item_id": source_item_id}

        cache_scope = f"restaurant:{restaurant.id}"
        decision, llm_status = call_upsell_llm(
            context,
            cache_scope=cache_scope,
            force_refresh=force_refresh,
        )
        validated = validated_upsell_agent_decision(
            decision,
            candidate_rows,
            llm_status=llm_status,
        )
        if validated.get("decision_source") not in {"llm", "llm_cache"}:
            return {
                "status": llm_status,
                "source_item_id": source_item_id,
                "candidate_count": len(candidate_rows),
            }
        persisted = persist_upsell_llm_decision(
            context,
            decision or {},
            cache_scope=cache_scope,
            source_item_id=source_item.id,
        )
        return {
            "status": "ok" if persisted else "not_persisted",
            "source_item_id": source_item_id,
            "selected_item_id": validated.get("suggested_item_id"),
            "suggest_nothing": bool(validated.get("suggest_nothing")),
            "candidate_count": len(candidate_rows),
        }
    except Exception:
        logger.warning(
            "Could not precompute LLM upsell for restaurant %s item %s",
            restaurant_id,
            source_item_id,
            exc_info=True,
        )
        return {"status": "error", "source_item_id": source_item_id}
    finally:
        close_old_connections()
