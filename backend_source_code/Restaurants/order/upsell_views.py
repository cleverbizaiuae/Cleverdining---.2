from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Optional

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ChefStaff
from device.models import GuestSession
from item.models import Item
from restaurant.models import Restaurant
from .models import ItemAssociation, OrderItem, UpsellEvent, UpsellItemSetting, UpsellRule, UpsellSetting
from .schema_guard import ensure_upsell_tables
from .upsell_serializers import (
    UpsellItemSettingSerializer,
    UpsellEventCreateSerializer,
    UpsellRuleSerializer,
    UpsellSettingSerializer,
    build_item_stats_map,
)


def _ensure_upsell_schema() -> None:
    # Non-blocking runtime heal for partially migrated environments.
    ensure_upsell_tables()


def get_restaurant_for_user(user) -> Optional[Restaurant]:
    role = getattr(user, "role", None)
    if role == "owner":
        restaurant = user.restaurants.first()
        if restaurant:
            return restaurant
        return Restaurant.objects.filter(owner=user).first()
    if role in {"manager", "chef", "staff"}:
        staff = ChefStaff.objects.filter(user=user, action="accepted").select_related("restaurant").first()
        if staff:
            return staff.restaurant
    return None


def get_restaurant_for_guest_request(request) -> Optional[Restaurant]:
    session_token = (
        request.headers.get("X-Guest-Session-Token")
        or request.query_params.get("guest_session_token")
        or request.query_params.get("guest_token")
        or request.data.get("guest_session_token")
    )
    if not session_token:
        return None
    session = GuestSession.objects.filter(session_token=session_token).order_by("-is_active", "-created_at").first()
    if not session:
        return None
    return session.device.restaurant


def _date_range_queryset(base_qs, request):
    date_from_raw = request.query_params.get("date_from")
    date_to_raw = request.query_params.get("date_to")
    if date_from_raw:
        try:
            date_from = timezone.datetime.fromisoformat(date_from_raw).date()
            base_qs = base_qs.filter(created_at__date__gte=date_from)
        except ValueError:
            pass
    if date_to_raw:
        try:
            date_to = timezone.datetime.fromisoformat(date_to_raw).date()
            base_qs = base_qs.filter(created_at__date__lte=date_to)
        except ValueError:
            pass
    return base_qs


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_int_list(raw_value) -> list[int]:
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        values = raw_value
    else:
        values = str(raw_value).split(",")
    parsed: list[int] = []
    for value in values:
        candidate = str(value).strip()
        if not candidate:
            continue
        safe_value = _safe_int(candidate)
        if safe_value is not None:
            parsed.append(safe_value)
    return parsed


def _stage_bonus_for_item(stage: str, item: Item) -> int:
    stage_key = str(stage or "").strip().lower()
    category_type = str(getattr(getattr(item, "category", None), "category_type", "") or "").strip().lower()
    category_name = str(getattr(getattr(item, "category", None), "Category_name", "") or "").lower()
    if not category_type:
        if any(token in category_name for token in ("drink", "coffee", "tea", "juice", "beverage")):
            category_type = "drink"
        elif any(token in category_name for token in ("dessert", "cake", "sweet", "ice cream")):
            category_type = "dessert"
        elif any(token in category_name for token in ("starter", "appetizer", "snack", "side")):
            category_type = "starter"
        else:
            category_type = "main"

    if stage_key == "building":
        return 10 if category_type == "main" else 0
    if stage_key == "balanced":
        if category_type == "drink":
            return 10
        if category_type in {"starter", "dessert"}:
            return 5
        return 0
    if stage_key == "complete":
        if category_type == "dessert":
            return 10
        if category_type == "drink":
            return 5
        return 0
    return 0


def _compute_pairing_intelligence(restaurant: Restaurant, min_frequency: int = 2):
    completed_statuses = ["delivered", "completed", "served"]
    order_item_rows = (
        OrderItem.objects.filter(order__restaurant=restaurant, order__status__in=completed_statuses)
        .values("order_id", "item_id")
        .order_by("order_id")
    )

    order_to_item_ids = defaultdict(set)
    for row in order_item_rows:
        order_to_item_ids[int(row["order_id"])].add(int(row["item_id"]))

    directed_pair_counts = defaultdict(int)
    item_counts = defaultdict(int)
    for item_ids in order_to_item_ids.values():
        sorted_ids = sorted(item_ids)
        for source_id in sorted_ids:
            item_counts[source_id] += 1
        for source_id in sorted_ids:
            for target_id in sorted_ids:
                if source_id == target_id:
                    continue
                directed_pair_counts[(source_id, target_id)] += 1

    now_ts = timezone.now()
    computed_pairs = set()
    existing_rows = {
        (row.source_item_id, row.target_item_id): row
        for row in ItemAssociation.objects.filter(restaurant=restaurant)
    }
    rows_to_update = []
    rows_to_create = []

    for (source_id, target_id), frequency in directed_pair_counts.items():
        if frequency < min_frequency:
            continue
        source_count = max(item_counts.get(source_id, 1), 1)
        association_strength = Decimal(frequency) / Decimal(source_count)
        computed_pairs.add((source_id, target_id))

        existing = existing_rows.get((source_id, target_id))
        if existing:
            existing.co_order_frequency = int(frequency)
            existing.association_strength = association_strength
            existing.last_computed_at = now_ts
            rows_to_update.append(existing)
        else:
            rows_to_create.append(
                ItemAssociation(
                    restaurant=restaurant,
                    source_item_id=source_id,
                    target_item_id=target_id,
                    co_order_frequency=int(frequency),
                    association_strength=association_strength,
                    last_computed_at=now_ts,
                )
            )

    stale_rows = []
    for key, row in existing_rows.items():
        if key in computed_pairs:
            continue
        if row.co_order_frequency == 0 and Decimal(row.association_strength or 0) == 0:
            continue
        row.co_order_frequency = 0
        row.association_strength = Decimal("0")
        row.last_computed_at = now_ts
        stale_rows.append(row)

    if rows_to_create:
        ItemAssociation.objects.bulk_create(rows_to_create)
    if rows_to_update:
        ItemAssociation.objects.bulk_update(
            rows_to_update,
            ["co_order_frequency", "association_strength", "last_computed_at"],
        )
    if stale_rows:
        ItemAssociation.objects.bulk_update(
            stale_rows,
            ["co_order_frequency", "association_strength", "last_computed_at"],
        )

    assoc_rows = (
        ItemAssociation.objects.filter(restaurant=restaurant, co_order_frequency__gte=min_frequency)
        .select_related("source_item", "target_item")
        .order_by("-co_order_frequency", "-association_strength", "-times_accepted")[:50]
    )

    results = []
    for row in assoc_rows:
        shown_count = int(row.times_shown or 0)
        accepted_count = int(row.times_accepted or 0)
        results.append(
            {
                "source_item_id": row.source_item_id,
                "source_item_name": row.source_item.item_name,
                "target_item_id": row.target_item_id,
                "target_item_name": row.target_item.item_name,
                "frequency": int(row.co_order_frequency or 0),
                "association_strength": round(float(row.association_strength or 0), 6),
                "shown_count": shown_count,
                "accepted_count": accepted_count,
                "dismissed_count": int(row.times_dismissed or 0),
                "accept_rate": round((accepted_count / shown_count * 100.0) if shown_count else 0.0, 2),
            }
        )
    return results


class UpsellSettingsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = None
        if request.user and request.user.is_authenticated:
            restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            restaurant = get_restaurant_for_guest_request(request)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)
        return Response(UpsellSettingSerializer(setting).data)

    def put(self, request):
        _ensure_upsell_schema()
        if not (request.user and request.user.is_authenticated):
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)
        serializer = UpsellSettingSerializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        return self.put(request)


class UpsellRulesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        rules = UpsellRule.objects.filter(restaurant=restaurant).select_related("source_item", "target_item").order_by("-id")
        serializer = UpsellRuleSerializer(rules, many=True)
        return Response(serializer.data)

    def post(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpsellRuleSerializer(data=request.data, context={"restaurant": restaurant})
        serializer.is_valid(raise_exception=True)
        serializer.save(restaurant=restaurant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UpsellRuleDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk: int):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        deleted_count, _ = UpsellRule.objects.filter(restaurant=restaurant, pk=pk).delete()
        if not deleted_count:
            return Response({"detail": "Rule not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UpsellEventCreateAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        _ensure_upsell_schema()
        session_token = request.headers.get("X-Guest-Session-Token") or request.data.get("guest_session_token")
        session = None
        restaurant = None
        device = None

        if request.user and request.user.is_authenticated:
            restaurant = get_restaurant_for_user(request.user)
            if restaurant and request.data.get("table_number"):
                device = restaurant.devices.filter(table_name=request.data.get("table_number")).first()

        if session_token:
            session = GuestSession.objects.filter(session_token=session_token).order_by("-is_active", "-created_at").first()
            if session:
                restaurant = session.device.restaurant
                device = session.device

        if not restaurant:
            return Response({"detail": "Unable to resolve restaurant for upsell event."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = UpsellEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        upsell_item = payload.get("upsell_item")
        if upsell_item and upsell_item.restaurant_id != restaurant.id:
            return Response({"detail": "upsell_item does not belong to this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

        event_time = timezone.localtime()
        table_number = payload.get("table_number") or getattr(device, "table_name", "") or getattr(device, "table_number", "")
        upsell_item_name = payload.get("upsell_item_name") or (upsell_item.item_name if upsell_item else "")
        upsell_category = payload.get("upsell_category") or (
            getattr(getattr(upsell_item, "category", None), "Category_name", "") if upsell_item else ""
        )

        # Prevent obvious double-counting of rapid duplicate actions from client retries.
        if payload["action"] in {"accepted", "declined", "dismissed"}:
            duplicate_window_start = event_time - timezone.timedelta(seconds=5)
            duplicate_exists = UpsellEvent.objects.filter(
                restaurant=restaurant,
                session_id=payload["session_id"],
                trigger_point=payload["trigger_point"],
                action=payload["action"],
                upsell_item=upsell_item,
                created_at__gte=duplicate_window_start,
            ).exists()
            if duplicate_exists:
                return Response({"status": "duplicate_ignored"}, status=status.HTTP_200_OK)

        UpsellEvent.objects.create(
            restaurant=restaurant,
            guest_session=session,
            device=device,
            session_id=payload["session_id"],
            table_number=table_number,
            trigger_point=payload["trigger_point"],
            action=payload["action"],
            upsell_item=upsell_item,
            upsell_item_name=upsell_item_name,
            upsell_category=upsell_category,
            upsell_price=payload.get("upsell_price", Decimal("0")),
            cart_value_at_time=payload.get("cart_value_at_time", Decimal("0")),
            cart_item_count=payload.get("cart_item_count", 0),
            hour_of_day=payload.get("hour_of_day", event_time.hour),
            day_of_week=payload.get("day_of_week", event_time.weekday()),
            metadata=payload.get("metadata", {}),
            created_at=event_time,
        )
        return Response({"status": "ok"}, status=status.HTTP_201_CREATED)


class UpsellAssociationStatsAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        _ensure_upsell_schema()
        session_token = request.headers.get("X-Guest-Session-Token") or request.data.get("guest_session_token")
        restaurant = None

        if request.user and request.user.is_authenticated:
            restaurant = get_restaurant_for_user(request.user)

        if session_token:
            session = GuestSession.objects.filter(session_token=session_token).order_by("-is_active", "-created_at").first()
            if session:
                restaurant = session.device.restaurant

        # Keep endpoint non-blocking for client flows; return 200 if restaurant cannot be resolved.
        if not restaurant:
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        action = str(request.data.get("action") or "").strip().lower()
        trigger_point = str(request.data.get("trigger_point") or "").strip().lower()
        source_item_raw = request.data.get("source_item_id")
        target_item_raw = request.data.get("upsell_item_id")

        if action not in {"shown", "accepted", "dismissed"}:
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)
        if trigger_point not in {"add_to_cart", "cart", "before_payment"}:
            trigger_point = "add_to_cart"
        if not str(source_item_raw).isdigit() or not str(target_item_raw).isdigit():
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        source_item_id = int(source_item_raw)
        target_item_id = int(target_item_raw)
        if source_item_id == target_item_id:
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        source_item = Item.objects.filter(id=source_item_id, restaurant=restaurant).first()
        target_item = Item.objects.filter(id=target_item_id, restaurant=restaurant).first()
        if not source_item or not target_item:
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        association, _ = ItemAssociation.objects.get_or_create(
            restaurant=restaurant,
            source_item=source_item,
            target_item=target_item,
        )
        if action == "shown":
            association.times_shown = int(association.times_shown or 0) + 1
        elif action == "accepted":
            association.times_accepted = int(association.times_accepted or 0) + 1
            price_raw = request.data.get("upsell_price") or request.data.get("price")
            try:
                association.revenue_generated = Decimal(association.revenue_generated or 0) + Decimal(str(price_raw or "0"))
            except Exception:
                pass
        else:
            association.times_dismissed = int(association.times_dismissed or 0) + 1
        association.save(update_fields=["times_shown", "times_accepted", "times_dismissed", "revenue_generated", "updated_at"])
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class UpsellSmartSuggestionsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = None
        if request.user and request.user.is_authenticated:
            restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            restaurant = get_restaurant_for_guest_request(request)
        if not restaurant:
            restaurant_id = _safe_int(request.query_params.get("restaurantId") or request.query_params.get("restaurant_id"))
            if restaurant_id and request.user and request.user.is_authenticated:
                restaurant = Restaurant.objects.filter(id=restaurant_id).first()
        if not restaurant:
            return Response({"detail": "Restaurant not resolved."}, status=status.HTTP_404_NOT_FOUND)

        cart_item_ids = set(
            _parse_int_list(request.query_params.get("cartItemIds") or request.query_params.get("cart_item_ids"))
        )
        if not cart_item_ids:
            return Response({"results": [], "count": 0})

        exclude_item_ids = set(
            _parse_int_list(request.query_params.get("excludeItemIds") or request.query_params.get("exclude_item_ids"))
        )
        stage = str(request.query_params.get("stage") or "").strip().lower()
        try:
            limit = max(1, min(int(request.query_params.get("limit") or 5), 20))
        except (TypeError, ValueError):
            limit = 5

        rows = (
            ItemAssociation.objects.filter(
                restaurant=restaurant,
                source_item_id__in=cart_item_ids,
                co_order_frequency__gte=2,
            )
            .exclude(target_item_id__in=cart_item_ids.union(exclude_item_ids))
            .values(
                "target_item_id",
                "co_order_frequency",
                "association_strength",
                "times_shown",
                "times_accepted",
            )
        )

        if not rows:
            return Response({"results": [], "count": 0})

        aggregate = {}
        for row in rows:
            target_item_id = int(row["target_item_id"])
            bucket = aggregate.setdefault(
                target_item_id,
                {
                    "sum_strength": 0.0,
                    "max_strength": 0.0,
                    "total_frequency": 0,
                    "max_frequency": 0,
                    "times_shown": 0,
                    "times_accepted": 0,
                },
            )
            strength = float(row.get("association_strength") or 0)
            frequency = int(row.get("co_order_frequency") or 0)
            shown = int(row.get("times_shown") or 0)
            accepted = int(row.get("times_accepted") or 0)

            bucket["sum_strength"] += strength
            bucket["total_frequency"] += frequency
            bucket["times_shown"] += shown
            bucket["times_accepted"] += accepted
            bucket["max_strength"] = max(bucket["max_strength"], strength)
            bucket["max_frequency"] = max(bucket["max_frequency"], frequency)

        items = {
            item.id: item
            for item in Item.objects.filter(
                restaurant=restaurant,
                availability=True,
                id__in=list(aggregate.keys()),
            ).select_related("category")
        }

        results = []
        for item_id, metrics in aggregate.items():
            item = items.get(item_id)
            if not item:
                continue
            shown = metrics["times_shown"]
            accepted = metrics["times_accepted"]
            accept_rate = (accepted / shown) if shown > 0 else 0.0
            stage_bonus = _stage_bonus_for_item(stage, item)
            historical_score = (
                (metrics["sum_strength"] * 100.0)
                + min(metrics["total_frequency"], 50)
                + (accept_rate * 25.0)
                + stage_bonus
            )
            image_url = ""
            try:
                if getattr(item, "image1", None):
                    image_url = request.build_absolute_uri(item.image1.url)
            except Exception:
                image_url = ""

            results.append(
                {
                    "id": item.id,
                    "item_name": item.item_name,
                    "price": str(item.price or Decimal("0")),
                    "description": item.description or "",
                    "category": item.category_id,
                    "category_name": getattr(item.category, "Category_name", ""),
                    "image1": image_url,
                    "availability": bool(item.availability),
                    "historical_score": round(historical_score, 3),
                    "association_strength": round(metrics["max_strength"], 6),
                    "co_order_frequency": int(metrics["max_frequency"]),
                    "historical_accept_rate": round(accept_rate * 100.0, 2),
                }
            )

        results.sort(
            key=lambda row: (
                row["historical_score"],
                row["association_strength"],
                row["co_order_frequency"],
            ),
            reverse=True,
        )
        return Response({"results": results[:limit], "count": len(results)})


class UpsellAnalyticsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        events = UpsellEvent.objects.filter(restaurant=restaurant)

        shown_qs = events.filter(action="shown")
        total_shown = shown_qs.count()
        accepted_qs = events.filter(action="accepted")
        total_accepted = accepted_qs.count()
        total_rejected = events.filter(action__in=["declined", "dismissed"]).count()
        acceptance_rate = (float(total_accepted) / float(total_shown) * 100.0) if total_shown else 0.0
        upsell_revenue = accepted_qs.aggregate(total=Sum("upsell_price"))["total"] or Decimal("0")
        avg_upsell_value = (upsell_revenue / total_accepted) if total_accepted else Decimal("0")

        by_trigger_rows = (
            events.values("trigger_point")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
                rejected=Count("id", filter=Q(action__in=["declined", "dismissed"])),
                revenue=Sum("upsell_price", filter=Q(action="accepted")),
            )
            .order_by("trigger_point")
        )
        by_trigger_map = {row["trigger_point"]: row for row in by_trigger_rows}
        by_trigger = []
        for trigger in ["add_to_cart", "cart", "before_payment"]:
            row = by_trigger_map.get(trigger, {"shown": 0, "accepted": 0, "rejected": 0, "revenue": Decimal("0")})
            shown = int(row.get("shown") or 0)
            accepted = int(row.get("accepted") or 0)
            by_trigger.append(
                {
                    "trigger_point": trigger,
                    "shown": shown,
                    "accepted": accepted,
                    "rejected": int(row.get("rejected") or 0),
                    "acceptance_rate": (accepted / shown * 100.0) if shown else 0.0,
                    "revenue": str(row.get("revenue") or Decimal("0")),
                }
            )

        by_category_rows = (
            events.values("upsell_category")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
                rejected=Count("id", filter=Q(action__in=["declined", "dismissed"])),
                revenue=Sum("upsell_price", filter=Q(action="accepted")),
            )
            .order_by("-accepted", "-shown")
        )
        by_category = sorted(
            [
                {
                    "category": row["upsell_category"] or "Uncategorized",
                    "shown": row["shown"],
                    "accepted": row["accepted"],
                    "rejected": row["rejected"],
                    "acceptance_rate": (row["accepted"] / row["shown"] * 100.0) if row["shown"] else 0.0,
                    "revenue": str(row["revenue"] or Decimal("0")),
                }
                for row in by_category_rows
            ],
            key=lambda row: Decimal(row["revenue"]),
            reverse=True,
        )

        top_items_rows = (
            events.values("upsell_item_id", "upsell_item_name")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
                rejected=Count("id", filter=Q(action__in=["declined", "dismissed"])),
                revenue=Sum("upsell_price", filter=Q(action="accepted")),
            )
            .order_by("-accepted", "-revenue")[:25]
        )
        top_items = [
            {
                "item_id": row["upsell_item_id"],
                "item_name": row["upsell_item_name"],
                "shown": row["shown"],
                "accepted": row["accepted"],
                "rejected": row["rejected"],
                "acceptance_rate": (row["accepted"] / row["shown"] * 100.0) if row["shown"] else 0.0,
                "revenue": str(row["revenue"] or Decimal("0")),
            }
            for row in top_items_rows
        ]

        by_hour_rows = (
            events.values("hour_of_day")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
            )
            .order_by("hour_of_day")
        )
        hour_map = {int(row["hour_of_day"]): row for row in by_hour_rows}
        by_hour = []
        for hour in range(24):
            row = hour_map.get(hour, {"shown": 0, "accepted": 0})
            shown = int(row.get("shown") or 0)
            accepted = int(row.get("accepted") or 0)
            by_hour.append(
                {
                    "hour": hour,
                    "shown": shown,
                    "accepted": accepted,
                    "acceptance_rate": (accepted / shown * 100.0) if shown else 0.0,
                }
            )

        revenue_trend_rows = (
            events.filter(action="accepted")
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(revenue=Sum("upsell_price"))
            .order_by("day")
        )
        revenue_trend = [
            {"date": row["day"].isoformat(), "revenue": str(row["revenue"] or Decimal("0"))}
            for row in revenue_trend_rows
        ]

        return Response(
            {
                "total_shown": total_shown,
                "total_accepted": total_accepted,
                "total_rejected": total_rejected,
                "acceptance_rate": round(acceptance_rate, 2),
                "upsell_revenue": str(upsell_revenue),
                "avg_upsell_value": str(avg_upsell_value),
                "by_trigger": by_trigger,
                "by_category": by_category,
                "top_items": top_items,
                "by_hour": by_hour,
                "revenue_trend": revenue_trend,
            }
        )


class UpsellEventsByTableAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        table_number = (request.query_params.get("table_number") or "").strip()
        events = UpsellEvent.objects.filter(restaurant=restaurant)
        events = _date_range_queryset(events, request)
        if table_number:
            events = events.filter(Q(table_number__iexact=table_number) | Q(device__table_name__iexact=table_number))

        rows = (
            events.order_by("-created_at")
            .values(
                "id",
                "session_id",
                "table_number",
                "trigger_point",
                "action",
                "upsell_item_id",
                "upsell_item_name",
                "upsell_category",
                "upsell_price",
                "cart_value_at_time",
                "cart_item_count",
                "hour_of_day",
                "day_of_week",
                "metadata",
                created_at_iso=F("created_at"),
            )[:500]
        )

        response_data = []
        for row in rows:
            response_data.append(
                {
                    "id": row["id"],
                    "session_id": row["session_id"],
                    "table_number": row["table_number"],
                    "trigger_point": row["trigger_point"],
                    "action": row["action"],
                    "upsell_item_id": row["upsell_item_id"],
                    "upsell_item_name": row["upsell_item_name"],
                    "upsell_category": row["upsell_category"],
                    "upsell_price": str(row["upsell_price"] or Decimal("0")),
                    "cart_value_at_time": str(row["cart_value_at_time"] or Decimal("0")),
                    "cart_item_count": row["cart_item_count"],
                    "hour_of_day": row["hour_of_day"],
                    "day_of_week": row["day_of_week"],
                    "metadata": row["metadata"] or {},
                    "created_at": row["created_at_iso"].isoformat() if row["created_at_iso"] else None,
                }
            )
        return Response({"events": response_data})


class UpsellItemsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        search = (request.query_params.get("search") or "").strip().lower()
        category_id = request.query_params.get("category_id")

        items_qs = Item.objects.filter(restaurant=restaurant).select_related("category").order_by("item_name")
        if search:
            items_qs = items_qs.filter(item_name__icontains=search)
        if category_id and str(category_id).isdigit():
            items_qs = items_qs.filter(category_id=int(category_id))

        settings_map = {
            cfg.item_id: cfg
            for cfg in UpsellItemSetting.objects.filter(restaurant=restaurant, item_id__in=items_qs.values_list("id", flat=True))
        }
        stats_map = build_item_stats_map(restaurant.id)

        response_rows = []
        for item in items_qs:
            cfg = settings_map.get(item.id)
            stats = stats_map.get(item.id, {})
            image_url = ""
            try:
                if getattr(item, "image1", None):
                    image_url = request.build_absolute_uri(item.image1.url)
            except Exception:
                image_url = ""
            response_rows.append(
                {
                    "id": item.id,
                    "item": item.id,
                    "item_name": item.item_name,
                    "price": str(item.price),
                    "image_url": image_url,
                    "availability": bool(getattr(item, "availability", True)),
                    "category_id": item.category_id,
                    "category_name": getattr(item.category, "Category_name", ""),
                    "enabled": cfg.enabled if cfg else True,
                    "inventory_priority": cfg.inventory_priority if cfg else False,
                    "shown_count": int(stats.get("shown_count", 0)),
                    "accepted_count": int(stats.get("accepted_count", 0)),
                    "rejected_count": int(stats.get("rejected_count", 0)),
                    "acceptance_rate": float(stats.get("acceptance_rate", 0.0)),
                }
            )

        return Response({"results": response_rows, "count": len(response_rows)})

    def patch(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        item_id = request.data.get("item_id") or request.data.get("item")
        if not item_id or not str(item_id).isdigit():
            return Response({"detail": "item_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = Item.objects.get(pk=int(item_id), restaurant=restaurant)
        except Item.DoesNotExist:
            return Response({"detail": "Item not found for this restaurant."}, status=status.HTTP_404_NOT_FOUND)

        cfg, _ = UpsellItemSetting.objects.get_or_create(restaurant=restaurant, item=item)
        if "enabled" in request.data:
            cfg.enabled = bool(request.data.get("enabled"))
        if "inventory_priority" in request.data:
            cfg.inventory_priority = bool(request.data.get("inventory_priority"))
        cfg.save()
        return Response(
            {
                "item": item.id,
                "enabled": cfg.enabled,
                "inventory_priority": cfg.inventory_priority,
            }
        )


class UpsellPairingIntelligenceAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_upsell_schema()
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        min_frequency_raw = request.query_params.get("min_frequency")
        try:
            min_frequency = max(2, int(min_frequency_raw or 2))
        except (TypeError, ValueError):
            min_frequency = 2
        results = _compute_pairing_intelligence(restaurant, min_frequency=min_frequency)
        return Response({"results": results[:50], "count": len(results), "computed_at": timezone.now().isoformat()})

    def post(self, request):
        _ensure_upsell_schema()
        # "Run Intelligence" trigger – computes fresh pairing insights from live data.
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)
        min_frequency_raw = request.data.get("min_frequency") or request.query_params.get("min_frequency")
        try:
            min_frequency = max(2, int(min_frequency_raw or 2))
        except (TypeError, ValueError):
            min_frequency = 2
        results = _compute_pairing_intelligence(restaurant, min_frequency=min_frequency)
        return Response(
            {
                "status": "ok",
                "results": results[:50],
                "count": len(results),
                "computed_at": timezone.now().isoformat(),
            }
        )
