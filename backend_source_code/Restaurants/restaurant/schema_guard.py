from __future__ import annotations

from django.db import connection

from .models import BrandConfig, Restaurant

_BRAND_SCHEMA_READY = False
_RESTAURANT_SCHEMA_READY = False


def ensure_restaurant_runtime_schema(force: bool = False) -> bool:
    """
    Runtime guard for deployments where restaurant runtime columns lag behind
    the model. This prevents optional platform features such as WhatsApp,
    regional defaults, and payment provider defaults from breaking unrelated
    endpoints that resolve a Restaurant row.
    """
    global _RESTAURANT_SCHEMA_READY
    if _RESTAURANT_SCHEMA_READY and not force:
        return True

    try:
        table_name = Restaurant._meta.db_table
        def read_existing_columns() -> set[str]:
            with connection.cursor() as cursor:
                description = connection.introspection.get_table_description(cursor, table_name)
            return {col.name for col in description}

        with connection.cursor() as cursor:
            existing_tables = set(connection.introspection.table_names(cursor))
            if table_name not in existing_tables:
                return False
            existing_columns = read_existing_columns()

        required_field_names = [
            "google_review_url",
            "plan",
            "status",
            "owner_password",
            "qr_codes",
            "table_count",
            "payment_processor",
            "subscription_start",
            "subscription_end",
            "city",
            "country",
            "region",
            "currency",
            "timezone",
            "country_code",
            "default_payment_provider",
            # SQLite rebuilds tables while adding fields; create the JSON field
            # first so its CHECK constraint is present before later columns are
            # added in the same runtime-heal pass.
            "whatsapp_special_phrases",
            "whatsapp_enabled",
            "whatsapp_provider",
            "whatsapp_waba_id",
            "whatsapp_phone_number_id",
            "whatsapp_business_display_number",
            "whatsapp_access_token",
            "whatsapp_360dialog_channel_id",
            "whatsapp_app_id",
            "whatsapp_app_secret",
            "whatsapp_webhook_verify_token",
            "whatsapp_webhook_callback_url",
            "whatsapp_api_version",
            "whatsapp_chatbot_enabled",
            "whatsapp_greeting_tone",
            "whatsapp_emoji_style",
            "whatsapp_signoff",
        ]

        created_any = False
        failed_missing_column = False
        for field_name in required_field_names:
            field = Restaurant._meta.get_field(field_name)
            if field.column in existing_columns:
                continue
            try:
                with connection.schema_editor() as schema_editor:
                    schema_editor.add_field(Restaurant, field)
                existing_columns = read_existing_columns()
                created_any = True
                print(f"[SCHEMA-HEAL] Added missing column: {table_name}.{field.column}")
            except Exception as field_exc:
                existing_columns = read_existing_columns()
                if field.column in existing_columns:
                    continue
                failed_missing_column = True
                print(f"[SCHEMA-HEAL] Failed adding column {table_name}.{field.column}: {field_exc}")

        if created_any:
            print("[SCHEMA-HEAL] Restaurant runtime schema backfilled at runtime.")

        _RESTAURANT_SCHEMA_READY = not failed_missing_column
        return not failed_missing_column
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring restaurant runtime schema: {exc}")
        return False


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
