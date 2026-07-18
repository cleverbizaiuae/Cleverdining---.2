from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Any, Mapping, Tuple

from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections, transaction


UPSELL_CACHE_SCHEMA_VERSION = "v2"
logger = logging.getLogger(__name__)

_warm_jobs_lock = threading.Lock()
_warm_jobs = set()


def _generation_key(kind: str, restaurant_id: int) -> str:
    return f"upsell:{kind}-generation:{UPSELL_CACHE_SCHEMA_VERSION}:{int(restaurant_id)}"


def _get_generation(kind: str, restaurant_id: int) -> int:
    key = _generation_key(kind, restaurant_id)
    value = cache.get(key)
    if isinstance(value, int) and value > 0:
        return value
    cache.add(key, 1, timeout=None)
    value = cache.get(key)
    return int(value) if isinstance(value, int) and value > 0 else 1


def _increment_generation(kind: str, restaurant_id: int) -> int:
    key = _generation_key(kind, restaurant_id)
    if cache.add(key, 2, timeout=None):
        return 2
    try:
        return int(cache.incr(key))
    except (ValueError, TypeError):
        cache.set(key, 2, timeout=None)
        return 2


def get_restaurant_upsell_cache_versions(restaurant_id: int) -> Tuple[int, int]:
    return (
        _get_generation("menu", restaurant_id),
        _get_generation("config", restaurant_id),
    )


def invalidate_restaurant_upsell_menu(restaurant_id: int) -> int:
    return _increment_generation("menu", restaurant_id)


def invalidate_restaurant_upsell_config(restaurant_id: int) -> int:
    return _increment_generation("config", restaurant_id)


def stable_cache_digest(payload: Mapping[str, Any]) -> str:
    serialized = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def schedule_restaurant_upsell_warm(restaurant_id: int) -> None:
    """Debounce menu ingestion after committed admin/menu changes."""
    if not bool(getattr(settings, "UPSELL_WARM_ON_MENU_CHANGE", True)):
        return

    restaurant_id = int(restaurant_id)

    def schedule_after_commit() -> None:
        with _warm_jobs_lock:
            if restaurant_id in _warm_jobs:
                return
            _warm_jobs.add(restaurant_id)

        def warm() -> None:
            try:
                # Let rapid category/item saves settle, then ingest the latest version.
                time.sleep(0.2)
                close_old_connections()
                from .upsell import warm_restaurant_upsell_intelligence

                warm_restaurant_upsell_intelligence(restaurant_id)
            except Exception:
                logger.warning(
                    "Could not precompute upsell menu intelligence for restaurant %s",
                    restaurant_id,
                    exc_info=True,
                )
            finally:
                close_old_connections()
                with _warm_jobs_lock:
                    _warm_jobs.discard(restaurant_id)

        threading.Thread(
            target=warm,
            name=f"upsell-menu-warm-{restaurant_id}",
            daemon=True,
        ).start()

    transaction.on_commit(schedule_after_commit)
