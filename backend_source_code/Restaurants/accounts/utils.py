# import random
# from django.core.mail import send_mail
# from django.conf import settings

# def generate_otp():
#     return str(random.randint(1000, 9999))

# def send_otp(user):
#     otp_code = generate_otp()
#     # OTP.objects.create(user=user, code=otp_code)

#     send_mail(
#         subject="Your OTP Code",
#         message=f"Your OTP is {otp_code}",
#         from_email=settings.EMAIL_HOST_USER,
#         recipient_list=[user.email],
#     )

#     return otp_code


def get_restaurant_owner_id(user):
    """
    Safely get restaurant owner ID for any user type.
    Returns None if user has no restaurant relationships.
    """
    try:
        # Case 1: User is a restaurant owner
        if user.role == 'owner':
            try:
                owned_restaurants = user.restaurants.all()
                if owned_restaurants.exists():
                    first_restaurant = owned_restaurants.first()
                    if first_restaurant and hasattr(first_restaurant, 'owner') and first_restaurant.owner:
                        return first_restaurant.owner.id
            except Exception:
                pass

        # Case 2: User is staff
        try:
            staff_roles = user.staff_roles.all()
            if staff_roles.exists():
                first_staff = staff_roles.first()
                if first_staff and hasattr(first_staff, 'restaurant') and first_staff.restaurant:
                    if hasattr(first_staff.restaurant, 'owner') and first_staff.restaurant.owner:
                        return first_staff.restaurant.owner.id
        except Exception:
            pass

        # Case 3: User is device user
        try:
            devices = user.devices.all()
            if devices.exists():
                first_device = devices.first()
                if first_device and hasattr(first_device, 'restaurant') and first_device.restaurant:
                    if hasattr(first_device.restaurant, 'owner') and first_device.restaurant.owner:
                        return first_device.restaurant.owner.id
        except Exception:
            pass

    except Exception:
        pass

    return None
