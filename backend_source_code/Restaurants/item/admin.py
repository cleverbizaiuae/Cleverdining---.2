# admin.py

from django.contrib import admin
from .models import Item

@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('item_name', 'price', 'category', 'restaurant','created_time')  # Columns shown in the list view
    search_fields = ('item_name', 'category__Category_name', 'restaurant__resturent_name')
    list_filter = ('category', 'restaurant')
    prepopulated_fields = {'slug': ('item_name',)}
