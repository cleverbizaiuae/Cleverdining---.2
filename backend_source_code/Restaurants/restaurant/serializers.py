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
    phone_number = serializers.CharField(max_length=15, required=False, allow_blank=True)
    package = serializers.CharField(max_length=100, required=False, allow_blank=True, default="Basic")
    image = serializers.ImageField(required=False)
    logo = serializers.ImageField(required=False)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'resturent_name', 'location', 'phone_number', 'package', 'image', 'logo']
        extra_kwargs = {'password': {'write_only': True}}
    

    def validate_phone_number(self, value):
        # Handle empty phone numbers by generating a unique placeholder
        if not value or value.strip() == "":
            import uuid
            # Generate a unique placeholder phone number
            placeholder = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"
            # Ensure it's truly unique
            while Restaurant.objects.filter(phone_number=placeholder).exists():
                placeholder = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"
            return placeholder
        # Check uniqueness for non-empty phone numbers
        if Restaurant.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError("Phone number already exists. Use another number.")
        return value
        

    def create(self, validated_data):
        from django.db import transaction
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Use transaction to ensure both user and restaurant are created together
        # If restaurant creation fails, user creation is rolled back
        try:
            with transaction.atomic():
                # Extract restaurant-related data
                rest_data = {
                    'resturent_name': validated_data.pop('resturent_name'),
                    'location': validated_data.pop('location'),
                    'phone_number': validated_data.pop('phone_number', ''),
                    'package': validated_data.pop('package', 'Basic'),
                    'image': validated_data.pop('image', None),
                    'logo': validated_data.pop('logo', None),
                }
                
                # Ensure phone_number is not empty (should be handled by validation, but double-check)
                if not rest_data.get('phone_number') or rest_data['phone_number'].strip() == '':
                    import uuid
                    rest_data['phone_number'] = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"

                # Create user (saves to database)
                user = User.objects.create_user(
                    username=validated_data['username'],
                    email=validated_data['email'],
                    password=validated_data['password'],
                    role='owner',
                )

                # Create restaurant (saves to database)
                restaurant = Restaurant.objects.create(owner=user, **rest_data)

                # Attach created instances to serializer for response
                self.user = user
                self.restaurant = restaurant
                return user
        except Exception as e:
            logger.error(f"Error creating user/restaurant: {str(e)}", exc_info=True)
            raise serializers.ValidationError(f"Registration failed: {str(e)}")

    def to_representation(self, instance):
        user_data = {
            "username": instance.username,
            "email": instance.email,
            "owner_id":instance.id,
            "role":instance.role,
        }
        restaurant_data = RestaurantSerializer(self.restaurant).data
        return {**user_data, **restaurant_data}
