"""Permanent CORS fallback for deployed SPA frontends.

`django-cors-headers` is still the primary CORS implementation. This middleware
runs before everything else so OPTIONS preflight requests and error responses keep
CORS headers even when a later middleware/view exits early.
"""

from __future__ import annotations

import re

from django.conf import settings
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers


def _configured_headers() -> str:
    requested_headers = getattr(settings, "CORS_ALLOW_HEADERS", []) or []
    return ", ".join(requested_headers)


def _configured_methods() -> str:
    requested_methods = getattr(settings, "CORS_ALLOW_METHODS", []) or []
    return ", ".join(requested_methods)


def _origin_is_allowed(origin: str | None) -> bool:
    if not origin:
        return False

    if getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False):
        return True

    allowed_origins = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []) or [])
    if origin in allowed_origins:
        return True

    for pattern in getattr(settings, "CORS_ALLOWED_ORIGIN_REGEXES", []) or []:
        if re.match(pattern, origin):
            return True

    return False


def _apply_cors_headers(request, response):
    origin = request.headers.get("Origin")
    if not _origin_is_allowed(origin):
        return response

    response["Access-Control-Allow-Origin"] = origin
    response["Access-Control-Allow-Credentials"] = "true"
    response["Access-Control-Allow-Methods"] = _configured_methods()
    response["Access-Control-Allow-Headers"] = (
        request.headers.get("Access-Control-Request-Headers") or _configured_headers()
    )
    response["Access-Control-Max-Age"] = str(getattr(settings, "CORS_PREFLIGHT_MAX_AGE", 86400))
    patch_vary_headers(response, ("Origin",))
    return response


class PermanentCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS" and _origin_is_allowed(request.headers.get("Origin")):
            return _apply_cors_headers(request, HttpResponse(status=204))

        response = self.get_response(request)
        return _apply_cors_headers(request, response)
