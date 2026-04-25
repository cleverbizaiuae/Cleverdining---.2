from __future__ import annotations

from django.db import connection

from .models import OrderBill, OrderBillItem, Payment, PaymentAllocation

_PAYMENT_SCHEMA_READY = False


def _existing_columns(table_name: str) -> set[str]:
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    return {col.name for col in description}


def ensure_payment_schema(force: bool = False) -> bool:
    """
    Runtime guard for partially migrated environments.

    Ensures split-bill tables/columns exist so Payment queries do not fail with:
    `column payment_payment.bill_id does not exist`.
    """
    global _PAYMENT_SCHEMA_READY
    if _PAYMENT_SCHEMA_READY and not force:
        return True

    try:
        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))

        created_any = False
        for model in [OrderBill, OrderBillItem, PaymentAllocation]:
            table_name = model._meta.db_table
            if table_name in tables:
                continue
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(model)
            tables.add(table_name)
            created_any = True
            print(f"[SCHEMA-HEAL] Created missing table: {table_name}")

        payment_table = Payment._meta.db_table
        if payment_table not in tables:
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(Payment)
            tables.add(payment_table)
            created_any = True
            print(f"[SCHEMA-HEAL] Created missing table: {payment_table}")

        existing = _existing_columns(payment_table)
        required_field_names = [
            "wallet_token_reference",
            "split_type",
            "payer_id_or_name",
            "bill",
            "created_by",
            "confirmed_by_staff",
            "confirmed_at",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "raw_response",
        ]

        for field_name in required_field_names:
            field = Payment._meta.get_field(field_name)
            if field.column in existing:
                continue
            try:
                with connection.schema_editor() as schema_editor:
                    schema_editor.add_field(Payment, field)
                existing.add(field.column)
                created_any = True
                print(f"[SCHEMA-HEAL] Added missing column: {payment_table}.{field.column}")
            except Exception as field_exc:
                print(
                    f"[SCHEMA-HEAL] Failed adding column {payment_table}.{field.column}: {field_exc}"
                )

        if created_any:
            print("[SCHEMA-HEAL] Payment schema backfilled at runtime.")
        _PAYMENT_SCHEMA_READY = True
        return True
    except Exception as exc:
        print(f"[SCHEMA-HEAL] Failed ensuring payment schema: {exc}")
        return False
