from django.db import migrations, models


class Migration(migrations.Migration):
    """Add Ireland (EUR) and Ghana (GHS) as restaurant regions.

    Choices-only change: no column type, default or data changes, so existing
    UAE and UK restaurants are untouched.
    """

    dependencies = [('restaurant', '0023_reservation_settings')]

    operations = [
        migrations.AlterField(
            model_name='restaurant',
            name='region',
            field=models.CharField(
                choices=[('UAE', 'UAE'), ('UK', 'UK'), ('IE', 'Ireland'), ('GH', 'Ghana')],
                db_index=True,
                default='UAE',
                max_length=10,
            ),
        ),
    ]
