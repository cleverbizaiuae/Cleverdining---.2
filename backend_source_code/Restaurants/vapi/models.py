from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth.hashers import make_password, check_password
from restaurant.models import Restaurant

class Assistance(models.Model):
    restaurant = models.OneToOneField(Restaurant, on_delete=models.CASCADE, related_name='ai_assistance')
    twilio_number = models.CharField(max_length=20, unique=True)
    twilio_account_sid = models.CharField(max_length=500)
    twilio_auth_token = models.CharField(max_length=500)

    vapi_phone_number_id = models.CharField(max_length=500, unique=True)  
    assistant_id = models.CharField(max_length=500, unique=True)

    tool1_id = models.CharField(max_length=500, blank=True, null=True)
    tool2_id = models.CharField(max_length=500, blank=True, null=True)     

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.twilio_account_sid.startswith('pbkdf2_'):
            self.twilio_account_sid = make_password(self.twilio_account_sid)
        if not self.twilio_auth_token.startswith('pbkdf2_'):
            self.twilio_auth_token = make_password(self.twilio_auth_token)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"AI Assistance for {self.restaurant.resturent_name}"




