from django.db import models
from device.models import Device
from restaurant.models import Restaurant
from item.models import Item
from .constants import STATUS,PAYMENT_STATUS 

class Order(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='orders')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='orders')
    status = models.CharField(max_length=20,choices=STATUS,default='pending')
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    payment_status = models.CharField(max_length=10, choices=PAYMENT_STATUS, default='unpaid',blank=True,null=True)
    created_time = models.DateTimeField(auto_now_add=True)
    updated_time = models.DateTimeField(auto_now=True)

    
    class Meta:
        ordering = ['-created_time']
        
        
    def __str__(self):
        return f"Order #{self.id} - {self.status}"



class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='order_items')
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=12, decimal_places=2)  # Copy from item.price

    def get_total_price(self):
        return self.quantity * self.price

    def __str__(self):
        return f"{self.quantity} x {self.item.item_name}"



