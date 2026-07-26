from django.db import migrations
from django.utils import timezone


def sync_cancelled_payment_attempts(apps, schema_editor):
    Payment = apps.get_model("payment", "Payment")

    # Orders cancelled before payment synchronization was added may still have
    # pending payment rows. Retire those rows so the Payments page is accurate.
    cancelled_order_attempts = Payment.objects.filter(
        order__status="cancelled",
        status="pending",
    )
    cancelled_order_attempts.update(
        status="cancelled",
        cancelled_at=timezone.now(),
        cancel_reason="Order cancelled",
    )

    # If a customer abandoned a gateway checkout and ultimately chose cash,
    # the cash attempt is the active method. Preserve the gateway attempt for
    # audit purposes but mark it superseded.
    cash_order_ids = Payment.objects.filter(
        provider="cash",
        status__in=["pending", "completed"],
    ).values_list("order_id", flat=True)
    Payment.objects.filter(
        order_id__in=cash_order_ids,
        status="pending",
    ).exclude(provider="cash").update(
        status="cancelled",
        cancelled_at=timezone.now(),
        cancel_reason="Payment method changed to cash",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("payment", "0011_alter_payment_status"),
    ]

    operations = [
        migrations.RunPython(sync_cancelled_payment_attempts, migrations.RunPython.noop),
    ]
