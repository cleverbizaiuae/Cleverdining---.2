from django.db import models
from device.models import Device
from restaurant.models import Restaurant
from item.models import Item
from .constants import STATUS,PAYMENT_STATUS 
from django.utils import timezone

class Order(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='orders')
    guest_session = models.ForeignKey('device.GuestSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='orders')
    business_day = models.ForeignKey('restaurant.BusinessDay', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    status = models.CharField(max_length=20,choices=STATUS,default='pending')
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    payment_status = models.CharField(max_length=50, choices=PAYMENT_STATUS, default='unpaid',blank=True,null=True)
    notes = models.TextField(blank=True, null=True)
    tip_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tip_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    tip_type = models.CharField(max_length=20, choices=[('percentage','Percentage'), ('custom_amount','Custom Amount'), ('custom_percentage','Custom Percentage')], default='custom_amount', null=True, blank=True)
    created_time = models.DateTimeField(auto_now_add=True)
    updated_time = models.DateTimeField(auto_now=True)

    
    class Meta:
        ordering = ['-created_time']
        indexes = [
            models.Index(fields=['restaurant', 'created_time']),
            models.Index(fields=['restaurant', 'status']),
            models.Index(fields=['guest_session']),
        ]
        
        
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


class UpsellSetting(models.Model):
    STRATEGY_CHOICES = [
        ("balanced", "Balanced"),
        ("highest_margin", "Highest Margin"),
        ("highest_conversion", "Highest Conversion"),
        ("premium_experience", "Premium Experience"),
        ("inventory_movement", "Inventory Movement"),
        # Legacy aliases kept for backward compatibility with existing stored values.
        ("margin", "Margin (Legacy)"),
        ("volume", "Volume (Legacy)"),
    ]
    AGGRESSIVENESS_CHOICES = [
        ("subtle", "Subtle"),
        ("moderate", "Moderate"),
        ("aggressive", "Aggressive"),
    ]
    TONE_CHOICES = [
        ("friendly", "Friendly"),
        ("premium", "Premium"),
        ("minimal", "Minimal"),
        ("luxury_casual", "Luxury Casual"),
        # Legacy aliases kept for backward compatibility with existing stored values.
        ("professional", "Professional (Legacy)"),
        ("playful", "Playful (Legacy)"),
    ]

    restaurant = models.OneToOneField(Restaurant, on_delete=models.CASCADE, related_name="upsell_setting")
    enabled = models.BooleanField(default=True)
    strategy = models.CharField(max_length=20, choices=STRATEGY_CHOICES, default="balanced")
    aggressiveness = models.CharField(max_length=20, choices=AGGRESSIVENESS_CHOICES, default="moderate")
    show_after_add_to_cart = models.BooleanField(default=True)
    show_in_cart = models.BooleanField(default=True)
    show_before_payment = models.BooleanField(default=True)
    tone = models.CharField(max_length=20, choices=TONE_CHOICES, default="friendly")
    # Stored as comma-separated category IDs for compatibility with existing admin payload conventions.
    prioritized_categories = models.TextField(blank=True, default="")
    # Optional explicit role mapping override: {"main":[1,2], "drinks":[3], "desserts":[4], "starters":[5]}
    category_role_map = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["restaurant"]),
            models.Index(fields=["enabled"]),
        ]

    def __str__(self):
        return f"Upsell settings - {self.restaurant.resturent_name}"


class UpsellRule(models.Model):
    RULE_TYPE_CHOICES = [
        ("pair", "Pair"),
        ("block", "Block"),
        ("global_block", "Global Block"),
    ]

    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="upsell_rules")
    type = models.CharField(max_length=20, choices=RULE_TYPE_CHOICES)
    source_item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="upsell_source_rules", null=True, blank=True)
    target_item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="upsell_target_rules")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["restaurant", "type", "is_active"]),
            models.Index(fields=["source_item", "target_item"]),
        ]
        unique_together = ("restaurant", "type", "source_item", "target_item")

    def __str__(self):
        return f"{self.restaurant.resturent_name} | {self.type}: {self.source_item_id} -> {self.target_item_id}"


class UpsellEvent(models.Model):
    ACTION_CHOICES = [
        ("shown", "Shown"),
        ("accepted", "Accepted"),
        ("dismissed", "Dismissed"),
        ("declined", "Declined"),
    ]
    TRIGGER_CHOICES = [
        ("add_to_cart", "Add To Cart"),
        ("cart", "Cart"),
        ("before_payment", "Before Payment"),
    ]

    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="upsell_events")
    guest_session = models.ForeignKey("device.GuestSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="upsell_events")
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True, related_name="upsell_events")
    session_id = models.CharField(max_length=120, db_index=True)
    table_number = models.CharField(max_length=50, blank=True, default="")
    trigger_point = models.CharField(max_length=30, choices=TRIGGER_CHOICES, db_index=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    upsell_item = models.ForeignKey(Item, on_delete=models.SET_NULL, null=True, blank=True, related_name="upsell_events")
    upsell_item_name = models.CharField(max_length=255, blank=True, default="")
    upsell_category = models.CharField(max_length=120, blank=True, default="")
    upsell_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cart_value_at_time = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cart_item_count = models.PositiveIntegerField(default=0)
    hour_of_day = models.PositiveSmallIntegerField(default=0, db_index=True)
    day_of_week = models.PositiveSmallIntegerField(default=0, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["restaurant", "created_at"]),
            models.Index(fields=["restaurant", "trigger_point", "action"]),
            models.Index(fields=["restaurant", "table_number", "created_at"]),
        ]

    def __str__(self):
        return f"{self.restaurant_id}:{self.trigger_point}:{self.action}:{self.upsell_item_id or 'na'}"


class UpsellItemSetting(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="upsell_item_settings")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="upsell_item_settings")
    enabled = models.BooleanField(default=True)
    # Used by "Inventory Movement" strategy.
    inventory_priority = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("restaurant", "item")
        indexes = [
            models.Index(fields=["restaurant", "enabled"]),
            models.Index(fields=["restaurant", "inventory_priority"]),
        ]

    def __str__(self):
        return f"{self.restaurant_id}:{self.item_id}:enabled={self.enabled}"


class ItemAssociation(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="item_associations")
    source_item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="upsell_association_sources")
    target_item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="upsell_association_targets")
    co_order_frequency = models.PositiveIntegerField(default=0)
    association_strength = models.DecimalField(max_digits=12, decimal_places=6, default=0)
    times_shown = models.PositiveIntegerField(default=0)
    times_accepted = models.PositiveIntegerField(default=0)
    times_dismissed = models.PositiveIntegerField(default=0)
    revenue_generated = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    last_computed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("restaurant", "source_item", "target_item")
        indexes = [
            models.Index(fields=["restaurant", "source_item"]),
            models.Index(fields=["restaurant", "target_item"]),
            models.Index(fields=["restaurant", "co_order_frequency"]),
            models.Index(fields=["restaurant", "association_strength"]),
        ]

    def __str__(self):
        return (
            f"{self.restaurant_id}:{self.source_item_id}->{self.target_item_id}"
            f" freq={self.co_order_frequency}"
        )
