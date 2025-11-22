from django.db import models
from accounts.models import User
from django.core.exceptions import ValidationError

class Restaurant(models.Model):
    resturent_name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20, unique=True)
    package = models.CharField(max_length=100, blank=True, null=True)
    image = models.ImageField(upload_to='media/restaurant_images/', null=True, blank=True)
    logo = models.ImageField(upload_to='media/restaurant_logos/', null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='restaurants')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.resturent_name
    



