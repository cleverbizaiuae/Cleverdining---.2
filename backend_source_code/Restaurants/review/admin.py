from django.contrib import admin
from .models import Review

@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'device', 'guest_no', 'name', 'rating', 'created_time')
    search_fields = ('name', 'order__id', 'device__table_name')
    list_filter = ('rating', 'created_time')
