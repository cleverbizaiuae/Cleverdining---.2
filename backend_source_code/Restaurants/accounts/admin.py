from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User,ChefStaff,PasswordResetOTP
from restaurant.models import Restaurant

@admin.register(User)
class CustomUserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'role', 'is_staff']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Extra Info', {'fields': ('role',)}),
    )



@admin.register(ChefStaff)
class ChefStaffAdmin(admin.ModelAdmin):
    list_display = ('id', 'get_restaurant_name', 'get_user_email', 'action', 'created_at')

    def get_restaurant_name(self, obj):
        return obj.restaurant.resturent_name  # Corrected attribute name
    get_restaurant_name.short_description = 'Restaurant Name'

    def get_user_email(self, obj):
        return obj.user.email
    get_user_email.short_description = 'User Email'



admin.site.register(PasswordResetOTP)

    
