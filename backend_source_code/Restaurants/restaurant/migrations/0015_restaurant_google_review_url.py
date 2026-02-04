# Generated manually to re-add google_review_url after 0013 removed it

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0014_restaurant_qr_codes_restaurant_table_count'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='google_review_url',
            field=models.URLField(blank=True, help_text='Google Business Profile review URL', max_length=500, null=True),
        ),
    ]
