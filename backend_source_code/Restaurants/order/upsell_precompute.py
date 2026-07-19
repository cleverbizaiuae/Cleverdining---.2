from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Sequence

from django.db import close_old_connections
from django.utils import timezone

from item.models import Item
from restaurant.models import Restaurant

from .models import UpsellSetting
from .upsell import build_item_context_upsell_suggestions
from .upsell_knowledge import (
    build_upsell_agent_context,
    call_openrouter_upsell_llm_batch,
    call_upsell_llm,
    load_precomputed_upsell_llm_decision,
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


def precompute_source_item_upsell_batch(
    restaurant_id: int,
    source_item_ids: Sequence[int],
    *,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Persist LLM judgments for several source items with one provider request."""
    close_old_connections()
    try:
        restaurant = Restaurant.objects.filter(id=restaurant_id).first()
        if not restaurant:
            return {"results": [
                {"status": "restaurant_not_found", "source_item_id": item_id}
                for item_id in source_item_ids
            ]}
        setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)
        if not setting.enabled:
            return {"results": [
                {"status": "disabled", "source_item_id": item_id}
                for item_id in source_item_ids
            ]}

        source_items = {
            item.id: item
            for item in Item.objects.select_related("category", "sub_category").filter(
                id__in=source_item_ids,
                restaurant=restaurant,
                availability=True,
            )
        }
        cache_scope = f"restaurant:{restaurant.id}"
        prepared_by_source: Dict[int, Dict[str, Any]] = {}
        results_by_source: Dict[int, Dict[str, Any]] = {}
        for source_item_id in source_item_ids:
            source_item = source_items.get(int(source_item_id))
            if not source_item:
                results_by_source[int(source_item_id)] = {
                    "status": "item_not_found",
                    "source_item_id": int(source_item_id),
                }
                continue
            prepared = build_precomputed_source_context(
                restaurant,
                source_item,
                setting=setting,
            )
            context = prepared["context"]
            if not prepared["candidate_rows"]:
                results_by_source[source_item.id] = {
                    "status": "no_candidates",
                    "source_item_id": source_item.id,
                }
                continue
            if not force_refresh and load_precomputed_upsell_llm_decision(
                context,
                cache_scope=cache_scope,
            ):
                results_by_source[source_item.id] = {
                    "status": "cached",
                    "source_item_id": source_item.id,
                }
                continue
            prepared_by_source[source_item.id] = prepared

        if prepared_by_source:
            decisions, batch_status = call_openrouter_upsell_llm_batch(
                [prepared["context"] for prepared in prepared_by_source.values()]
            )
            for source_item_id, prepared in prepared_by_source.items():
                decision = decisions.get(source_item_id)
                if decision:
                    validated = validated_upsell_agent_decision(
                        decision,
                        prepared["candidate_rows"],
                        llm_status="ok",
                    )
                    if validated.get("decision_source") == "llm" and persist_upsell_llm_decision(
                        prepared["context"],
                        decision,
                        cache_scope=cache_scope,
                        source_item_id=source_item_id,
                    ):
                        results_by_source[source_item_id] = {
                            "status": "ok",
                            "source_item_id": source_item_id,
                            "selected_item_id": validated.get("suggested_item_id"),
                            "suggest_nothing": bool(validated.get("suggest_nothing")),
                            "candidate_count": len(prepared["candidate_rows"]),
                        }
                        continue
                results_by_source[source_item_id] = {
                    "status": batch_status,
                    "source_item_id": source_item_id,
                }

        # Missing or malformed batch entries still get an LLM decision; the backend
        # never substitutes its own ranked candidate as the final recommendation.
        for source_item_id in list(prepared_by_source):
            if results_by_source[source_item_id]["status"] == "ok":
                continue
            results_by_source[source_item_id] = precompute_source_item_upsell(
                restaurant_id,
                source_item_id,
                force_refresh=True,
            )

        return {
            "results": [
                results_by_source[int(source_item_id)]
                for source_item_id in source_item_ids
            ]
        }
    except Exception:
        logger.warning(
            "Could not batch-precompute LLM upsells for restaurant %s",
            restaurant_id,
            exc_info=True,
        )
        return {"results": [
            {"status": "error", "source_item_id": int(item_id)}
            for item_id in source_item_ids
        ]}
    finally:
        close_old_connections()
