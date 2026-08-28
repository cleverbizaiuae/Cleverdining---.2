from __future__ import annotations

from decimal import Decimal
from typing import List

from django.db.utils import OperationalError, ProgrammingError
from rest_framework import serializers
from django.db.models import Count, Q, Sum

from category.models import Category
from item.models import Item
from .models import UpsellEvent, UpsellItemSetting, UpsellRule, UpsellSetting


ORDER_ATTRIBUTED_REVENUE_Q = Q(
    action="accepted",
    metadata__reconciled_from_order=True,
)


def parse_category_ids(raw: str | List[int] | None) -> List[int]:
    if raw is None:
        return []
    if isinstance(raw, list):
        parsed: List[int] = []
        for value in raw:
            try:
                parsed.append(int(value))
            except (TypeError, ValueError):
                continue
        return parsed

    values = [entry.strip() for entry in str(raw).split(",")]
    parsed: List[int] = []
    for value in values:
        if not value:
            continue
        try:
            parsed.append(int(value))
        except ValueError:
            continue
    return parsed


class UpsellSettingSerializer(serializers.ModelSerializer):
    prioritized_categories_list = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = UpsellSetting
        fields = [
            "id",
            "enabled",
            "strategy",
            "aggressiveness",
            "show_after_add_to_cart",
            "show_in_cart",
            "show_before_payment",
            "tone",
            "prioritized_categories",
            "prioritized_categories_list",
            "category_role_map",
            "updated_at",
            "created_at",
        ]
        read_only_fields = ["id", "updated_at", "created_at"]

    def get_prioritized_categories_list(self, obj: UpsellSetting) -> List[int]:
        return parse_category_ids(obj.prioritized_categories)

    def validate_prioritized_categories(self, value: str) -> str:
        parsed = parse_category_ids(value)
        restaurant_id = getattr(self.instance, "restaurant_id", None)
        if restaurant_id and parsed:
            valid_ids = set(
                Category.objects.filter(restaurant_id=restaurant_id, id__in=parsed).values_list("id", flat=True)
            )
            invalid_ids = sorted(set(parsed) - valid_ids)
            if invalid_ids:
                raise serializers.ValidationError("Categories must belong to this restaurant.")
        return ",".join(str(category_id) for category_id in parsed)

    def validate_category_role_map(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Category role mapping must be an object.")

        allowed_roles = {"main", "drinks", "desserts", "starters"}
        unknown_roles = sorted(set(value) - allowed_roles)
        if unknown_roles:
            raise serializers.ValidationError("Unsupported category role.")

        normalized = {}
        assigned_ids = set()
        for role in ("main", "drinks", "desserts", "starters"):
            raw_ids = value.get(role, [])
            if not isinstance(raw_ids, list):
                raise serializers.ValidationError(f"{role} must be a list of category IDs.")
            category_ids = parse_category_ids(raw_ids)
            duplicate_ids = assigned_ids.intersection(category_ids)
            if duplicate_ids:
                raise serializers.ValidationError("A category can only have one explicit role.")
            assigned_ids.update(category_ids)
            normalized[role] = category_ids

        restaurant_id = getattr(self.instance, "restaurant_id", None)
        if restaurant_id and assigned_ids:
            valid_ids = set(
                Category.objects.filter(restaurant_id=restaurant_id, id__in=assigned_ids).values_list("id", flat=True)
            )
            if assigned_ids - valid_ids:
                raise serializers.ValidationError("Categories must belong to this restaurant.")
        return normalized


class UpsellRuleSerializer(serializers.ModelSerializer):
    source_item_name = serializers.CharField(source="source_item.item_name", read_only=True)
    target_item_name = serializers.CharField(source="target_item.item_name", read_only=True)

    class Meta:
        model = UpsellRule
        fields = [
            "id",
            "type",
            "source_item",
            "source_item_name",
            "target_item",
            "target_item_name",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "source_item_name", "target_item_name"]

    def validate(self, attrs):
        restaurant = self.context.get("restaurant")
        if not restaurant:
            raise serializers.ValidationError("Restaurant context missing.")

        source_item: Item = attrs.get("source_item") or getattr(self.instance, "source_item", None)
        target_item: Item = attrs.get("target_item") or getattr(self.instance, "target_item", None)
        rule_type = attrs.get("type") or getattr(self.instance, "type", None)
        if not target_item:
            raise serializers.ValidationError("target_item is required.")
        if rule_type in {"pair", "block"} and not source_item:
            raise serializers.ValidationError("source_item is required for pair/block rules.")
        if rule_type == "global_block" and source_item:
            raise serializers.ValidationError("global_block rule must not include source_item.")

        if source_item and source_item.restaurant_id != restaurant.id:
            raise serializers.ValidationError("source_item does not belong to this restaurant.")
        if target_item.restaurant_id != restaurant.id:
            raise serializers.ValidationError("target_item does not belong to this restaurant.")
        if source_item and source_item.id == target_item.id:
            raise serializers.ValidationError("source_item and target_item must be different.")
        return attrs


class UpsellEventCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UpsellEvent
        fields = [
            "session_id",
            "table_number",
            "trigger_point",
            "action",
            "upsell_item",
            "upsell_item_name",
            "upsell_category",
            "upsell_price",
            "cart_value_at_time",
            "cart_item_count",
            "hour_of_day",
            "day_of_week",
            "metadata",
        ]

    def validate_session_id(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("session_id is required.")
        return value[:120]

    def validate_upsell_price(self, value: Decimal) -> Decimal:
        return max(value, Decimal("0"))

    def validate_cart_value_at_time(self, value: Decimal) -> Decimal:
        return max(value, Decimal("0"))


class UpsellItemSettingSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.item_name", read_only=True)
    category_name = serializers.CharField(source="item.category.Category_name", read_only=True)
    shown_count = serializers.IntegerField(read_only=True)
    accepted_count = serializers.IntegerField(read_only=True)
    rejected_count = serializers.IntegerField(read_only=True)
    acceptance_rate = serializers.FloatField(read_only=True)

    class Meta:
        model = UpsellItemSetting
        fields = [
            "id",
            "item",
            "item_name",
            "category_name",
            "enabled",
            "inventory_priority",
            "shown_count",
            "accepted_count",
            "rejected_count",
            "acceptance_rate",
            "updated_at",
        ]
        read_only_fields = ["id", "item_name", "category_name", "shown_count", "accepted_count", "rejected_count", "acceptance_rate", "updated_at"]


def build_item_stats_map(restaurant_id: int):
    try:
        rows = (
            UpsellEvent.objects.filter(restaurant_id=restaurant_id, upsell_item_id__isnull=False)
            .values("upsell_item_id")
            .annotate(
                shown=Count("id", filter=Q(action="shown")),
                accepted=Count("id", filter=Q(action="accepted")),
                rejected=Count("id", filter=Q(action__in=["declined", "dismissed"])),
                revenue=Sum("upsell_price", filter=ORDER_ATTRIBUTED_REVENUE_Q),
            )
        )
    except (OperationalError, ProgrammingError):
        return {}
    stats = {}
    for row in rows:
        shown = int(row.get("shown") or 0)
        accepted = int(row.get("accepted") or 0)
        stats[int(row["upsell_item_id"])] = {
            "shown_count": shown,
            "accepted_count": accepted,
            "rejected_count": int(row.get("rejected") or 0),
            "acceptance_rate": (accepted / shown * 100.0) if shown else 0.0,
            "revenue": row.get("revenue"),
        }
    return stats
