from rest_framework import serializers
from .models import Device, Reservation


class DeviceSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source='restaurant.resturent_name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    class Meta:
        model = Device
        fields = ['id', 'table_name', 'region', 'table_number', 'restaurant', 'action','restaurant_name','username','user_id']
        read_only_fields =['username', 'restaurant_name','restaurant']




class ReservationSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source='device.table_name', read_only=True)

    class Meta:
        model = Reservation
        fields = ['id','email','customer_name','guest_no','cell_number','reservation_time','status','created_at','updated_at','device','device_name',  'restaurant',]




class ReservationStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = ['status']