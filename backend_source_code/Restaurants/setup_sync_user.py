import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')
django.setup()

from accounts.models import User
from restaurant.models import Restaurant
from device.models import Device
from category.models import Category
from item.models import Item
from django.core.files.base import ContentFile

def setup_sync_user():
    print("Setting up Sync User environment...")

    # 1. Create Owner User
    owner_email = "sync_owner@cleverbiz.demo"
    owner, created = User.objects.get_or_create(email=owner_email, defaults={
        'username': 'sync_owner',
        'role': 'owner'
    })
    if created:
        owner.set_password("password123")
        owner.save()
        print(f"Created Owner: {owner_email}")
    else:
        print(f"Owner exists: {owner_email}")

    # 2. Create Restaurant
    restaurant, created = Restaurant.objects.get_or_create(owner=owner, defaults={
        'resturent_name': "Sync Kitchen",
        'location': "123 Sync St",
        'phone_number': "555-0199"
    })
    if created:
        print(f"Created Restaurant: {restaurant.resturent_name}")
    else:
        print(f"Restaurant exists: {restaurant.resturent_name}")

    # 4. Create Customer User
    customer_email = "sync_customer@cleverbiz.demo"
    customer, created = User.objects.get_or_create(email=customer_email, defaults={
        'username': 'sync_customer',
        'role': 'customer'
    })
    if created:
        customer.set_password("password123")
        customer.save()
        print(f"Created Customer: {customer_email}")
    else:
        print(f"Customer exists: {customer_email}")

    # 3. Create Device (Linked to Customer for Order API to work)
    device_name = "TBL-SYNC"
    # We need to check if device exists, if so update user, else create
    device, created = Device.objects.get_or_create(restaurant=restaurant, table_name=device_name, defaults={
        'table_number': '99',
        'user': customer # Link to customer initially
    })
    if created:
        print(f"Created Device: {device_name} linked to {customer.email}")
    else:
        device.user = customer
        device.save()
        print(f"Device exists: {device_name}, updated link to {customer.email}")

    # 5. Link Customer to Device (Many-to-Many if exists, but here it's FK on Device)
    # The FK is already set above.
    # customer.devices.add(device) # This would fail if 'devices' is related_name for FK
    
    # Verify linkage
    if customer.devices.first() == device:
         print(f"Verified: Customer {customer_email} is linked to Device {device_name}")
    else:
         print(f"WARNING: Customer {customer_email} is NOT linked to Device {device_name}")

    # 6. Add Categories and Items
    cat_name = "Sync Specials"
    category, created = Category.objects.get_or_create(restaurant=restaurant, Category_name=cat_name, defaults={
        'slug': 'sync-specials'
    })
    
    item_name = "Sync Burger"
    item, created = Item.objects.get_or_create(restaurant=restaurant, item_name=item_name, defaults={
        'price': 15.99,
        'description': "A perfectly synchronized burger.",
        'category': category,
        'slug': 'sync-burger',
        'availability': True
    })
    print(f"Ensured Item: {item_name} in Category: {cat_name}")

    print("\nSetup Complete!")
    print(f"Dashboard Login: {owner_email} / password123")
    print(f"Mobile Login: {customer_email} / password123")

if __name__ == "__main__":
    setup_sync_user()
