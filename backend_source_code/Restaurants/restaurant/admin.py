from django.contrib import admin
from .models import Restaurant, BrandConfig
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


@admin.register(BrandConfig)
class BrandConfigAdmin(admin.ModelAdmin):
    list_display = (
        'restaurant',
        'branding_enabled',
        'primary_color',
        'theme_preset',
        'updated_at',
    )
    search_fields = ('restaurant__resturent_name', 'restaurant_name')
