from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("item", "0008_item_discount_percentage"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="tags",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
