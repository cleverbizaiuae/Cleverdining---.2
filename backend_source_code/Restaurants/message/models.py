from django.db import models
from accounts.models import User
from device.models import Device
from restaurant.models import Restaurant
from django.utils import timezone
from device.models import Device

# Create your models here.

class ChatMessage(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages', null=True, blank=True)
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_messages', null=True, blank=True)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='messages', null=True, blank=True)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='messages', null=True, blank=True)

    message = models.TextField()
    is_from_device = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)
    room_name = models.CharField(max_length=255, blank=True, null=True)
    new_message = models.BooleanField(default=True)
    
    # Read tracking
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        if self.is_from_device:
            return f"Device Msg: {self.device} -> {self.restaurant}"
        else:
            return f"{self.sender} -> {self.receiver}"


class UnreadCount(models.Model):
    """Denormalized unread counts for performance"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    user_role = models.CharField(max_length=50)  # customer, staff, chef, manager
    unread_count = models.IntegerField(default=0)
    last_updated = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'unread_counts'
        




class CallSession(models.Model):
    caller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='outgoing_calls')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='incoming_calls')
    device = models.ForeignKey(Device, on_delete=models.CASCADE, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    
    def end_call(self):
        self.is_active = False
        self.ended_at = timezone.now()
        self.save()