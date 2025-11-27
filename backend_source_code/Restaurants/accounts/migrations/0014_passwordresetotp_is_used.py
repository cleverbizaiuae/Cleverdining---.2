# Generated migration for PasswordResetOTP model
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_alter_chefstaff_action'),
    ]

    operations = [
        migrations.AddField(
            model_name='passwordresetotp',
            name='is_used',
            field=models.BooleanField(default=False),
        ),
    ]


