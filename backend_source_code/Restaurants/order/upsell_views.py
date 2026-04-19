from __future__ import annotations

from collections import defaultdict
from itertools import combinations
from decimal import Decimal
from typing import Optional

from django.core.cache import cache
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
from .models import OrderItem, UpsellEvent, UpsellItemSetting, UpsellRule, UpsellSetting
from .upsell_serializers import (
    UpsellItemSettingSerializer,
    UpsellEventCreateSerializer,
    UpsellRuleSerializer,
    UpsellSettingSerializer,
    build_item_stats_map,
)


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


class UpsellSettingsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        setting, _ = UpsellSetting.objects.get_or_create(restaurant=restaurant)
        return Response(UpsellSettingSerializer(setting).data)

    def put(self, request):
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
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        rules = UpsellRule.objects.filter(restaurant=restaurant).select_related("source_item", "target_item").order_by("-id")
        serializer = UpsellRuleSerializer(rules, many=True)
        return Response(serializer.data)

    def post(self, request):
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

        key = f"upsell_assoc:{restaurant.id}:{trigger_point}:{source_item_id}:{target_item_id}"
        payload = cache.get(key) or {
            "restaurant_id": restaurant.id,
            "trigger_point": trigger_point,
            "source_item_id": source_item_id,
            "target_item_id": target_item_id,
            "shown_count": 0,
            "accepted_count": 0,
            "dismissed_count": 0,
            "updated_at": None,
        }
        counter_field = f"{action}_count"
        payload[counter_field] = int(payload.get(counter_field, 0)) + 1
        payload["updated_at"] = timezone.now().isoformat()
        cache.set(key, payload, timeout=60 * 60 * 24 * 30)  # 30 days rolling cache
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class UpsellAnalyticsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        events = UpsellEvent.objects.filter(restaurant=restaurant)
        events = _date_range_queryset(events, request)

        total_shown = events.filter(action="shown").count()
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
                revenue=Sum("upsell_price", filter=Q(action="accepted")),
            )
            .order_by("trigger_point")
        )
        by_trigger = [
            {
                "trigger_point": row["trigger_point"],
                "shown": row["shown"],
                "accepted": row["accepted"],
                "acceptance_rate": (row["accepted"] / row["shown"] * 100.0) if row["shown"] else 0.0,
                "revenue": str(row["revenue"] or Decimal("0")),
            }
            for row in by_trigger_rows
        ]

        by_category_rows = (
            events.values("upsell_category")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
                revenue=Sum("upsell_price", filter=Q(action="accepted")),
            )
            .order_by("-accepted", "-shown")
        )
        by_category = [
            {
                "category": row["upsell_category"] or "Uncategorized",
                "shown": row["shown"],
                "accepted": row["accepted"],
                "acceptance_rate": (row["accepted"] / row["shown"] * 100.0) if row["shown"] else 0.0,
                "revenue": str(row["revenue"] or Decimal("0")),
            }
            for row in by_category_rows
        ]

        top_items_rows = (
            events.values("upsell_item_id", "upsell_item_name")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
                revenue=Sum("upsell_price", filter=Q(action="accepted")),
            )
            .order_by("-accepted", "-revenue")[:10]
        )
        top_items = [
            {
                "item_id": row["upsell_item_id"],
                "item_name": row["upsell_item_name"],
                "shown": row["shown"],
                "accepted": row["accepted"],
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
        by_hour = [
            {
                "hour": row["hour_of_day"],
                "shown": row["shown"],
                "accepted": row["accepted"],
                "acceptance_rate": (row["accepted"] / row["shown"] * 100.0) if row["shown"] else 0.0,
            }
            for row in by_hour_rows
        ]

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
            response_rows.append(
                {
                    "item": item.id,
                    "item_name": item.item_name,
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
        restaurant = get_restaurant_for_user(request.user)
        if not restaurant:
            return Response({"detail": "Restaurant not found for user."}, status=status.HTTP_404_NOT_FOUND)

        min_frequency_raw = request.query_params.get("min_frequency")
        try:
            min_frequency = max(2, int(min_frequency_raw or 2))
        except (TypeError, ValueError):
            min_frequency = 2

        # Completed-order statuses for learning co-occurrence.
        completed_statuses = ["delivered", "completed", "served"]
        order_item_rows = (
            OrderItem.objects.filter(order__restaurant=restaurant, order__status__in=completed_statuses)
            .values("order_id", "item_id", "item__item_name")
            .order_by("order_id")
        )

        order_to_items = defaultdict(list)
        for row in order_item_rows:
            order_to_items[int(row["order_id"])].append((int(row["item_id"]), row["item__item_name"]))

        pair_counts = defaultdict(int)
        item_counts = defaultdict(int)

        for item_rows in order_to_items.values():
            unique_items = {}
            for item_id, item_name in item_rows:
                unique_items[item_id] = item_name
            unique_item_ids = sorted(unique_items.keys())
            for item_id in unique_item_ids:
                item_counts[item_id] += 1
            for left_id, right_id in combinations(unique_item_ids, 2):
                pair_counts[(left_id, right_id)] += 1

        item_name_map = {
            row["id"]: row["item_name"]
            for row in Item.objects.filter(restaurant=restaurant, id__in=list(item_counts.keys())).values("id", "item_name")
        }

        results = []
        for (left_id, right_id), frequency in pair_counts.items():
            if frequency < min_frequency:
                continue
            left_count = max(item_counts.get(left_id, 1), 1)
            right_count = max(item_counts.get(right_id, 1), 1)
            confidence = max(frequency / left_count, frequency / right_count)
            results.append(
                {
                    "source_item_id": left_id,
                    "source_item_name": item_name_map.get(left_id, f"Item {left_id}"),
                    "target_item_id": right_id,
                    "target_item_name": item_name_map.get(right_id, f"Item {right_id}"),
                    "frequency": frequency,
                    "confidence": round(confidence, 4),
                }
            )

        results.sort(key=lambda row: (row["frequency"], row["confidence"]), reverse=True)
        return Response({"results": results[:200], "count": len(results)})
