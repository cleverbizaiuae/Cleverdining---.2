from __future__ import annotations

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
from restaurant.models import Restaurant
from .models import UpsellEvent, UpsellRule, UpsellSetting
from .upsell_serializers import (
    UpsellEventCreateSerializer,
    UpsellRuleSerializer,
    UpsellSettingSerializer,
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
