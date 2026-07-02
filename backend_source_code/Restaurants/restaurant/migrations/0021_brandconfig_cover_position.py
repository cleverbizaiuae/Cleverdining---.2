from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("restaurant", "0020_360dialog_whatsapp_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="brandconfig",
            name="cover_position",
            field=models.CharField(default="50% 50%", max_length=20),
        ),
    ]
