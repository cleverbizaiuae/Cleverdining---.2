from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("device", "0019_alter_reservation_buffer_minutes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="device",
            name="region",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
