from __future__ import annotations

from django.db import connection

from .models import BrandConfig

_BRAND_SCHEMA_READY = False


def ensure_brand_config_schema(force: bool = False) -> bool:
    """
    Runtime guard for legacy/partial deployments where `brand_configs`
    table (or some columns) may be missing.

    Returns True when schema exists (or was backfilled), False on failure.
    """
    global _BRAND_SCHEMA_READY
    if _BRAND_SCHEMA_READY and not force:
        return True

    try:
        with connection.cursor() as cursor:
            existing_tables = set(connection.introspection.table_names(cursor))

        table_name = BrandConfig._meta.db_table
        created_any = False

        if table_name not in existing_tables:
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(BrandConfig)
            existing_tables.add(table_name)
            created_any = True
            print(f"[SCHEMA-HEAL] Created missing table: {table_name}")

        with connection.cursor() as cursor:
            description = connection.introspection.get_table_description(cursor, table_name)
            existing_columns = {col.name for col in description}

        required_field_names = [
            "restaurant",
            "restaurant_name",
            "logo_url",
            "cover_image_url",
            "primary_color",
            "secondary_color",
            "accent_color",
            "theme_preset",
            "font_preset",
            "tagline",
            "branding_enabled",
            "instagram_url",
            "facebook_url",
            "tiktok_url",
            "twitter_url",
            "website_url",
            "wifi_name",
            "wifi_password",
            "updated_at",
        ]

        for field_name in required_field_names:
            field = BrandConfig._meta.get_field(field_name)
            if field.column in existing_columns:
                continue
            try:
                with connection.schema_editor() as schema_editor:
                    schema_editor.add_field(BrandConfig, field)
                existing_columns.add(field.column)
                created_any = True
                print(f"[SCHEMA-HEAL] Added missing column: {table_name}.{field.column}")
            except Exception as field_exc:
                print(f"[SCHEMA-HEAL] Failed adding column {table_name}.{field.column}: {field_exc}")

        if created_any:
            print("[SCHEMA-HEAL] Brand config schema backfilled at runtime.")

        _BRAND_SCHEMA_READY = True
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring brand config schema: {exc}")
        return False

