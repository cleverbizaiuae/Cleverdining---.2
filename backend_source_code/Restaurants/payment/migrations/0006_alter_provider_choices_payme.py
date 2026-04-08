from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payment", "0005_wallet_payment_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="payment",
            name="provider",
            field=models.CharField(
                choices=[
                    ("stripe", "Stripe"),
                    ("checkout", "Checkout.com"),
                    ("paytabs", "PayTabs"),
                    ("payme", "Payme"),
                    ("cash", "Cash"),
                    ("apple_pay", "Apple Pay"),
                    ("google_pay", "Google Pay"),
                ],
                default="stripe",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="paymentgateway",
            name="provider",
            field=models.CharField(
                choices=[
                    ("stripe", "Stripe"),
                    ("checkout", "Checkout.com"),
                    ("paytabs", "PayTabs"),
                    ("payme", "Payme"),
                ],
                max_length=20,
            ),
        ),
    ]
