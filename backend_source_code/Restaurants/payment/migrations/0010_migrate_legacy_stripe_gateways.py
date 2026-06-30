import json
import os

from cryptography.fernet import Fernet
from django.db import migrations
from django.utils import timezone


def migrate_legacy_stripe_gateways(apps, schema_editor):
    StripeDetails = apps.get_model("payment", "StripeDetails")
    PaymentGateway = apps.get_model("payment", "PaymentGateway")

    key = os.getenv("FERNET_KEY")
    cipher = Fernet(key.encode()) if key else None

    for legacy in StripeDetails.objects.all().iterator():
        gateway = PaymentGateway.objects.filter(
            restaurant_id=legacy.restaurant_id,
            provider="stripe",
        ).first()
        created = gateway is None
        if created:
            gateway = PaymentGateway(
                restaurant_id=legacy.restaurant_id,
                provider="stripe",
                is_enabled=True,
                is_active=not PaymentGateway.objects.filter(
                    restaurant_id=legacy.restaurant_id,
                    is_active=True,
                ).exists(),
            )

        # Never overwrite a gateway that was already migrated or configured.
        if gateway.credentials_encrypted:
            continue

        try:
            if not cipher:
                raise ValueError("FERNET_KEY is not configured")
            secret_key = cipher.decrypt(
                legacy.stripe_secret_key.encode()
            ).decode()
            publishable_key = cipher.decrypt(
                legacy.stripe_publishable_key.encode()
            ).decode()
            credentials = {
                "publishable_key": publishable_key,
                "secret_key": secret_key,
            }
            gateway.credentials_encrypted = cipher.encrypt(
                json.dumps(credentials).encode("utf-8")
            ).decode()
            gateway.key_id = publishable_key
            gateway.key_secret = legacy.stripe_secret_key
            gateway.connection_status = (
                "connected" if gateway.is_enabled else "disabled"
            )
            gateway.last_validation_at = timezone.now()
            gateway.last_error = ""
        except Exception:
            gateway.connection_status = "error"
            gateway.last_error = (
                "Legacy Stripe credentials require a stable FERNET_KEY. "
                "Reconnect Stripe after verifying deployment configuration."
            )

        gateway.save()


class Migration(migrations.Migration):
    dependencies = [
        ("payment", "0009_provider_events"),
    ]

    operations = [
        migrations.RunPython(
            migrate_legacy_stripe_gateways,
            migrations.RunPython.noop,
        ),
    ]
