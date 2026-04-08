from django.db import models
from accounts.models import User
from django.core.exceptions import ValidationError
from django.utils import timezone as dj_timezone

class Restaurant(models.Model):
    REGION_CHOICES = [
        ('UAE', 'UAE'),
        ('UK', 'UK'),
    ]

    resturent_name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    region = models.CharField(max_length=10, choices=REGION_CHOICES, default='UAE', db_index=True)
    currency = models.CharField(max_length=10, default='AED')
    timezone = models.CharField(max_length=64, default='Asia/Dubai')
    country_code = models.CharField(max_length=8, default='+971')
    default_payment_provider = models.CharField(max_length=30, default='stripe')
    city = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    phone_number = models.CharField(max_length=20, unique=True)
    package = models.CharField(max_length=100, blank=True, null=True)
    image = models.ImageField(upload_to='media/restaurant_images/', null=True, blank=True)
    logo = models.ImageField(upload_to='media/restaurant_logos/', null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='restaurants')
    
    # Google Review URL - configured by owner in dashboard
    google_review_url = models.URLField(max_length=500, null=True, blank=True, help_text="Google Business Profile review URL")
    
    # Plan & Status
    PLAN_CHOICES = [
        ('standard', 'Standard'),
        ('enterprise', 'Enterprise'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('on_hold', 'On Hold'),
    ]

    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='standard')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    
    # Owner password (stored for Super Admin visibility)
    owner_password = models.CharField(max_length=255, null=True, blank=True)
    
    # Capacity
    qr_codes = models.PositiveIntegerField(default=10)
    table_count = models.PositiveIntegerField(default=10)
    payment_processor = models.CharField(max_length=30, default='stripe')
    
    # Subscription
    subscription_start = models.DateTimeField(default=dj_timezone.now)
    subscription_end = models.DateTimeField(null=True, blank=True)
    
    # WhatsApp Configuration (Enterprise)
    whatsapp_enabled = models.BooleanField(default=False)
    whatsapp_waba_id = models.CharField(max_length=255, null=True, blank=True)
    whatsapp_phone_number_id = models.CharField(max_length=255, null=True, blank=True)
    whatsapp_business_display_number = models.CharField(max_length=50, null=True, blank=True)
    whatsapp_access_token = models.TextField(null=True, blank=True) # Encrypt in production!
    whatsapp_app_id = models.CharField(max_length=255, null=True, blank=True)
    whatsapp_app_secret = models.CharField(max_length=255, null=True, blank=True)
    whatsapp_webhook_verify_token = models.CharField(max_length=255, null=True, blank=True)
    whatsapp_webhook_callback_url = models.URLField(max_length=500, null=True, blank=True)
    whatsapp_api_version = models.CharField(max_length=10, default="v20.0")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.resturent_name
    
    @property
    def active_business_day(self):
        return self.business_days.filter(is_active=True).last()

    @property
    def region_settings(self):
        from restaurant.region_config import get_region_config
        return get_region_config(self.region)

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
