from datetime import timedelta

from django.db import migrations, models


def remove_legacy_default_buffer(apps, schema_editor):
    Reservation = apps.get_model('device', 'Reservation')
    active_statuses = ['confirmed', 'accept', 'overdue', 'seated', 'extended']
    for reservation in Reservation.objects.filter(
        status__in=active_statuses,
        buffer_minutes=10,
    ).iterator():
        reservation.buffer_minutes = 0
        if reservation.reservation_time:
            reservation.end_time = reservation.reservation_time + timedelta(
                minutes=int(reservation.duration_minutes or 90)
            )
        reservation.save(update_fields=['buffer_minutes', 'end_time'])


class Migration(migrations.Migration):

    dependencies = [
        ('device', '0018_device_capacity_reservation_reminders'),
    ]

    operations = [
        migrations.AlterField(
            model_name='reservation',
            name='buffer_minutes',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(remove_legacy_default_buffer, migrations.RunPython.noop),
    ]
