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
    
    @property
    def active_business_day(self):
        return self.business_days.filter(is_active=True).last()

class BusinessDay(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='business_days')
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    closed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='closed_business_days')
    
    # Snapshot stats for easy historical querying
    total_revenue = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    total_orders = models.PositiveIntegerField(default=0)
    
    # Close Day Snapshots
    total_cash_payment = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    total_card_payment = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    total_tips = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    
    class Meta:
        ordering = ['-opened_at']

    def __str__(self):
        status = "Open" if self.is_active else "Closed"
        return f"{self.restaurant.resturent_name} - {self.opened_at.strftime('%Y-%m-%d')} ({status})"
