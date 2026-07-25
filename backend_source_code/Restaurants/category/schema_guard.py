from __future__ import annotations

from django.db import connection

from .models import Category


def ensure_category_schema() -> bool:
    """
    Runtime guard for legacy/partial deployments where category migrations
    were not fully applied (for example missing `category_type`).

    Returns True if required fields exist (or were added), otherwise False.
    """
    try:
        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))
            table_name = Category._meta.db_table
            if table_name not in tables:
                return False

            description = connection.introspection.get_table_description(cursor, table_name)
            existing_columns = {col.name for col in description}

        required_field_names = [
            "image",
            "parent_category",
            "level",
            "icon",
            "icon_image",
            "category_type",
            "display_order",
        ]
        missing_fields = []
        for field_name in required_field_names:
            field = Category._meta.get_field(field_name)
            if field.column not in existing_columns:
                missing_fields.append(field)

        if not missing_fields:
            return True

        with connection.schema_editor() as schema_editor:
            for field in missing_fields:
                schema_editor.add_field(Category, field)
                print(f"[SCHEMA-HEAL] Added missing column: {Category._meta.db_table}.{field.column}")

        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring category schema: {exc}")
        return False
