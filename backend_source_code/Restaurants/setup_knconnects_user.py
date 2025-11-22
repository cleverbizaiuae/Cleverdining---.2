import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')
django.setup()

from accounts.models import User
from device.models import Device
from restaurant.models import Restaurant

def setup_user():
    email = "knconnects@gmail.com"
    password = "abcd1234"
    table_number = "TBL-10"
    restaurant_name = "The Gourmet Kitchen"

    print(f"Setting up user {email}...")

    # 1. Get or Create User
    try:
        user = User.objects.get(email=email)
        print(f"✓ User found: {user.username}")
    except User.DoesNotExist:
        print("! User not found, creating...")
        user = User.objects.create_user(
            username="knconnects",
            email=email,
            password=password,
            role='customer'
        )
        print("✓ User created")

    # Ensure password is correct
    user.set_password(password)
    user.save()
    print("✓ Password set to: abcd1234")

    # 2. Get Restaurant
    try:
        restaurant = Restaurant.objects.get(resturent_name=restaurant_name)
        print(f"✓ Restaurant found: {restaurant.resturent_name}")
    except Restaurant.DoesNotExist:
        print(f"❌ Restaurant '{restaurant_name}' not found! Please seed menu first.")
        return

    # 3. Create or Update Device
    device, created = Device.objects.get_or_create(
        user=user,
        defaults={
            'restaurant': restaurant,
            'table_name': 'Table 10',
            'table_number': table_number,
            'action': 'active'
        }
    )

    if not created:
        device.restaurant = restaurant
        device.table_name = 'Table 10'
        device.table_number = table_number
        device.action = 'active'
        device.save()
        print("✓ Device updated")
    else:
        print("✓ Device created")

    print("\n-----------------------------------")
    print(f"User: {email}")
    print(f"Password: {password}")
    print(f"Table Number: {table_number}")
    print(f"Restaurant: {restaurant.resturent_name}")
    print("-----------------------------------")

if __name__ == "__main__":
    setup_user()
