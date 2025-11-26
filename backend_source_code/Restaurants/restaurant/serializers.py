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
        """Validate all required fields and check uniqueness BEFORE database operations"""
        errors = {}
        
        # Check required fields - handle None and empty strings
        username = attrs.get('username')
        if not username or (isinstance(username, str) and not username.strip()):
            errors['username'] = ['Username is required.']
        
        email = attrs.get('email')
        if not email or (isinstance(email, str) and not email.strip()):
            errors['email'] = ['Email is required.']
        elif email and isinstance(email, str):
            # Normalize email
            email = email.strip().lower()
            attrs['email'] = email
            # CHECK EMAIL UNIQUENESS BEFORE CREATING USER
            try:
                if User.objects.filter(email=email).exists():
                    errors['email'] = ['A user with this email already exists.']
            except Exception as db_error:
                # If database query fails, log but don't block (will fail on create anyway)
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error checking email uniqueness: {str(db_error)}")
                # Continue - will be caught during create
        
        password = attrs.get('password')
        if not password:
            errors['password'] = ['Password is required.']
        elif isinstance(password, str) and len(password) < 6:
            errors['password'] = ['Password must be at least 6 characters.']
        
        resturent_name = attrs.get('resturent_name')
        if not resturent_name or (isinstance(resturent_name, str) and not resturent_name.strip()):
            errors['resturent_name'] = ['Restaurant name is required.']
        elif resturent_name and isinstance(resturent_name, str):
            attrs['resturent_name'] = resturent_name.strip()
        
        location = attrs.get('location')
        if not location or (isinstance(location, str) and not location.strip()):
            errors['location'] = ['Location is required.']
        elif location and isinstance(location, str):
            attrs['location'] = location.strip()
        
        # Normalize username
        if username and isinstance(username, str):
            attrs['username'] = username.strip()
        
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
        from django.db import transaction, IntegrityError, DatabaseError, OperationalError
        import logging
        import uuid
        
        logger = logging.getLogger(__name__)
        
        # Use transaction to ensure both user and restaurant are created together
        try:
            with transaction.atomic():
                # Extract restaurant-related data
                rest_name = validated_data.pop('resturent_name', '').strip()
                location = validated_data.pop('location', '').strip()
                phone_num = validated_data.pop('phone_number', '').strip() if validated_data.get('phone_number') else ''
                package = validated_data.pop('package', 'Basic')
                image = validated_data.pop('image', None)
                logo = validated_data.pop('logo', None)
                
                # Generate placeholder phone if empty
                if not phone_num:
                    phone_num = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"
                    # Ensure uniqueness
                    max_attempts = 10
                    attempts = 0
                    while Restaurant.objects.filter(phone_number=phone_num).exists() and attempts < max_attempts:
                        phone_num = f"PLACEHOLDER_{uuid.uuid4().hex[:12]}"
                        attempts += 1
                    if attempts >= max_attempts:
                        raise serializers.ValidationError({"phone_number": ["Could not generate unique phone number. Please try again."]})
                
                # Double-check phone uniqueness (race condition protection)
                if Restaurant.objects.filter(phone_number=phone_num).exists():
                    raise serializers.ValidationError({"phone_number": ["This phone number is already registered."]})
                
                # Create user first
                username = validated_data['username'].strip()
                email = validated_data['email'].strip().lower()
                password = validated_data['password']
                
                # Double-check email uniqueness (race condition protection)
                if User.objects.filter(email=email).exists():
                    raise serializers.ValidationError({"email": ["A user with this email already exists."]})
                
                try:
                    user = User.objects.create_user(
                        username=username,
                        email=email,
                        password=password,
                        role='owner',
                    )
                    logger.info(f"User created: {user.email}")
                except IntegrityError as e:
                    error_str = str(e).lower()
                    if "email" in error_str or "unique" in error_str:
                        raise serializers.ValidationError({"email": ["A user with this email already exists."]})
                    raise serializers.ValidationError({"detail": ["Failed to create user. Please try again."]})
                except Exception as e:
                    logger.error(f"Error creating user: {str(e)}", exc_info=True)
                    raise serializers.ValidationError({"detail": ["Failed to create user account. Please try again."]})

                # Create restaurant
                try:
                    restaurant = Restaurant.objects.create(
                        owner=user,
                        resturent_name=rest_name,
                        location=location,
                        phone_number=phone_num,
                        package=package,
                        image=image,
                        logo=logo,
                    )
                    logger.info(f"Restaurant created: {restaurant.resturent_name}")
                except IntegrityError as e:
                    error_str = str(e).lower()
                    if "phone" in error_str or "unique" in error_str:
                        # Rollback user creation
                        user.delete()
                        raise serializers.ValidationError({"phone_number": ["This phone number is already registered."]})
                    raise serializers.ValidationError({"detail": ["Failed to create restaurant. Please try again."]})
                except Exception as e:
                    logger.error(f"Error creating restaurant: {str(e)}", exc_info=True)
                    # Rollback user creation
                    try:
                        user.delete()
                    except:
                        pass
                    raise serializers.ValidationError({"detail": ["Failed to create restaurant. Please try again."]})

                # Store for response
                self.user = user
                self.restaurant = restaurant
                return user
                
        except serializers.ValidationError:
            # Re-raise validation errors as-is
            raise
        except (IntegrityError, DatabaseError, OperationalError) as db_error:
            logger.error(f"Database error during registration: {str(db_error)}", exc_info=True)
            error_str = str(db_error).lower()
            if "email" in error_str or ("unique" in error_str and "email" in error_str):
                raise serializers.ValidationError({"email": ["A user with this email already exists."]})
            elif "phone" in error_str or ("unique" in error_str and "phone" in error_str):
                raise serializers.ValidationError({"phone_number": ["This phone number is already registered."]})
            raise serializers.ValidationError({"detail": ["Database error. Please try again."]})
        except Exception as e:
            logger.error(f"Unexpected registration error: {str(e)}", exc_info=True)
            error_str = str(e).lower()
            if "unique" in error_str or "duplicate" in error_str:
                if "email" in error_str:
                    raise serializers.ValidationError({"email": ["This email is already registered."]})
                elif "phone" in error_str:
                    raise serializers.ValidationError({"phone_number": ["This phone number is already registered."]})
            raise serializers.ValidationError({"detail": ["Registration failed. Please try again."]})

    def to_representation(self, instance):
        """Return simple, safe response"""
        try:
            user_data = {
                "username": getattr(instance, 'username', ''),
                "email": getattr(instance, 'email', ''),
                "owner_id": getattr(instance, 'id', None),
                "role": getattr(instance, 'role', 'owner'),
            }
            
            # Add restaurant data if available
            if hasattr(self, 'restaurant') and self.restaurant:
                try:
                    user_data.update({
                        "resturent_name": getattr(self.restaurant, 'resturent_name', ''),
                        "location": getattr(self.restaurant, 'location', ''),
                        "phone_number": getattr(self.restaurant, 'phone_number', ''),
                        "package": getattr(self.restaurant, 'package', 'Basic'),
                    })
                except:
                    pass  # If restaurant data fails, just return user data
            
            return user_data
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in to_representation: {str(e)}", exc_info=True)
            # Return minimal safe response
            return {
                "username": getattr(instance, 'username', ''),
                "email": getattr(instance, 'email', ''),
                "owner_id": getattr(instance, 'id', None),
                "role": "owner",
            }
