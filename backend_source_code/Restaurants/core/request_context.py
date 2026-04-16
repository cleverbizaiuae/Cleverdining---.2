import contextvars
from typing import Any


_request_context: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "request_context",
    default={},
)


def get_request_context() -> dict[str, Any]:
    return dict(_request_context.get())


def set_request_context(context: dict[str, Any]) -> None:
    _request_context.set(dict(context))


def update_request_context(**kwargs: Any) -> None:
    current = get_request_context()
    for key, value in kwargs.items():
        if value is not None:
            current[key] = value
    _request_context.set(current)


def clear_request_context() -> None:
    _request_context.set({})
