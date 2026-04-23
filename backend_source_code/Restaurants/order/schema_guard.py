from __future__ import annotations

from django.db import connection

from .models import Order


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

