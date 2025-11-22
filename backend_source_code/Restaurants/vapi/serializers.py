from rest_framework import serializers
from .models import Assistance





class AssistanceCreateSerializer(serializers.Serializer):
    twilio_number      = serializers.CharField(max_length=20)
    twilio_account_sid = serializers.CharField(max_length=500)
    twilio_auth_token  = serializers.CharField(max_length=500)
