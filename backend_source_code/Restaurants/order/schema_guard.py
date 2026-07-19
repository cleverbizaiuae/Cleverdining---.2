from __future__ import annotations

from django.db import connection

from .models import (
    ItemAssociation,
    Order,
    UpsellEvent,
    UpsellItemSetting,
    UpsellLLMDecision,
    UpsellRule,
    UpsellSetting,
)


def ensure_order_notes_column() -> bool:
    """
    Runtime guard for legacy deployments where later `order_order`
    migrations were not applied.

    Returns True if required columns exist (or were created), otherwise False.
    """
    try:
        with connection.cursor() as cursor:
            tables = connection.introspection.table_names(cursor)
            if "order_order" not in tables:
                return False

            description = connection.introspection.get_table_description(cursor, "order_order")
            columns = {col.name for col in description}
            missing = [field_name for field_name in ["notes", "amount_paid"] if field_name not in columns]
            if not missing:
                return True

        for field_name in missing:
            field = Order._meta.get_field(field_name)
            with connection.schema_editor() as schema_editor:
                schema_editor.add_field(Order, field)
            print(f"[SCHEMA-HEAL] Added missing column: order_order.{field_name}")

        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring order_order legacy columns: {exc}")
        return False


def ensure_upsell_tables() -> bool:
    """
    Runtime guard for legacy/partial deployments where upsell tables
    are referenced by code but not present in the database schema.

    Returns True when all expected tables exist (or were created).
    """
    def existing_columns(table_name: str) -> set[str]:
        with connection.cursor() as cursor:
            description = connection.introspection.get_table_description(cursor, table_name)
        return {col.name for col in description}

    try:
        with connection.cursor() as cursor:
            existing_tables = set(connection.introspection.table_names(cursor))

        required_models = [
            UpsellSetting,
            UpsellRule,
            UpsellEvent,
            UpsellItemSetting,
            ItemAssociation,
            UpsellLLMDecision,
        ]

        created_any = False
        with connection.schema_editor() as schema_editor:
            for model in required_models:
                table_name = model._meta.db_table
                if table_name in existing_tables:
                    continue
                schema_editor.create_model(model)
                existing_tables.add(table_name)
                created_any = True
                print(f"[SCHEMA-HEAL] Created missing table: {table_name}")

        # Some deployments have the base upsell tables but missed later columns
        # (for example inventory_priority or item associations). Backfill those
        # columns without relying on the whole migration history having run.
        for model in required_models:
            table_name = model._meta.db_table
            if table_name not in existing_tables:
                continue
            try:
                existing = existing_columns(table_name)
            except Exception as column_exc:
                print(f"[SCHEMA-HEAL] Failed inspecting {table_name}: {column_exc}")
                continue

            for field in model._meta.local_fields:
                if getattr(field, "primary_key", False):
                    continue
                if field.column in existing:
                    continue
                try:
                    with connection.schema_editor() as schema_editor:
                        schema_editor.add_field(model, field)
                    existing.add(field.column)
                    created_any = True
                    print(f"[SCHEMA-HEAL] Added missing column: {table_name}.{field.column}")
                except Exception as field_exc:
                    print(f"[SCHEMA-HEAL] Failed adding column {table_name}.{field.column}: {field_exc}")

        if created_any:
            print("[SCHEMA-HEAL] Upsell schema backfilled at runtime.")
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring upsell tables: {exc}")
        return False
