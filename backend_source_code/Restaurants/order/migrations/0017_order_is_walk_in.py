from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("order", "0016_upsellllmdecision"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="is_walk_in",
            field=models.BooleanField(default=False),
        ),
    ]
