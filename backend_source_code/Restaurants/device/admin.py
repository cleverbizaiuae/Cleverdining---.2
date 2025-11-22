from django.contrib import admin
from .models import Device,Reservation

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('table_name', 'action', 'restaurant', 'get_user_name')

    def get_user_name(self, obj):
        return obj.user.username
    get_user_name.short_description = 'User Name'



@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('customer_name', 'restaurant', 'device', 'guest_no', 'reservation_time', 'status', 'created_at')
    list_filter = ('status', 'restaurant', 'reservation_time')
    search_fields = ('customer_name', 'cell_number', 'email')
    ordering = ('-reservation_time',)
