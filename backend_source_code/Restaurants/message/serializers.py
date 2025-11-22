from rest_framework import serializers
from .models import ChatMessage

class ChatMessageSerializer(serializers.ModelSerializer):
    sender = serializers.PrimaryKeyRelatedField(read_only=True)
    receiver = serializers.PrimaryKeyRelatedField(read_only=True)
    restaurant = serializers.PrimaryKeyRelatedField(read_only=True)
    is_from_device = serializers.BooleanField(read_only=True)
    device = serializers.PrimaryKeyRelatedField(read_only=True)
    timestamp = serializers.DateTimeField(read_only=True)
    room_name = serializers.CharField(read_only=True)
    message = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    new_message = serializers.BooleanField(required=False, allow_null=True)
    is_read = serializers.BooleanField(read_only=True)
    read_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = ChatMessage
        fields = '__all__'