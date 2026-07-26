from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payment", "0010_migrate_legacy_stripe_gateways"),
    ]

    operations = [
        migrations.AlterField(
            model_name="payment",
            name="status",
            field=models.CharField(
                choices=[
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                    ("pending", "Pending"),
                    ("cancelled", "Cancelled"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
