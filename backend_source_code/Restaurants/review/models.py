from django.db import models
from order.models import Order
from device.models import Device

# Create your models here.

class Review(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='review')
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='reviews')
    guest_no = models.IntegerField() 
    name = models.CharField(max_length=150, blank=True, null=True)
    rating = models.IntegerField()  
    comment = models.TextField(blank=True, null=True)
    created_time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Review for Order #{self.order.id} "





