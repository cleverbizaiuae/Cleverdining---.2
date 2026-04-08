from django.contrib import admin
from .models import Restaurant
# Register your models here.

@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = (
        'resturent_name',
        'region',
        'currency',
        'timezone',
        'location',
        'phone_number',
        'package',
        'image',
        'owner',
    )
