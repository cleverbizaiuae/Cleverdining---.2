from __future__ import annotations

from django.db import connection

from .models import Customer, CustomerRestaurantLink, GameScore, LoyaltyTransaction, WhatsAppConversation

_CUSTOMER_INTELLIGENCE_SCHEMA_READY = False


def ensure_customer_intelligence_schema(force: bool = False) -> bool:
    """
    Backfill the Customer Intelligence tables on older deployments that have
    the new code before migrations are applied.
    """
    global _CUSTOMER_INTELLIGENCE_SCHEMA_READY
    if _CUSTOMER_INTELLIGENCE_SCHEMA_READY and not force:
        return True

    try:
        with connection.cursor() as cursor:
            existing_tables = set(connection.introspection.table_names(cursor))

        required_models = [
            Customer,
            CustomerRestaurantLink,
            LoyaltyTransaction,
            GameScore,
            WhatsAppConversation,
        ]

        changed = False
        with connection.schema_editor() as schema_editor:
            for model in required_models:
                table_name = model._meta.db_table
                if table_name in existing_tables:
                    continue
                schema_editor.create_model(model)
                existing_tables.add(table_name)
                changed = True
                print(f"[SCHEMA-HEAL] Created missing table: {table_name}")

        for model in required_models:
            table_name = model._meta.db_table
            if table_name not in existing_tables:
                continue

            with connection.cursor() as cursor:
                description = connection.introspection.get_table_description(cursor, table_name)
            columns = {column.name for column in description}

            for field in model._meta.local_fields:
                if getattr(field, "primary_key", False) or field.column in columns:
                    continue
                try:
                    with connection.schema_editor() as schema_editor:
                        schema_editor.add_field(model, field)
                    columns.add(field.column)
                    changed = True
                    print(f"[SCHEMA-HEAL] Added missing column: {table_name}.{field.column}")
                except Exception as exc:
                    print(f"[SCHEMA-HEAL] Failed adding column {table_name}.{field.column}: {exc}")

        if changed:
            print("[SCHEMA-HEAL] Customer intelligence schema backfilled at runtime.")

        _CUSTOMER_INTELLIGENCE_SCHEMA_READY = True
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring customer intelligence schema: {exc}")
        return False
