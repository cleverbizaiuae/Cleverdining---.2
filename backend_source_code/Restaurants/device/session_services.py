from datetime import timedelta

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from .models import Device, GuestSession


# The guest PWA refreshes last_seen_at once a minute while it is visible. Five
# missed minutes gives mobile browsers enough tolerance for throttled timers,
# while releasing an abandoned table quickly enough for restaurant staff.
SESSION_INACTIVITY_TIMEOUT = timedelta(minutes=5)
ACTIVE_ORDER_STATUSES = (
    "awaiting_payment",
    "pending",
    "preparing",
    "ready",
    "served",
    "awaiting_cash",
)


def expire_inactive_guest_sessions(restaurant_ids=None, at=None):
    """Close idle browser sessions while preserving sessions with live orders."""
    from order.models import Order

    current = at or timezone.now()
    cutoff = current - SESSION_INACTIVITY_TIMEOUT
    queryset = GuestSession.objects.filter(is_active=True)
    if restaurant_ids:
        queryset = queryset.filter(device__restaurant_id__in=restaurant_ids)

    live_order = Order.objects.filter(
        guest_session_id=OuterRef("pk"),
        status__in=ACTIVE_ORDER_STATUSES,
    )
    stale_ids = list(
        queryset.annotate(has_live_order=Exists(live_order))
        .filter(has_live_order=False)
        .filter(Q(expires_at__lte=current) | Q(last_seen_at__lte=cutoff))
        .values_list("id", flat=True)
    )
    if not stale_ids:
        return 0
    return GuestSession.objects.filter(id__in=stale_ids, is_active=True).update(is_active=False)


def occupied_device_count(restaurant_id):
    """Count tables that currently have a guest session or an ongoing order."""
    from order.models import Order

    occupied_ids = set(
        GuestSession.objects.filter(
            device__restaurant_id=restaurant_id,
            is_active=True,
        ).values_list("device_id", flat=True)
    )
    occupied_ids.update(
        Order.objects.filter(
            restaurant_id=restaurant_id,
            status__in=ACTIVE_ORDER_STATUSES,
        ).values_list("device_id", flat=True)
    )
    return Device.objects.filter(restaurant_id=restaurant_id, id__in=occupied_ids).count()
