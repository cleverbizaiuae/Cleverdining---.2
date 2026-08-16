from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('device', '0017_alter_reservation_device')]

    operations = [
        migrations.AddField(
            model_name='device',
            name='capacity',
            field=models.PositiveIntegerField(default=4),
        ),
        migrations.AddField(
            model_name='reservation',
            name='reminder_24h_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='reservation',
            name='reminder_2h_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='reservation',
            name='follow_up_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
