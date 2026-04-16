from __future__ import annotations

from decimal import Decimal
from typing import List

from rest_framework import serializers

from item.models import Item
from .models import UpsellEvent, UpsellRule, UpsellSetting


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
        return ",".join(str(category_id) for category_id in parsed)


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
        if not source_item or not target_item:
            raise serializers.ValidationError("source_item and target_item are required.")

        if source_item.restaurant_id != restaurant.id:
            raise serializers.ValidationError("source_item does not belong to this restaurant.")
        if target_item.restaurant_id != restaurant.id:
            raise serializers.ValidationError("target_item does not belong to this restaurant.")
        if source_item.id == target_item.id:
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

