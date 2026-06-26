from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0019_brandconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_provider',
            field=models.CharField(default='manual', max_length=30),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_360dialog_channel_id',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_chatbot_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_greeting_tone',
            field=models.CharField(default='classic', max_length=30),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_emoji_style',
            field=models.CharField(default='minimal', max_length=30),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_signoff',
            field=models.CharField(blank=True, default='We look forward to hosting you.', max_length=255),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='whatsapp_special_phrases',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
