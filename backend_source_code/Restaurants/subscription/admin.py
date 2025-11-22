from django.contrib import admin
from .models import Subscription,StripeEventLog
# Register your models here.
@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('id','restaurant','package_name','status','start_date','current_period_end','end_date','cancel_at_period_end','is_active','created_at','updated_at',)
    list_filter = ('status', 'is_active', 'cancel_at_period_end', 'package_name')
    search_fields = ('restaurant__name', 'stripe_customer_id', 'stripe_subscription_id', 'package_name')




@admin.register(StripeEventLog)
class StripeEventLogAdmin(admin.ModelAdmin):
    list_display = ('event_id', 'event_type', 'received_at')
    search_fields = ('event_id', 'event_type')
    list_filter = ('event_type', 'received_at')
    ordering = ('-received_at',)