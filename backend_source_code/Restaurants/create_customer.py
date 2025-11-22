"""
Create customer and device for mobile app access
"""

from accounts.models import User
from restaurant.models import Restaurant  
from device.models import Device

print("=== Creating Customer for Mobile App ===")

# Get restaurant
restaurant = Restaurant.objects.get(resturent_name="CleverBIZ Demo Restaurant")
print(f"Restaurant: {restaurant.resturent_name}")

# Get owner (needed for device)
owner = User.objects.get(email="owner@cleverbiz.demo")

# Create device/table first with owner as temporary user
device, created = Device.objects.get_or_create(
    table_name="TBL-01",
    restaurant=restaurant,
    defaults={
        "user": owner,  # temporary
        "action": "active"
    }
)
print(f"✓ Device: {device.table_name}")

# Create customer user
customer, created = User.objects.get_or_create(
    email="table01@cleverbiz.demo",
    defaults={
        "username": "Table 01",
        "role": "customer"
    }
)
if created or not customer.check_password("password123"):
    customer.set_password("password123")
    customer.save()
print(f"✓ Customer: {customer.email}")

# Update device to use customer
device.user = customer
device.save()

print("\n=== Mobile App Login ===")
print("Email: table01@cleverbiz.demo")
print("Password: password123")
print("(Enter email in 'Table No.' field)")
