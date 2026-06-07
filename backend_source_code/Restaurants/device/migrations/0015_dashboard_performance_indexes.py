# Generated for dashboard read performance.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('device', '0014_device_qr_code_image'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='device',
            index=models.Index(fields=['restaurant', 'action'], name='device_rest_action_idx'),
        ),
        migrations.AddIndex(
            model_name='device',
            index=models.Index(fields=['restaurant', 'table_name'], name='device_rest_table_name_idx'),
        ),
        migrations.AddIndex(
            model_name='device',
            index=models.Index(fields=['restaurant', 'table_number'], name='device_rest_table_no_idx'),
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['restaurant', 'reservation_time'], name='reservation_rest_time_idx'),
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['restaurant', 'status'], name='reservation_rest_status_idx'),
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['device', 'reservation_time'], name='reservation_device_time_idx'),
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['cell_number'], name='reservation_cell_idx'),
        ),
    ]
