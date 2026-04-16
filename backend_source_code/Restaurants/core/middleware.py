import logging
import time
import uuid

from core.request_context import (
    clear_request_context,
    set_request_context,
    update_request_context,
)

logger = logging.getLogger("core.request")


def _resolve_restaurant_context(request, user_role: str | None):
    restaurant_id = None
    region = None
    restaurant = None

    try:
        restaurant_id = (
            request.GET.get("restaurant_id")
            or request.headers.get("X-Restaurant-Id")
            or request.headers.get("X-Restaurant-ID")
            or request.headers.get("X-Restaurant")
        )
        if not restaurant_id and getattr(request, "resolver_match", None):
            kwargs = request.resolver_match.kwargs or {}
            restaurant_id = kwargs.get("restaurant_id") or kwargs.get("id")
    except Exception:
        restaurant_id = None

    user = getattr(request, "user", None)
    try:
        if user and getattr(user, "is_authenticated", False):
            if user_role == "owner":
                restaurant = user.restaurants.only("id", "region").first()
            elif user_role in ("staff", "manager"):
                from staff.models import Staff

                staff_obj = (
                    Staff.objects.select_related("restaurant")
                    .only("restaurant__id", "restaurant__region")
                    .filter(user=user)
                    .first()
                )
                restaurant = staff_obj.restaurant if staff_obj else None
            elif user_role == "chef":
                from accounts.models import ChefStaff

                chef_obj = (
                    ChefStaff.objects.select_related("restaurant")
                    .only("restaurant__id", "restaurant__region")
                    .filter(user=user)
                    .first()
                )
                restaurant = chef_obj.restaurant if chef_obj else None

            if restaurant:
                restaurant_id = restaurant.id
                region = restaurant.region
    except Exception:
        restaurant = None

    if restaurant_id and not region:
        try:
            from restaurant.models import Restaurant

            restaurant = Restaurant.objects.only("id", "region").filter(id=restaurant_id).first()
            if restaurant:
                region = restaurant.region
        except Exception:
            pass

    return restaurant_id, region


class RequestContextLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = (
            request.headers.get("X-Request-Id")
            or request.headers.get("X-Request-ID")
            or str(uuid.uuid4())
        )
        start = time.perf_counter()
        response = None

        set_request_context(
            {
                "request_id": request_id,
                "path": request.path,
                "method": request.method,
            }
        )

        try:
            response = self.get_response(request)
            return response
        except Exception as exc:
            user = getattr(request, "user", None)
            user_role = (
                getattr(user, "role", "anonymous")
                if user and getattr(user, "is_authenticated", False)
                else "anonymous"
            )
            user_id = getattr(user, "id", None) if user and getattr(user, "is_authenticated", False) else None
            restaurant_id, region = _resolve_restaurant_context(request, user_role)

            update_request_context(
                user_id=user_id,
                user_type=user_role,
                restaurant_id=restaurant_id,
                region=region,
            )
            logger.exception(
                "Unhandled request exception",
                extra={
                    "event_type": "api_request",
                    "status": "failure",
                    "error_message": str(exc),
                },
            )
            raise
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            user = getattr(request, "user", None)
            user_role = (
                getattr(user, "role", "anonymous")
                if user and getattr(user, "is_authenticated", False)
                else "anonymous"
            )
            user_id = getattr(user, "id", None) if user and getattr(user, "is_authenticated", False) else None
            restaurant_id, region = _resolve_restaurant_context(request, user_role)

            status_code = getattr(response, "status_code", 500)
            status = "success" if 200 <= status_code < 400 else "failure"

            update_request_context(
                user_id=user_id,
                user_type=user_role,
                restaurant_id=restaurant_id,
                region=region,
            )

            logger.log(
                logging.INFO if status == "success" else logging.ERROR,
                "HTTP request completed",
                extra={
                    "event_type": "api_request",
                    "status": status,
                    "http_status": status_code,
                    "duration_ms": duration_ms,
                },
            )

            if response is not None:
                response["X-Request-Id"] = request_id

            clear_request_context()
