import datetime

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('restaurant', '0022_brandconfig_pay_before_order')]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='reservation_duration_minutes',
            field=models.PositiveIntegerField(default=90),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='reservation_slot_start',
            field=models.TimeField(default=datetime.time(18, 0)),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='reservation_slot_end',
            field=models.TimeField(default=datetime.time(22, 0)),
        ),
    ]
