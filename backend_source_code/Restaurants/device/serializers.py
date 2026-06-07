from rest_framework import serializers
from .models import Device, Reservation


class DeviceSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.SerializerMethodField()
    username = serializers.CharField(source='user.username', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    restaurant_id = serializers.IntegerField(source='restaurant.id', read_only=True)
    active_session_id = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    last_message_time = serializers.DateTimeField(read_only=True)
    qr_code_image = serializers.SerializerMethodField()

    class Meta:
        model = Device
        fields = ['id', 'table_name', 'region', 'table_number', 'restaurant', 'restaurant_id', 'action','restaurant_name','username','user_id', 'qr_code_image', 'table_url', 'active_session_id', 'unread_count', 'last_message_time']
        read_only_fields =['username', 'restaurant_name','restaurant']

    def get_restaurant_name(self, obj):
        try:
             # Safety check if restaurant exists
             if hasattr(obj, 'restaurant') and obj.restaurant:
                 return obj.restaurant.resturent_name
        except Exception:
            pass
        return None

    def get_qr_code_image(self, obj):
        try:
            if obj.qr_code_image:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.qr_code_image.url)
                return obj.qr_code_image.url
        except Exception:
            pass
        return None

    def get_active_session_id(self, obj):
        try:
            # Use cached data if available (from prefetch_related)
            if hasattr(obj, 'active_sessions_cache'):
                active_sessions = obj.active_sessions_cache
                return active_sessions[0].id if active_sessions else None
            # Fallback to query
            session = obj.guest_sessions.filter(is_active=True).first()
            return session.id if session else None
        except Exception:
            return None

    def get_unread_count(self, obj):
        try:
            # Use cached annotation if available
            if hasattr(obj, 'unread_count_cached'):
                return obj.unread_count_cached
            # Fallback to query
            if hasattr(obj, 'messages'):
                return obj.messages.filter(is_read=False, is_from_device=True).count()
        except Exception:
            pass
        return 0




class ReservationSerializer(serializers.ModelSerializer):
    device_name = serializers.SerializerMethodField()
    tableName = serializers.CharField(source='table_name', read_only=True)
    tableId = serializers.IntegerField(source='device_id', read_only=True)
    guestCount = serializers.IntegerField(source='guest_no', read_only=True)
    customerName = serializers.CharField(source='customer_name', read_only=True)
    phone = serializers.CharField(source='cell_number', read_only=True)
    reservationTime = serializers.DateTimeField(source='reservation_time', read_only=True)
    endTime = serializers.DateTimeField(source='end_time', read_only=True)
    durationMinutes = serializers.IntegerField(source='duration_minutes', read_only=True)
    bufferMinutes = serializers.IntegerField(source='buffer_minutes', read_only=True)
    customRequest = serializers.CharField(source='custom_request', read_only=True)
    actualSeatedTime = serializers.DateTimeField(source='actual_seated_time', read_only=True)
    actualEndTime = serializers.DateTimeField(source='actual_end_time', read_only=True)
    extensionMinutes = serializers.IntegerField(source='extension_minutes', read_only=True)

    def get_device_name(self, obj):
        if getattr(obj, 'device', None):
            return obj.device.table_name
        return obj.table_name or None

    class Meta:
        model = Reservation
        fields = [
            'id','email','customer_name','customerName','guest_no','guestCount','cell_number','phone',
            'reservation_time','reservationTime','end_time','endTime','duration_minutes','durationMinutes',
            'buffer_minutes','bufferMinutes','status','source','custom_request','customRequest',
            'table_name','tableName','table_capacity','actual_seated_time','actualSeatedTime',
            'actual_end_time','actualEndTime','extension_minutes','extensionMinutes','updated_by_staff_id',
            'status_reason','whatsapp_phone_number_id','whatsapp_chat_id','whatsapp_message_id',
            'raw_customer_text','ai_confidence','missing_fields','created_at','updated_at','device',
            'device_name','tableId','restaurant',
        ]




class ReservationStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = ['status', 'status_reason']
