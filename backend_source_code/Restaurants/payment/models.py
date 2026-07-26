from django.db import models
from device.models import Device
from restaurant.models import Restaurant
from order.models import Order
import os
import json

from cryptography.fernet import Fernet
from django.core.exceptions import ValidationError
from .provider_registry import get_provider_metadata, provider_choices

# Create your models here.

# Get or generate FERNET_KEY for encryption
SECRET_KEY = os.getenv('FERNET_KEY')
if not SECRET_KEY:
    # Generate a default key for development (should be set in production)
    SECRET_KEY = Fernet.generate_key().decode()
    import warnings
    warnings.warn("FERNET_KEY not set. Using auto-generated key. Set FERNET_KEY in production!")
fernet = Fernet(SECRET_KEY.encode())


class OrderBill(models.Model):
    PAYMENT_STATUS_CHOICES = [
        ("unpaid", "Unpaid"),
        ("partially_paid", "Partially Paid"),
        ("fully_paid", "Fully Paid"),
        ("refunded", "Refunded"),
    ]
    SPLIT_METHOD_CHOICES = [
        ("", "Unset"),
        ("full_bill", "Full Bill"),
        ("evenly", "Evenly"),
        ("my_items", "My Items"),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="bill")
    table_or_order_id = models.CharField(max_length=120, blank=True, default="")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tip_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remaining_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default="unpaid")

    split_method = models.CharField(max_length=20, choices=SPLIT_METHOD_CHOICES, blank=True, default="")
    split_count = models.PositiveIntegerField(null=True, blank=True)
    per_person_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    paid_shares_count = models.PositiveIntegerField(default=0)
    unpaid_shares_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["payment_status"]),
            models.Index(fields=["split_method"]),
            models.Index(fields=["updated_at"]),
        ]

    def __str__(self):
        return f"Bill #{self.id} for Order #{self.order_id}"


class OrderBillItem(models.Model):
    ITEM_STATUS_CHOICES = [
        ("unpaid", "Unpaid"),
        ("partially_paid", "Partially Paid"),
        ("paid", "Paid"),
    ]

    bill = models.ForeignKey(OrderBill, on_delete=models.CASCADE, related_name="bill_items")
    order_item = models.OneToOneField("order.OrderItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="bill_item")
    item_name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unpaid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    item_status = models.CharField(max_length=20, choices=ITEM_STATUS_CHOICES, default="unpaid")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["bill", "item_status"]),
            models.Index(fields=["order_item"]),
        ]

    def __str__(self):
        return f"{self.item_name} (Bill #{self.bill_id})"



class Payment(models.Model):
    SPLIT_TYPE_CHOICES = [
        ("full_bill", "Full Bill"),
        ("evenly", "Evenly"),
        ("my_items", "My Items"),
    ]
    PROVIDER_CHOICES = [
        ('stripe', 'Stripe'),
        ('checkout', 'Checkout.com'),
        ('paytabs', 'PayTabs'),
        ('payme', 'Payme'),
        ('adyen', 'Adyen'),
        ('worldpay', 'Worldpay'),
        ('sumup', 'SumUp'),
        ('square', 'Square'),
        ('cash', 'Cash'),
        ('apple_pay', 'Apple Pay'),
        ('google_pay', 'Google Pay'),
    ]
    
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='payments')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='payments')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    bill = models.ForeignKey(OrderBill, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    
    # Generic fields
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='stripe')
    transaction_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    split_type = models.CharField(max_length=20, choices=SPLIT_TYPE_CHOICES, default="full_bill")
    payer_id_or_name = models.CharField(max_length=255, blank=True, default="")
    
    # Wallet-specific fields
    wallet_token_reference = models.CharField(max_length=255, null=True, blank=True)
    
    # Legacy / Specific fields
    stripe_payment_intent_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_payment_method_id = models.CharField(max_length=255, null=True, blank=True)
    
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[
            ('completed', 'Completed'),
            ('failed', 'Failed'),
            ('pending', 'Pending'),
            ('cancelled', 'Cancelled'),
        ],
        default='pending',
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


class PaymentProviderEvent(models.Model):
    STATUS_CHOICES = [
        ("received", "Received"),
        ("processed", "Processed"),
        ("ignored", "Ignored"),
        ("failed", "Failed"),
        ("rejected", "Rejected"),
    ]

    provider = models.CharField(max_length=20)
    gateway = models.ForeignKey(
        "PaymentGateway",
        on_delete=models.CASCADE,
        related_name="provider_events",
    )
    provider_event_id = models.CharField(max_length=255)
    payload_hash = models.CharField(max_length=64)
    signature_hash = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="received")
    replay_detected = models.BooleanField(default=False)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("provider", "gateway", "provider_event_id")
        indexes = [
            models.Index(fields=["provider", "provider_event_id"]),
            models.Index(fields=["gateway", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        return f"{self.provider}:{self.provider_event_id}"


class PaymentAllocation(models.Model):
    PARTICIPANT_STATUS_CHOICES = [
        ("unpaid", "Unpaid"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]
    ALLOCATION_TYPE_CHOICES = [
        ("bill", "Bill"),
        ("share", "Share"),
        ("item", "Item"),
        ("fee", "Fee"),
    ]

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="allocations")
    bill = models.ForeignKey(OrderBill, on_delete=models.CASCADE, related_name="allocations")
    bill_item = models.ForeignKey(OrderBillItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="allocations")
    participant_id = models.CharField(max_length=255, blank=True, default="")
    allocated_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    allocated_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    allocation_type = models.CharField(max_length=20, choices=ALLOCATION_TYPE_CHOICES, default="bill")
    participant_status = models.CharField(max_length=20, choices=PARTICIPANT_STATUS_CHOICES, default="unpaid")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["bill", "allocation_type"]),
            models.Index(fields=["participant_status"]),
            models.Index(fields=["participant_id"]),
        ]

    def __str__(self):
        return f"Allocation #{self.id} ({self.allocation_type}) for Payment #{self.payment_id}"





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
    PROVIDER_CHOICES = provider_choices(include_legacy=True)
    CONNECTION_STATUS_CHOICES = [
        ('not_configured', 'Not Configured'),
        ('connected', 'Connected'),
        ('error', 'Error'),
        ('disabled', 'Disabled'),
    ]
    WEBHOOK_STATUS_CHOICES = [
        ('unknown', 'Unknown'),
        ('healthy', 'Healthy'),
        ('failing', 'Failing'),
    ]
    
    GOOGLE_PAY_ENVIRONMENT_CHOICES = [
        ('TEST', 'Test'),
        ('PRODUCTION', 'Production'),
    ]
    
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='payment_gateways')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    is_active = models.BooleanField(default=False)
    is_enabled = models.BooleanField(default=True)
    sandbox_mode = models.BooleanField(default=True)
    connection_status = models.CharField(max_length=30, choices=CONNECTION_STATUS_CHOICES, default='not_configured')
    webhook_status = models.CharField(max_length=30, choices=WEBHOOK_STATUS_CHOICES, default='unknown')
    
    # Common fields for keys
    key_id = models.CharField(max_length=255, blank=True, default="") # Compatibility alias for public/merchant key
    key_secret = models.CharField(max_length=255, blank=True, default="") # Compatibility alias for primary secret
    credentials_encrypted = models.TextField(blank=True, default="")
    provider_metadata = models.JSONField(default=dict, blank=True)
    last_validation_at = models.DateTimeField(null=True, blank=True)
    last_health_check_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    
    # Apple Pay Configuration
    apple_pay_enabled = models.BooleanField(default=False)
    apple_merchant_id = models.CharField(max_length=255, null=True, blank=True)
    apple_domain_verified = models.BooleanField(default=False)
    
    # Google Pay Configuration
    google_pay_enabled = models.BooleanField(default=False)
    google_merchant_id = models.CharField(max_length=255, null=True, blank=True)
    google_environment = models.CharField(
        max_length=10,
        choices=GOOGLE_PAY_ENVIRONMENT_CHOICES,
        default='TEST'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('restaurant', 'provider')

    def clean(self):
        if not self.is_active:
            return
        try:
            metadata = get_provider_metadata(self.provider)
        except Exception:
            return
        credentials = self.get_credentials()
        missing = [
            field.label
            for field in metadata.credentials
            if field.required and not str(credentials.get(field.key, "")).strip()
        ]
        if missing:
            raise ValidationError(f"Missing required credentials: {', '.join(missing)}")

    def save(self, *args, **kwargs):
        # Ensure only one gateway is active per restaurant
        if self.is_active:
            self.is_enabled = True
            PaymentGateway.objects.filter(restaurant=self.restaurant).exclude(id=self.id).update(is_active=False)
            
        # Encrypt secret key if it's not already encrypted (basic check)
        # Note: In a real app, handle this more robustly to avoid double encryption
        if self.key_secret:
            try:
                fernet.decrypt(self.key_secret.encode())
            except Exception:
                self.key_secret = fernet.encrypt(self.key_secret.encode()).decode()
            
        super().save(*args, **kwargs)

    def get_decrypted_secret(self):
        credentials = self.get_credentials()
        for key in ("secret_key", "api_key", "service_key", "access_token", "key_secret", "server_key", "client_secret", "password"):
            if credentials.get(key):
                return str(credentials[key])
        if not self.key_secret:
            return ""
        return fernet.decrypt(self.key_secret.encode()).decode()

    def _credential_aliases(self):
        return {
            "stripe": ("publishable_key", "secret_key"),
            "checkout": ("public_key", "secret_key"),
            "paytabs": ("profile_id", "server_key"),
            "payme": ("merchant_id", "api_key"),
            "adyen": ("merchant_account", "api_key"),
            "worldpay": ("merchant_code", "service_key"),
            "sumup": ("merchant_code", "api_key"),
            "square": ("application_id", "access_token"),
        }.get(self.provider, ("key_id", "key_secret"))

    def set_credentials(self, credentials):
        clean_credentials = {
            str(key): value
            for key, value in (credentials or {}).items()
            if value is not None and str(value).strip() != ""
        }
        if not clean_credentials:
            return
        current = self.get_credentials()
        current.update(clean_credentials)
        self.credentials_encrypted = fernet.encrypt(json.dumps(current).encode("utf-8")).decode()
        public_key, secret_key = self._credential_aliases()
        if current.get(public_key):
            self.key_id = str(current.get(public_key))
        if current.get(secret_key):
            self.key_secret = str(current.get(secret_key))

    def get_credentials(self):
        credentials = {}
        if self.credentials_encrypted:
            try:
                credentials.update(json.loads(fernet.decrypt(self.credentials_encrypted.encode()).decode("utf-8")))
            except Exception:
                credentials = {}
        public_key, secret_key = self._credential_aliases()
        if self.key_id and public_key not in credentials:
            credentials[public_key] = self.key_id
        if self.key_secret and secret_key not in credentials:
            try:
                credentials[secret_key] = fernet.decrypt(self.key_secret.encode()).decode()
            except Exception:
                credentials[secret_key] = self.key_secret
        return credentials

    def has_credentials(self):
        try:
            metadata = get_provider_metadata(self.provider)
        except Exception:
            return bool(self.key_id and self.key_secret)
        credentials = self.get_credentials()
        return all(
            bool(str(credentials.get(field.key, "")).strip())
            for field in metadata.credentials
            if field.required
        )

    def masked_credentials(self):
        credentials = self.get_credentials()
        masked = {}
        try:
            metadata = get_provider_metadata(self.provider)
            fields = metadata.credentials
        except Exception:
            fields = []
        for field in fields:
            value = credentials.get(field.key)
            if not value:
                masked[field.key] = {"configured": False, "value": ""}
            elif field.secret:
                masked[field.key] = {"configured": True, "value": "••••••••"}
            else:
                masked[field.key] = {"configured": True, "value": value}
        return masked

    def __str__(self):
        return f"{self.provider} - {self.restaurant.resturent_name}"
    
