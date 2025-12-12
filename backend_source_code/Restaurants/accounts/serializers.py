from rest_framework import serializers
from .models import User,ChefStaff
from restaurant.models import Restaurant
import secrets
from django.core.mail import send_mail
from django.conf import settings
from .utils import get_restaurant_owner_id

# jwt
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


# create register serialixers 

class RegisterSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required= True)
    password = serializers.CharField(write_only=True)
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['email','password','image']
    
    def create(self,validated_data):
        email = validated_data['email']
        password = validated_data['password']
        image = validated_data.get('image', None)
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            role='customer'
        )
        if image:
            user.image = image
            user.save()
        return user
    


class RestaurantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = ['id', 'resturent_name', 'location', 'phone_number', 'package', 'image']







class UserWithRestaurantSerializer(serializers.ModelSerializer):
    restaurants = serializers.SerializerMethodField()
    owner_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'image', 'restaurants','owner_id']


    def get_owner_id(self, obj):
        return get_restaurant_owner_id(obj)

    def get_restaurants(self, obj):
        def get_subscription_info(restaurant):
            # Try to get an active subscription
            active_subscription = restaurant.subscriptions.filter(is_active=True).order_by('-current_period_end').first()
            if active_subscription:
                return {
                    'package_name': active_subscription.package_name,
                    'current_period_end': active_subscription.current_period_end,
                    'status': active_subscription.status,
                }

            # Fallback to the latest subscription (inactive or expired)
            latest_subscription = restaurant.subscriptions.order_by('-current_period_end').first()
            if latest_subscription:
                return {
                    'package_name': latest_subscription.package_name,
                    'current_period_end': latest_subscription.current_period_end,
                    'status': latest_subscription.status,
                }

            # No subscription available
            return {
                'package_name': None,
                'current_period_end': None,
                'status': None,
            }

        # 1. Owned restaurants
        owned = obj.restaurants.all()
        owned_data = RestaurantSerializer(owned, many=True).data
        for r in owned_data:
            restaurant_obj = owned.get(id=r['id'])
            r['source'] = 'owner'
            r['table_name'] = None
            r['device_id'] = None
            r['subscription'] = get_subscription_info(restaurant_obj)

        # 2. Staff restaurants
        staff_links = obj.staff_roles.all()
        staff_restaurants = Restaurant.objects.filter(chefstaffs__in=staff_links)
        staff_data = RestaurantSerializer(staff_restaurants, many=True).data
        for r in staff_data:
            restaurant_obj = staff_restaurants.get(id=r['id'])
            r['source'] = 'staff'
            r['table_name'] = None
            r['device_id'] = None
            r['subscription'] = get_subscription_info(restaurant_obj)

        # 3. Device-linked restaurants
        device_links = obj.devices.select_related('restaurant').all()
        device_data = []
        for device in device_links:
            rest = device.restaurant
            if rest is None:  # Skip devices without restaurants
                continue
            rest_data = RestaurantSerializer(rest).data
            rest_data['source'] = 'device'
            rest_data['table_name'] = device.table_name
            rest_data['device_id'] = device.id
            rest_data['subscription'] = get_subscription_info(rest)
            device_data.append(rest_data)

        # Combine all and remove duplicates by restaurant ID
        all_data = owned_data + staff_data + device_data
        seen = set()
        unique_restaurants = []
        for r in all_data:
            if r['id'] not in seen:
                seen.add(r['id'])
                unique_restaurants.append(r)

        return unique_restaurants






class ChefStaffSerializer(serializers.Serializer):
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'resturent_name','action','generate']




class ChefStaffCreateSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(write_only=True)
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, required=False) # Add password field
    role = serializers.ChoiceField(choices=[('chef', 'Chef'), ('staff', 'Staff')], write_only=True)
    image = serializers.ImageField(write_only=True, required=False)

    class Meta:
        model = ChefStaff
        fields = ['email', 'username', 'password', 'role', 'action', 'generate','image']

    def create(self, validated_data):
        from django.db import transaction
        
        request = self.context.get('request')
        user = request.user

        # Get first restaurant safely
        restaurant = user.restaurants.first()
        if not restaurant:
             raise serializers.ValidationError("You do not own a restaurant.")

        email = validated_data.pop('email')
        username = validated_data.pop('username')
        role = validated_data.pop('role')
        image = validated_data.pop('image', None)
        password = validated_data.pop('password', None) # Get password if provided

        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError({"email": "A user with this email already exists."})

        # Use provided password or generate a secure random one
        if not password:
            password = secrets.token_urlsafe(10)

        with transaction.atomic():
            new_user = User.objects.create_user(
                email=email,
                username=username,
                password=password,
                role=role,
                image=image
            )

            staff_member = ChefStaff.objects.create(
                user=new_user,
                restaurant=restaurant,
                action='accepted',  # Force accepted status so they can access items immediately
                **{k: v for k, v in validated_data.items() if k != 'action'} # Avoid duplicate arg if action is in validated_data
            )

        # Send password to user via email (outside atomic block usually fine, or inside)
        # Verify email settings are correct or catch error so it doesn't rollback
        try:
            send_mail(
                subject='Your account has been created',
                message=f"Hello {username},\n\nYour account has been created.\nEmail: {email}\nPassword: {password}\n\nPlease login and change your password.",
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception as e:
            # Log error but don't fail the creation
            print(f"Failed to send email: {e}")

        return staff_member
    def to_representation(self, instance):
        return ChefStaffDetailSerializer(instance, context=self.context).data
    



class ChefStaffDetailSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email')
    username = serializers.CharField(source='user.username')
    role = serializers.CharField(source='user.role')
    restaurant = serializers.CharField(source='restaurant.resturent_name', read_only=True)
    image = serializers.ImageField(source='user.image', read_only=True)
    class Meta:
        model = ChefStaff
        fields = ['id', 'email', 'username', 'role', 'action', 'generate', 'created_at', 'updated_time','restaurant','image']

    def update(self, instance, validated_data):
        # update user fields
        user_data = validated_data.pop('user', {})
        if user_data:
            for attr, value in user_data.items():
                setattr(instance.user, attr, value)
            instance.user.save()

        # update chefstaff fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
    


class SendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        if not User.objects.filter(email=value).exists():
            raise serializers.ValidationError("User with this email does not exist.")
        return value
    

class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=4)



class ResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=4)
    confirm_password = serializers.CharField(write_only=True, min_length=4)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs
    


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'role']