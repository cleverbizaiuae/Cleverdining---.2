import json
import logging
from datetime import datetime, timezone
from typing import Any

from core.request_context import get_request_context


class RequestContextFilter(logging.Filter):
    context_fields = (
        "request_id",
        "user_id",
        "restaurant_id",
        "region",
        "user_type",
        "path",
        "method",
    )

    def filter(self, record: logging.LogRecord) -> bool:
        context = get_request_context()
        for field in self.context_fields:
            value = context.get(field)
            if value is not None and not hasattr(record, field):
                setattr(record, field, value)
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "logger": record.name,
            "level": record.levelname,
            "message": record.getMessage(),
            "event_type": getattr(record, "event_type", "application"),
            "status": getattr(record, "status", "success"),
            "request_id": getattr(record, "request_id", None),
            "user_id": getattr(record, "user_id", None),
            "restaurant_id": getattr(record, "restaurant_id", None),
            "region": getattr(record, "region", None),
            "user_type": getattr(record, "user_type", None),
            "path": getattr(record, "path", None),
            "method": getattr(record, "method", None),
            "http_status": getattr(record, "http_status", None),
            "duration_ms": getattr(record, "duration_ms", None),
            "error_message": getattr(record, "error_message", None),
        }

        if record.exc_info:
            payload["error_message"] = payload["error_message"] or self.formatException(
                record.exc_info
            )

        clean_payload = {k: v for k, v in payload.items() if v is not None}
        return json.dumps(clean_payload, default=str)


def get_logging_config(log_level: str = "INFO") -> dict[str, Any]:
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "request_context": {
                "()": "core.logging_config.RequestContextFilter",
            },
        },
        "formatters": {
            "json": {
                "()": "core.logging_config.JsonFormatter",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "filters": ["request_context"],
            }
        },
        "root": {
            "handlers": ["console"],
            "level": log_level,
        },
        "loggers": {
            "django": {
                "handlers": ["console"],
                "level": log_level,
                "propagate": False,
            },
            "django.server": {
                "handlers": ["console"],
                "level": log_level,
                "propagate": False,
            },
            "channels": {
                "handlers": ["console"],
                "level": log_level,
                "propagate": False,
            },
            "payment": {
                "handlers": ["console"],
                "level": log_level,
                "propagate": False,
            },
        },
    }
