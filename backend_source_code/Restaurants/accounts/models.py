from django.db import models
from django.contrib.auth.models import AbstractUser
from .constants import ROLE_CHOICES,ACTION_CHOICES
from django.core.validators import RegexValidator
import random

# Create your models here.

class User(AbstractUser):
    # extra field add 
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10,choices=ROLE_CHOICES,default='customer')
    username = models.CharField(max_length=150,unique=False,validators=[RegexValidator(regex=r'^[\w\s.@+-]+$',message='Username may contain letters, digits, spaces and @/./+/-/_ characters.')])
    image = models.ImageField(upload_to='media/user_images/', null=True, blank=True)
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return f"User(id={self.id}, username='{self.username}', email='{self.email}', role='{self.role}', image='{self.image.url if self.image else None}')"


    

class ChefStaff(models.Model):
    restaurant = models.ForeignKey('restaurant.Restaurant', on_delete=models.CASCADE, related_name='chefstaffs')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_roles')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, default='pending')
    generate = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_time = models.DateTimeField(auto_now=True)



class PasswordResetOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    otp = models.CharField(max_length=4)
    created_at = models.DateTimeField(auto_now_add=True)
    is_verified = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.otp:
            self.otp = str(random.randint(1000, 9999))
        super().save(*args, **kwargs)




 
    

