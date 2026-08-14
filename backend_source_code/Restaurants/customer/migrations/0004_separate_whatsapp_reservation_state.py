from django.db import migrations


LEGACY_TABLE = "whatsapp_conversations"
RESERVATION_STATE_TABLE = "whatsapp_reservation_conversations"
STATE_COLUMNS = {
    "id",
    "restaurant_id",
    "phone",
    "provider",
    "state",
    "context",
    "external_chat_id",
    "last_message_id",
    "last_message",
    "last_response",
    "expires_at",
    "created_at",
    "updated_at",
}


def _table_description(schema_editor, table_name):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        return connection.introspection.get_table_description(cursor, table_name)


def _legacy_table_is_reservation_state(schema_editor):
    connection = schema_editor.connection
    description = _table_description(schema_editor, LEGACY_TABLE)
    columns = {column.name for column in description}
    if not STATE_COLUMNS.issubset(columns):
        return False

    id_column = next(column for column in description if column.name == "id")
    id_type = connection.introspection.get_field_type(id_column.type_code, id_column)
    return id_type in {"UUIDField", "CharField"}


def separate_reservation_state_table(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        tables = set(connection.introspection.table_names(cursor))

    if RESERVATION_STATE_TABLE in tables:
        return

    conversation_model = apps.get_model("customer", "WhatsAppConversation")
    if LEGACY_TABLE in tables and _legacy_table_is_reservation_state(schema_editor):
        schema_editor.alter_db_table(
            conversation_model,
            LEGACY_TABLE,
            RESERVATION_STATE_TABLE,
        )
        return

    original_table = conversation_model._meta.db_table
    conversation_model._meta.db_table = RESERVATION_STATE_TABLE
    try:
        schema_editor.create_model(conversation_model)
    finally:
        conversation_model._meta.db_table = original_table


def restore_previous_table_name(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        tables = set(connection.introspection.table_names(cursor))

    if RESERVATION_STATE_TABLE not in tables:
        return

    conversation_model = apps.get_model("customer", "WhatsAppConversation")
    if LEGACY_TABLE not in tables:
        schema_editor.alter_db_table(
            conversation_model,
            RESERVATION_STATE_TABLE,
            LEGACY_TABLE,
        )
        return

    original_table = conversation_model._meta.db_table
    conversation_model._meta.db_table = RESERVATION_STATE_TABLE
    try:
        schema_editor.delete_model(conversation_model)
    finally:
        conversation_model._meta.db_table = original_table


class Migration(migrations.Migration):
    dependencies = [
        ("customer", "0003_whatsappconversation"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    separate_reservation_state_table,
                    restore_previous_table_name,
                ),
            ],
            state_operations=[
                migrations.AlterModelTable(
                    name="whatsappconversation",
                    table=RESERVATION_STATE_TABLE,
                ),
            ],
        ),
    ]
