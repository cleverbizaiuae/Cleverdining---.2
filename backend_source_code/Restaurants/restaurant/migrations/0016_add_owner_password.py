# Generated manually - adds owner_password field and updates choices

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0015_restaurant_google_review_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='owner_password',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name='restaurant',
            name='plan',
            field=models.CharField(choices=[('standard', 'Standard'), ('enterprise', 'Enterprise')], default='standard', max_length=20),
        ),
        migrations.AlterField(
            model_name='restaurant',
            name='status',
            field=models.CharField(choices=[('active', 'Active'), ('on_hold', 'On Hold')], default='active', max_length=20),
        ),
    ]
