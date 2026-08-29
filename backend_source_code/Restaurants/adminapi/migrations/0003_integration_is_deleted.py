from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("adminapi", "0002_integration_api_health_integration_connection_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="integration",
            name="is_deleted",
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
