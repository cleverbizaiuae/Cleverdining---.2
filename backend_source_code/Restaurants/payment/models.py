from django.db import models
from device.models import Device
from restaurant.models import Restaurant
from order.models import Order
import os

from cryptography.fernet import Fernet
from django.core.exceptions import ValidationError

# Create your models here.

# Get or generate FERNET_KEY for encryption
SECRET_KEY = os.getenv('FERNET_KEY')
if not SECRET_KEY:
    # Generate a default key for development (should be set in production)
    SECRET_KEY = Fernet.generate_key().decode()
    import warnings
    warnings.warn("FERNET_KEY not set. Using auto-generated key. Set FERNET_KEY in production!")
fernet = Fernet(SECRET_KEY.encode())




class Payment(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='payments')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='payments')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    
    # Generic fields
    provider = models.CharField(max_length=20, default='stripe')
    transaction_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    
    # Legacy / Specific fields
    stripe_payment_intent_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_payment_method_id = models.CharField(max_length=255, null=True, blank=True)
    
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=[('completed', 'Completed'), ('failed', 'Failed'), ('pending', 'Pending')], default='pending'
    )
    card_owner_name = models.CharField(max_length=255, null=True, blank=True)
    
    # Audit / Staff Action Fields
    created_by = models.CharField(max_length=255, null=True, blank=True) # e.g., 'guest', 'staff:ID'
    
    confirmed_by_staff = models.ForeignKey('staff.Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='confirmed_payments')
    confirmed_at = models.DateTimeField(null=True, blank=True)
    
    cancelled_by = models.ForeignKey('staff.Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='cancelled_payments')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.TextField(null=True, blank=True)
    
    raw_response = models.JSONField(null=True, blank=True) # Store provider response for debug
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment for Order #{self.order.id} by Device #{self.device.id}"





class StripeDetails(models.Model):
    restaurant = models.OneToOneField(Restaurant, on_delete=models.CASCADE, related_name='stripe_details')
    stripe_secret_key = models.CharField(max_length=255)
    stripe_publishable_key = models.CharField(max_length=255)

    def __str__(self):
        return f"Stripe Details for {self.restaurant.resturent_name}"

    def clean(self):
        """Ensure that both keys are provided and encrypted properly."""
        if not self.stripe_secret_key or not self.stripe_publishable_key:
            raise ValidationError("Both Stripe keys are required.")

        
        if self.stripe_secret_key == '' or self.stripe_publishable_key == '':
            raise ValidationError("Encrypted keys cannot be empty.")

    def save(self, *args, **kwargs):
       
        self.stripe_secret_key = self.encrypt(self.stripe_secret_key)
        self.stripe_publishable_key = self.encrypt(self.stripe_publishable_key)

        self.clean()

        super().save(*args, **kwargs)

    def encrypt(self, key):
        """Encrypt the key before saving."""
        return fernet.encrypt(key.encode()).decode()

    def decrypt(self, key):
        """Decrypt the key when you need to use it."""
        return fernet.decrypt(key.encode()).decode()

    def get_decrypted_secret_key(self):
        """Retrieve the decrypted secret key."""
        return self.decrypt(self.stripe_secret_key)

    def get_decrypted_publishable_key(self):
        """Retrieve the decrypted publishable key."""
        return self.decrypt(self.stripe_publishable_key)


class PaymentGateway(models.Model):
    PROVIDER_CHOICES = [
        ('stripe', 'Stripe'),
        ('razorpay', 'Razorpay'),
    ]
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='payment_gateways')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    is_active = models.BooleanField(default=False)
    
    # Common fields for keys
    key_id = models.CharField(max_length=255) # Publishable Key (Stripe) / Key ID (Razorpay)
    key_secret = models.CharField(max_length=255) # Secret Key (Stripe) / Key Secret (Razorpay)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('restaurant', 'provider')

    def clean(self):
        if not self.key_id or not self.key_secret:
            raise ValidationError("Both Key ID and Key Secret are required.")

    def save(self, *args, **kwargs):
        # Ensure only one gateway is active per restaurant
        if self.is_active:
            PaymentGateway.objects.filter(restaurant=self.restaurant).exclude(id=self.id).update(is_active=False)
            
        # Encrypt secret key if it's not already encrypted (basic check)
        # Note: In a real app, handle this more robustly to avoid double encryption
        try:
            fernet.decrypt(self.key_secret.encode())
        except:
            self.key_secret = fernet.encrypt(self.key_secret.encode()).decode()
            
        super().save(*args, **kwargs)

    def get_decrypted_secret(self):
        return fernet.decrypt(self.key_secret.encode()).decode()

    def __str__(self):
        return f"{self.provider} - {self.restaurant.resturent_name}"
    

