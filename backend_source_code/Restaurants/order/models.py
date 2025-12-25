from django.db import models
from device.models import Device
from restaurant.models import Restaurant
from item.models import Item
from .constants import STATUS,PAYMENT_STATUS 

class Order(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='orders')
    guest_session = models.ForeignKey('device.GuestSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='orders')
    business_day = models.ForeignKey('restaurant.BusinessDay', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    status = models.CharField(max_length=20,choices=STATUS,default='pending')
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    payment_status = models.CharField(max_length=50, choices=PAYMENT_STATUS, default='unpaid',blank=True,null=True)
    tip_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tip_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    tip_type = models.CharField(max_length=20, choices=[('percentage','Percentage'), ('custom_amount','Custom Amount'), ('custom_percentage','Custom Percentage')], default='custom_amount', null=True, blank=True)
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

class Cart(models.Model):
    guest_session = models.ForeignKey('device.GuestSession', on_delete=models.CASCADE, related_name='carts')
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='carts')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart for {self.guest_session}"

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.quantity} x {self.item.item_name} in Cart {self.cart.id}"



