from __future__ import annotations

from django.db import connection

from .models import ItemAssociation, Order, UpsellEvent, UpsellItemSetting, UpsellRule, UpsellSetting


def ensure_order_notes_column() -> bool:
    """
    Runtime guard for legacy deployments where `order_order.notes`
    migration was not applied.

    Returns True if the column exists (or was created), otherwise False.
    """
    try:
        with connection.cursor() as cursor:
            tables = connection.introspection.table_names(cursor)
            if "order_order" not in tables:
                return False

            description = connection.introspection.get_table_description(cursor, "order_order")
            columns = {col.name for col in description}
            if "notes" in columns:
                return True

        # Add only missing field; no-op for already up-to-date schemas.
        field = Order._meta.get_field("notes")
        with connection.schema_editor() as schema_editor:
            schema_editor.add_field(Order, field)

        print("[SCHEMA-HEAL] Added missing column: order_order.notes")
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring order_order.notes: {exc}")
        return False


def ensure_upsell_tables() -> bool:
    """
    Runtime guard for legacy/partial deployments where upsell tables
    are referenced by code but not present in the database schema.

    Returns True when all expected tables exist (or were created).
    """
    try:
        with connection.cursor() as cursor:
            existing_tables = set(connection.introspection.table_names(cursor))

        required_models = [
            UpsellSetting,
            UpsellRule,
            UpsellEvent,
            UpsellItemSetting,
            ItemAssociation,
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

        if created_any:
            print("[SCHEMA-HEAL] Upsell schema backfilled at runtime.")
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring upsell tables: {exc}")
        return False
