# serializers.py
from rest_framework import serializers
from accounts.models import User
from restaurant.models import Restaurant

class RestaurantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = ['resturent_name', 'location', 'phone_number', 'package', 'image', 'logo', 'owner', 'google_review_url']

class OwnerRegisterSerializer(serializers.ModelSerializer):
    # Restaurant inputs
    resturent_name = serializers.CharField(max_length=255)
    location = serializers.CharField(max_length=255)
    city = serializers.CharField(max_length=100, required=False, default="Dubai")
    country = serializers.CharField(max_length=100, required=False, default="UAE")
    phone_number = serializers.CharField(max_length=20)
    
    # Manager/Owner inputs
    owner_name = serializers.CharField(max_length=150, required=False, help_text="Full name of the owner/manager")
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, required=False, help_text="Leave empty to auto-generate")
    
    # Subscription inputs
    package = serializers.CharField(max_length=100, required=False, default="Starter") # UI Display Name
    plan = serializers.ChoiceField(choices=[('standard', 'Standard'), ('pro', 'Pro'), ('enterprise', 'Enterprise')], required=False, default='standard')
    subscription_months = serializers.IntegerField(required=False, default=12, min_value=1, max_value=60)
    
    # Capacity inputs
    qr_codes = serializers.IntegerField(required=False, default=10, min_value=1)
    table_count = serializers.IntegerField(required=False, default=10, min_value=1)
    payment_processor = serializers.CharField(required=False, default="stripe")

    # Logo
    logo = serializers.ImageField(required=False)

    # WhatsApp inputs (Enterprise only usually, but allowed here)
    whatsapp_enabled = serializers.BooleanField(required=False, default=False)
    
    class Meta:
        model = User
        fields = [
            'owner_name', 'email', 'password', 
            'resturent_name', 'location', 'city', 'country', 'phone_number',
            'package', 'plan', 'subscription_months',
            'qr_codes', 'table_count', 'payment_processor',
            'whatsapp_enabled', 'logo'
        ]
    
    def validate_email(self, value):
        import re
        # Basic check, Django EmailField does most work but stricter regex can be good
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate_phone_number(self, value):
        import re
        # Strip spaces, dashes, and parentheses before validation
        cleaned = re.sub(r'[\s\-\(\)]+', '', value.strip())
        if not re.match(r'^\+?[0-9]{7,15}$', cleaned):
             raise serializers.ValidationError("Enter a valid phone number (e.g. +971501234567)")
        
        if Restaurant.objects.filter(phone_number=cleaned).exists():
             raise serializers.ValidationError("This phone number is already registered to another restaurant.")
        return cleaned

    def create(self, validated_data):
        from django.db import transaction
        from django.utils import timezone
        import uuid
        import logging
        from datetime import timedelta
        
        logger = logging.getLogger(__name__)

        # Extract fields
        owner_name = validated_data.get('owner_name', '')
        email = validated_data['email']
        password = validated_data.get('password')
        
        # Auto-generate password if missing
        if not password:
            password = User.objects.make_random_password(length=10)
        
        # Store raw password for response
        self._generated_password = password
        
        # Determine names
        first_name = ""
        last_name = ""
        if owner_name:
            parts = owner_name.split(' ', 1)
            first_name = parts[0]
            if len(parts) > 1:
                last_name = parts[1]
        
        # Username logic (email prefix + random)
        username = email.split('@')[0]
        username = ''.join(c for c in username if c.isalnum())
        username = f"{username}_{uuid.uuid4().hex[:4]}"

        try:
            with transaction.atomic():
                # 1. Create User
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    role='owner' 
                )
                
                # 2. Calculate Subscription
                months = validated_data.get('subscription_months', 12)
                sub_end = timezone.now() + timedelta(days=30*months)
                
                # 3. Create Restaurant
                restaurant = Restaurant.objects.create(
                    owner=user,
                    resturent_name=validated_data['resturent_name'],
                    location=validated_data['location'],
                    phone_number=validated_data['phone_number'],
                    package=validated_data.get('package', 'Starter'),
                    plan=validated_data.get('plan', 'standard'),
                    subscription_end=sub_end,
                    subscription_start=timezone.now(),
                    status='active',
                    whatsapp_enabled=validated_data.get('whatsapp_enabled', False),
                    qr_codes=validated_data.get('qr_codes', 10),
                    table_count=validated_data.get('table_count', 10),
                    logo=validated_data.get('logo'),
                    owner_password=password  # Store for Super Admin visibility
                )
                
                self.user = user
                self.restaurant = restaurant
                return user

        except Exception as e:
            logger.error(f"Registration failed: {str(e)}")
            raise serializers.ValidationError({"detail": f"Registration failed: {str(e)}"})

    def to_representation(self, instance):
        return {
            "message": "Restaurant registered successfully",
            "restaurant_id": getattr(self.restaurant, 'id', None) if hasattr(self, 'restaurant') else None,
            "credentials": {
                "email": instance.email,
                "password": getattr(self, '_generated_password', '******'),
                "username": instance.username
            }
        }
