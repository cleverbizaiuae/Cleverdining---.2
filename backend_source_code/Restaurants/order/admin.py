from django.contrib import admin
from .models import Order, OrderItem

class OrderItemInline(admin.TabularInline):  # or use StackedInline
    model = OrderItem
    extra = 0  # No empty rows
    readonly_fields = ('item', 'quantity', 'price')
    can_delete = False

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'device', 'restaurant', 'status', 'total_price', 'created_time')
    list_filter = ('status', 'restaurant', 'created_time')
    search_fields = ('device__table_name', 'restaurant__resturent_name')
    readonly_fields = ('total_price', 'created_time', 'updated_time')
    inlines = [OrderItemInline]

@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('order', 'item', 'quantity', 'price')
    search_fields = ('order__id', 'item__item_name')
