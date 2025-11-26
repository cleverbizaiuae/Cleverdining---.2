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
    
    def validate(self, attrs):
        """Validate all required fields are present"""
        errors = {}
        
        # Check required fields
        if not attrs.get('username'):
            errors['username'] = ['Username is required.']
        if not attrs.get('email'):
            errors['email'] = ['Email is required.']
        if not attrs.get('password'):
            errors['password'] = ['Password is required.']
        if not attrs.get('resturent_name'):
            errors['resturent_name'] = ['Restaurant name is required.']
        if not attrs.get('location'):
            errors['location'] = ['Location is required.']
        
        if errors:
            raise serializers.ValidationError(errors)
        
        return attrs

    def validate_phone_number(self, value):
        # Handle None, empty, or whitespace-only phone numbers
        if value is None:
            value = ""
        if isinstance(value, str):
            value = value.strip()
        
        if not value or value == "":
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
        except serializers.ValidationError:
            # Re-raise validation errors as-is
            raise
        except Exception as e:
            logger.error(f"Error creating user/restaurant: {str(e)}", exc_info=True)
            # Provide a user-friendly error message
            error_msg = str(e)
            if "UNIQUE constraint" in error_msg or "duplicate key" in error_msg.lower():
                if "email" in error_msg.lower():
                    raise serializers.ValidationError({"email": ["A user with this email already exists."]})
                elif "phone_number" in error_msg.lower():
                    raise serializers.ValidationError({"phone_number": ["This phone number is already registered."]})
            raise serializers.ValidationError({"non_field_errors": [f"Registration failed: {error_msg}"]})

    def to_representation(self, instance):
        user_data = {
            "username": instance.username,
            "email": instance.email,
            "owner_id": instance.id,
            "role": instance.role,
        }
        # Safely get restaurant data if it exists
        if hasattr(self, 'restaurant') and self.restaurant:
            try:
                restaurant_data = RestaurantSerializer(self.restaurant).data
                return {**user_data, **restaurant_data}
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error serializing restaurant: {str(e)}", exc_info=True)
                # Return user data only if restaurant serialization fails
                return {**user_data, "restaurant": None}
        else:
            # Restaurant not created yet, return user data only
            return user_data
