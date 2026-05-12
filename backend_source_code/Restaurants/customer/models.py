import uuid

from django.db import models


class Customer(models.Model):
    TIER_CHOICES = [
        ("bronze", "Bronze"),
        ("silver", "Silver"),
        ("gold", "Gold"),
        ("platinum", "Platinum"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.TextField(unique=True)
    name = models.TextField()
    email = models.TextField(null=True, blank=True)
    restaurant = models.ForeignKey(
        "restaurant.Restaurant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_customers",
    )
    loyalty_points = models.IntegerField(default=0)
    lifetime_points = models.IntegerField(default=0)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_orders = models.PositiveIntegerField(default=0)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, default="bronze")
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "customers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["restaurant", "created_at"]),
            models.Index(fields=["tier"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class CustomerRestaurantLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="restaurant_links",
    )
    restaurant = models.ForeignKey(
        "restaurant.Restaurant",
        on_delete=models.CASCADE,
        related_name="customer_links",
    )
    restaurant_name = models.TextField(null=True, blank=True)
    visit_count = models.PositiveIntegerField(default=1)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    first_visit = models.DateTimeField(auto_now_add=True)
    last_visit = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "customer_restaurant_links"
        unique_together = ("customer", "restaurant")
        indexes = [
            models.Index(fields=["restaurant", "last_visit"]),
            models.Index(fields=["customer", "last_visit"]),
        ]

    def __str__(self):
        return f"{self.customer_id}:{self.restaurant_id}"


class LoyaltyTransaction(models.Model):
    TYPE_CHOICES = [
        ("earn_order", "Earn Order"),
        ("earn_game", "Earn Game"),
        ("redeem", "Redeem"),
        ("bonus", "Bonus"),
        ("expire", "Expire"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="loyalty_transactions",
    )
    restaurant = models.ForeignKey(
        "restaurant.Restaurant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loyalty_transactions",
    )
    restaurant_name = models.TextField(null=True, blank=True)
    order = models.ForeignKey(
        "order.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loyalty_transactions",
    )
    points = models.IntegerField()
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "loyalty_transactions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "created_at"]),
            models.Index(fields=["restaurant", "created_at"]),
        ]

    def __str__(self):
        return f"{self.customer_id}:{self.type}:{self.points}"


class GameScore(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player_name = models.TextField()
    phone = models.TextField(null=True, blank=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_scores",
    )
    game_type = models.TextField(default="snake")
    score = models.IntegerField(default=0)
    restaurant = models.ForeignKey(
        "restaurant.Restaurant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_scores",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "game_scores"
        ordering = ["-score", "-created_at"]
        indexes = [
            models.Index(fields=["game_type", "score"]),
            models.Index(fields=["phone"]),
            models.Index(fields=["restaurant", "created_at"]),
        ]

    def __str__(self):
        return f"{self.player_name}:{self.game_type}:{self.score}"
