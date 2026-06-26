from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("order", "0012_itemassociation"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="amount_paid",
            field=models.DecimalField(decimal_places=2, default=0.00, max_digits=12),
        ),
    ]
