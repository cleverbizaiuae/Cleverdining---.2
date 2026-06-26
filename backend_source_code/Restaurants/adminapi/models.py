import uuid

from django.db import models


class Integration(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    class Category(models.TextChoices):
        DATABASE = "Database", "Database"
        MESSAGING = "Messaging", "Messaging"
        PAYMENTS = "Payments", "Payments"
        INFRASTRUCTURE = "Infrastructure", "Infrastructure"
        AI = "AI", "AI"
        ANALYTICS = "Analytics", "Analytics"
        OTHER = "Other", "Other"

    class Currency(models.TextChoices):
        USD = "USD", "USD"
        AED = "AED", "AED"
        GBP = "GBP", "GBP"
        EUR = "EUR", "EUR"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    logo_url = models.TextField(blank=True, default="")
    category = models.CharField(max_length=40, choices=Category.choices, default=Category.OTHER)
    monthly_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, choices=Currency.choices, default=Currency.USD)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
