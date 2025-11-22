# serializers.py
from rest_framework import serializers
from accounts.models import User
from restaurant.models import Restaurant

class RestaurantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = ['resturent_name', 'location', 'phone_number', 'package', 'image', 'logo', 'owner']

class OwnerRegisterSerializer(serializers.ModelSerializer):
    # restaurant fields
    resturent_name = serializers.CharField(max_length=255)
    location = serializers.CharField(max_length=255)
    phone_number = serializers.CharField(max_length=15,required=False, allow_blank=True)
    package = serializers.CharField(max_length=100)
    image = serializers.ImageField(required=False)
    logo = serializers.ImageField(required=False)
    package = serializers.CharField(max_length=100, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'resturent_name', 'location', 'phone_number', 'package', 'image', 'logo']
        extra_kwargs = {'password': {'write_only': True}}
    

    def validate_phone_number(self, value):
        if Restaurant.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError("Phone number already exists. Use another number.")
        return value
        

    def create(self, validated_data):
        # Extract restaurant-related data
        rest_data = {
            'resturent_name': validated_data.pop('resturent_name'),
            'location': validated_data.pop('location'),
            'phone_number': validated_data.pop('phone_number'),
            # 'package': validated_data.pop('package'),
            'image': validated_data.pop('image', None),
            'logo': validated_data.pop('logo', None),
        }

        # Create user
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            role='owner',
        )

        # Create restaurant
        restaurant = Restaurant.objects.create(owner=user, **rest_data)

        # Attach created instances to serializer for response
        self.user = user
        self.restaurant = restaurant
        return user

    def to_representation(self, instance):
        user_data = {
            "username": instance.username,
            "email": instance.email,
            "owner_id":instance.id,
            "role":instance.role,
        }
        restaurant_data = RestaurantSerializer(self.restaurant).data
        return {**user_data, **restaurant_data}
