from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("order", "0014_update_upsell_strategy_choices"),
    ]

    operations = [
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("awaiting_payment", "Awaiting Payment"),
                    ("preparing", "Preparing"),
                    ("served", "Served"),
                    ("delivered", "Delivered"),
                    ("paid", "Paid"),
                    ("awaiting_cash", "Awaiting Cash"),
                    ("cancelled", "Cancelled"),
                    ("completed", "Completed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
