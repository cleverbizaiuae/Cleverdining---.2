from django.contrib import admin
from .models import ChatMessage,CallSession
# Register your models here.


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'sender', 'receiver', 'device', 'restaurant', 'is_from_device', 'timestamp')
    list_filter = ('is_from_device', 'timestamp')
    search_fields = ('message', 'sender__email', 'receiver__email')




@admin.register(CallSession)
class CallSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'caller', 'receiver', 'device', 'is_active', 'started_at', 'ended_at')
    list_filter = ('is_active', 'started_at')
    search_fields = ('caller__username', 'receiver__username', 'device__id')

