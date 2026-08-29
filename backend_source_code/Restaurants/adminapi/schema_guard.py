from __future__ import annotations

from django.db import connection

from .models import Integration

_ADMINAPI_SCHEMA_READY = False


def _existing_columns(table_name: str) -> set[str]:
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    return {col.name for col in description}


def ensure_adminapi_schema(force: bool = False) -> bool:
    """
    Runtime guard for partially migrated environments.

    The Super Admin Integrations page is accessed before some deployments have
    run the latest adminapi migrations. This keeps GET/POST/PATCH from failing
    with missing `integrations` columns while migrations remain the canonical
    schema source.
    """
    global _ADMINAPI_SCHEMA_READY
    if _ADMINAPI_SCHEMA_READY and not force:
        return True

    try:
        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))

        table_name = Integration._meta.db_table
        created_any = False
        if table_name not in tables:
            try:
                with connection.schema_editor() as schema_editor:
                    schema_editor.create_model(Integration)
                tables.add(table_name)
                created_any = True
                print(f"[SCHEMA-HEAL] Created missing table: {table_name}")
            except Exception as create_exc:
                # Another request/process may have created it first.
                with connection.cursor() as cursor:
                    tables = set(connection.introspection.table_names(cursor))
                if table_name not in tables:
                    raise create_exc

        existing = _existing_columns(table_name)
        required_field_names = [
            "provider_key",
            "connection_status",
            "api_health",
            "environment",
            "documentation_url",
            "is_deleted",
        ]
        for field_name in required_field_names:
            field = Integration._meta.get_field(field_name)
            if field.column in existing:
                continue
            try:
                with connection.schema_editor() as schema_editor:
                    schema_editor.add_field(Integration, field)
                existing.add(field.column)
                created_any = True
                print(f"[SCHEMA-HEAL] Added missing column: {table_name}.{field.column}")
            except Exception as field_exc:
                print(f"[SCHEMA-HEAL] Failed adding column {table_name}.{field.column}: {field_exc}")

        if created_any:
            print("[SCHEMA-HEAL] Admin API integrations schema backfilled at runtime.")
        _ADMINAPI_SCHEMA_READY = True
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring adminapi schema: {exc}")
        return False
