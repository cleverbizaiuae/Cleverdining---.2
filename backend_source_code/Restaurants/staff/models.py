from django.db import models
from django.conf import settings
from restaurant.models import Restaurant

class Staff(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile', null=True, blank=True)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='staff_members')
    role = models.CharField(max_length=50, choices=[('manager', 'Manager'), ('staff', 'Staff'), ('chef', 'Chef'), ('waiter', 'Waiter')], default='waiter')
    email = models.EmailField(null=True, blank=True) # unique=True removed for SQLite compatibility
    password = models.CharField(max_length=128, null=True, blank=True) # Storing hashed password
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.email or self.user.username} - {self.restaurant.name}"
