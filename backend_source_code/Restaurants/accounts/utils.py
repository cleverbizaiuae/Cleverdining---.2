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
    # Case 1: User is a restaurant owner
    if user.role == 'owner':
        owned_restaurants = user.restaurants.all()
        if owned_restaurants.exists():
            return owned_restaurants.first().owner.id

    # Case 2: User is staff
    staff_roles = user.staff_roles.all()
    if staff_roles.exists():
        staff_restaurant = staff_roles.first().restaurant
        return staff_restaurant.owner.id

    # Case 3: User is device user
    devices = user.devices.all()
    if devices.exists():
        device_restaurant = devices.first().restaurant
        return device_restaurant.owner.id

    return None
