from django.db import models
from .constants import ACTION_CHOICES,STATUS_CHOICES
from accounts.models import User
from restaurant.models import Restaurant

# Create your models here.

class Device(models.Model):
    table_name = models.CharField(max_length=50)
    region = models.CharField(max_length=50, default='Primary', blank=True)
    table_number = models.CharField(max_length=20, null=True, blank=True)  # New field for table identifier
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='devices')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, default='active')

    def __str__(self):
        return f"{self.table_name}"
    




class Reservation(models.Model):
    customer_name = models.CharField(max_length=255)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='reservations')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='reservations',null=True, blank=True)
    guest_no = models.PositiveIntegerField()
    cell_number = models.CharField(max_length=15)
    email = models.EmailField(null=True, blank=True)
    reservation_time = models.DateTimeField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='hold')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.customer_name} - {self.device.table_name} - {self.guest_no} - {self.reservation_time.strftime('%H:%M')} - {self.status} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"
    




