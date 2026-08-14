import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('customer', '0002_lead'),
        ('restaurant', '0020_360dialog_whatsapp_settings'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # The reservation state table is created or adopted by 0004. Keeping
            # this migration state-only avoids colliding with legacy installations
            # that already use whatsapp_conversations for message history.
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='WhatsAppConversation',
                    fields=[
                        ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                        ('phone', models.TextField(db_index=True)),
                        ('provider', models.CharField(default='360dialog', max_length=30)),
                        ('state', models.CharField(choices=[('idle', 'Idle'), ('collecting', 'Collecting Details'), ('confirming', 'Confirming'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('handoff', 'Staff Handoff')], default='idle', max_length=30)),
                        ('context', models.JSONField(blank=True, default=dict)),
                        ('external_chat_id', models.CharField(blank=True, max_length=128, null=True)),
                        ('last_message_id', models.CharField(blank=True, max_length=128, null=True)),
                        ('last_message', models.TextField(blank=True, default='')),
                        ('last_response', models.TextField(blank=True, default='')),
                        ('expires_at', models.DateTimeField(blank=True, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='whatsapp_conversations', to='restaurant.restaurant')),
                    ],
                    options={
                        'db_table': 'whatsapp_conversations',
                        'unique_together': {('restaurant', 'phone', 'provider')},
                    },
                ),
                migrations.AddIndex(
                    model_name='whatsappconversation',
                    index=models.Index(fields=['restaurant', 'state'], name='whatsapp_co_restaur_d203da_idx'),
                ),
                migrations.AddIndex(
                    model_name='whatsappconversation',
                    index=models.Index(fields=['phone', 'updated_at'], name='whatsapp_co_phone_21e96d_idx'),
                ),
            ],
        ),
    ]
