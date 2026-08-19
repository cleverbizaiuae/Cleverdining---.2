from django.db import models
import uuid as uuid_lib
from .constants import ACTION_CHOICES,STATUS_CHOICES,SOURCE_CHOICES
from accounts.models import User
from restaurant.models import Restaurant
import qrcode
from io import BytesIO
from django.core.files.base import ContentFile
import urllib.parse
from datetime import timedelta

# Create your models here.

class Device(models.Model):
    table_name = models.CharField(max_length=50)
    region = models.CharField(max_length=50, default='', blank=True)
    table_number = models.CharField(max_length=20, null=True, blank=True)  # New field for table identifier
    capacity = models.PositiveIntegerField(default=4)
    uuid = models.UUIDField(default=uuid_lib.uuid4, editable=False, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='devices')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, default='active')
    table_token = models.UUIDField(default=uuid_lib.uuid4, editable=True, unique=True) # Token for QR code, rotatable
    qr_code_image = models.ImageField(upload_to='media/qr_codes/', blank=True, null=True)

    @property
    def table_url(self):
        # Canonical URL uses token route for stable table access across environments.
        # Keep query params as compatibility metadata for older clients.
        base_url = "https://officialcleverdiningcustomer.netlify.app"
        token_path = f"/t/{self.restaurant.id}/{self.table_token}"
        params = {
            "id": self.id,
            "table": self.table_name,
            "restaurant_id": self.restaurant.id
        }
        return f"{base_url}{token_path}?{urllib.parse.urlencode(params)}"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)  # Save first to get ID if new
        
        if is_new or not self.qr_code_image:
            try:
                self.generate_qr_code()
            except Exception as e:
                print(f"CRITICAL: Failed to generate QR code: {e}")

    def generate_qr_code(self):
        qr_url = self.table_url
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        file_name = f"qr_table_{self.id}_{self.uuid}.png"
        
        try:
             self.qr_code_image.save(file_name, ContentFile(buffer.getvalue()), save=False)
             super().save(update_fields=['qr_code_image'])
        except Exception as e:
             print(f"CRITICAL: Failed to save QR code for device {self.id}: {e}")

    def __str__(self):
        return f"{self.table_name}"

    class Meta:
        indexes = [
            models.Index(fields=['restaurant', 'action'], name='device_rest_action_idx'),
            models.Index(fields=['restaurant', 'table_name'], name='device_rest_table_name_idx'),
            models.Index(fields=['restaurant', 'table_number'], name='device_rest_table_no_idx'),
        ]

class GuestSession(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='guest_sessions')
    session_token = models.CharField(max_length=255, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Session {self.id} for {self.device.table_name}"
    




class Reservation(models.Model):
    customer_name = models.CharField(max_length=255)
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, related_name='reservations', null=True, blank=True)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='reservations',null=True, blank=True)
    table_name = models.CharField(max_length=80, blank=True, default='')
    table_capacity = models.PositiveIntegerField(null=True, blank=True)
    guest_no = models.PositiveIntegerField()
    cell_number = models.CharField(max_length=15)
    email = models.EmailField(null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='dashboard')
    reservation_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=90)
    buffer_minutes = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='hold')
    custom_request = models.TextField(blank=True, default='')
    actual_seated_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)
    extension_minutes = models.PositiveIntegerField(default=0)
    updated_by_staff_id = models.CharField(max_length=64, null=True, blank=True)
    status_reason = models.TextField(null=True, blank=True)
    whatsapp_phone_number_id = models.CharField(max_length=128, null=True, blank=True)
    whatsapp_chat_id = models.CharField(max_length=128, null=True, blank=True)
    whatsapp_message_id = models.CharField(max_length=128, null=True, blank=True)
    raw_customer_text = models.TextField(null=True, blank=True)
    ai_confidence = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    missing_fields = models.TextField(null=True, blank=True)
    reminder_24h_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_2h_sent_at = models.DateTimeField(null=True, blank=True)
    follow_up_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.device_id:
            if not self.restaurant_id:
                self.restaurant = self.device.restaurant
            if not self.table_name:
                self.table_name = self.device.table_name or ''
            if self.table_capacity is None and hasattr(self.device, 'capacity'):
                self.table_capacity = getattr(self.device, 'capacity', None)
        if self.reservation_time and not self.end_time:
            block_minutes = int(self.duration_minutes or 90) + int(self.buffer_minutes or 0)
            self.end_time = self.reservation_time + timedelta(minutes=block_minutes)
        super().save(*args, **kwargs)

    def __str__(self):
        table_name = self.table_name or (self.device.table_name if self.device_id else "Deleted table")
        return f"{self.customer_name} - {table_name} - {self.guest_no} - {self.reservation_time.strftime('%H:%M')} - {self.status} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"

    class Meta:
        indexes = [
            models.Index(fields=['restaurant', 'reservation_time'], name='reservation_rest_time_idx'),
            models.Index(fields=['restaurant', 'status'], name='reservation_rest_status_idx'),
            models.Index(fields=['restaurant', 'source'], name='reservation_rest_source_idx'),
            models.Index(fields=['device', 'reservation_time'], name='reservation_device_time_idx'),
            models.Index(fields=['cell_number'], name='reservation_cell_idx'),
        ]
    
