from typing import Any

from core.request_context import get_request_context


def before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    context = get_request_context()

    tags = event.setdefault("tags", {})
    for key in ("region", "user_type", "path", "method", "request_id"):
        value = context.get(key)
        if value:
            tags.setdefault(key, str(value))

    restaurant_id = context.get("restaurant_id")
    if restaurant_id is not None:
        tags.setdefault("restaurant_id", str(restaurant_id))

    user_id = context.get("user_id")
    if user_id is not None:
        user = event.setdefault("user", {})
        user.setdefault("id", str(user_id))

    return event
