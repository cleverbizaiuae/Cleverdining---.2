from django.db import models
import uuid as uuid_lib
from .constants import ACTION_CHOICES,STATUS_CHOICES
from accounts.models import User
from restaurant.models import Restaurant
import qrcode
from io import BytesIO
from django.core.files.base import ContentFile
import urllib.parse

# Create your models here.

class Device(models.Model):
    table_name = models.CharField(max_length=50)
    region = models.CharField(max_length=50, default='Primary', blank=True)
    table_number = models.CharField(max_length=20, null=True, blank=True)  # New field for table identifier
    uuid = models.UUIDField(default=uuid_lib.uuid4, editable=False, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='devices')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, default='active')
    table_token = models.UUIDField(default=uuid_lib.uuid4, editable=True, unique=True) # Token for QR code, rotatable
    qr_code_image = models.ImageField(upload_to='media/qr_codes/', blank=True, null=True)

    @property
    def table_url(self):
        # Centralized logic for table URL
        base_url = "https://clever-biz2.netlify.app"
        # base_url = "https://cleverbiz-mobile.onrender.com" # Alternative if needed
        table_name_encoded = urllib.parse.quote(self.table_name)
        return f"{base_url}/login?table={table_name_encoded}&id={self.id}"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)  # Save first to get ID if new
        
        if is_new or not self.qr_code_image:
            self.generate_qr_code()

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
        
        self.qr_code_image.save(file_name, ContentFile(buffer.getvalue()), save=False)
        super().save(update_fields=['qr_code_image'])

    def __str__(self):
        return f"{self.table_name}"

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
    




