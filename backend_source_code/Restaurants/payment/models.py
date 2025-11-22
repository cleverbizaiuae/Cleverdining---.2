from django.db import models
from device.models import Device
from restaurant.models import Restaurant
from order.models import Order
import os

from cryptography.fernet import Fernet
from django.core.exceptions import ValidationError

# Create your models here.

SECRET_KEY = os.getenv('FERNET_KEY')
if not SECRET_KEY:
    raise ValueError("FERNET_KEY environment variable not set.")
fernet = Fernet(SECRET_KEY.encode())




class Payment(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='payments')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='payments')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    stripe_payment_intent_id = models.CharField(max_length=255, unique=True)
    stripe_payment_method_id = models.CharField(max_length=255, null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=[('completed', 'Completed'), ('failed', 'Failed'), ('pending', 'Pending')], default='pending'
    )
    card_owner_name = models.CharField(max_length=255, null=True, blank=True)
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
    

