from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("restaurant", "0021_brandconfig_cover_position"),
    ]

    operations = [
        migrations.AddField(
            model_name="brandconfig",
            name="pay_before_order",
            field=models.BooleanField(default=False),
        ),
    ]
