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
    device_name = serializers.CharField(source='device.table_name', read_only=True)

    class Meta:
        model = Reservation
        fields = ['id','email','customer_name','guest_no','cell_number','reservation_time','status','created_at','updated_at','device','device_name',  'restaurant',]




class ReservationStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = ['status']