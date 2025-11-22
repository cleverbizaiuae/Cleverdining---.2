"""
Seed data script for CleverBiz demo restaurant.
Creates restaurant, users, categories, and items matching the screenshots.
"""

from accounts.models import User
from restaurant.models import Restaurant
from device.models import Device
from category.models import Category
from item.models import Item

# Create Owner User FIRST
owner, _ = User.objects.get_or_create(
    email="owner@cleverbiz.demo",
    defaults={
        "username": "Owner",
        "role": "owner"
    }
)
owner.set_password("password123")
owner.save()
print(f"Owner: {owner.email}")

# Create Restaurant with owner
restaurant, _ = Restaurant.objects.get_or_create(
    resturent_name="CleverBIZ Demo Restaurant",
    owner_id=owner.id,
    defaults={
        "location": "Demo City",
        "phone_number": "+15550000001",
        "package": "Pro"
    }
)
print(f"Restaurant: {restaurant.resturent_name}")

# Update owner's restaurant
owner.restaurants_id = restaurant.id
owner.save()

# Create Device/Table (before creating full customer)
device, _ = Device.objects.get_or_create(
    table_name="TBL-01",
    restaurant=restaurant,
    defaults={
        "user": owner,  # temporarily assign owner, will update later
        "action": "active"
    }
)
print(f"Device: {device.table_name}")

# Create Customer User
customer, _ = User.objects.get_or_create(
    email="table01@cleverbiz.demo",
    defaults={
        "username": "Table 01",
        "role": "customer",
        "restaurants_id": restaurant.id,
        "device_id": device.id
    }
)
customer.set_password("password123")
customer.save()
print(f"Customer: {customer.email}")

# Update device's user to customer
device.user = customer
device.save()

# Create Staff User
staff, _ = User.objects.get_or_create(
    email="staff@cleverbiz.demo",
    defaults={
        "username": "Staff",
        "role": "staff",
        "restaurants_id": restaurant.id,
        "owner_id": owner.id
    }
)
staff.set_password("password123")
staff.save()
print(f"Staff: {staff.email}")

# Create Chef User
chef, _ = User.objects.get_or_create(
    email="chef@cleverbiz.demo",
    defaults={
        "username": "Chef",
        "role": "chef",
        "restaurants_id": restaurant.id,
        "owner_id": owner.id
    }
)
chef.set_password("password123")
chef.save()
print(f"Chef: {chef.email}")

# Create Admin User (shorter username)
admin, _ = User.objects.get_or_create(
    email="admin@cb.demo",
    defaults={
        "username": "admin",
        "role": "super_admin",
        "is_staff": True,
        "is_superuser": True
    }
)
admin.set_password("password123")
admin.save()
print(f"Admin: {admin.email}")

# Create Categories
categories_data = [
    {"Category_name": "Light Bites", "description": "Light appetizers and small plates"},
    {"Category_name": "Seafood Mains", "description": "Fresh seafood dishes"},
    {"Category_name": "Champagne", "description": "Premium champagne selection"},
    {"Category_name": "To Start With", "description": "Perfect starters for your meal"},
    {"Category_name": "Steaks", "description": "Premium cuts of steak"},
    {"Category_name": "Land Mains", "description": "Hearty main courses"},
    {"Category_name": "Salad", "description": "Fresh salads and greens"},
    {"Category_name": "Raw", "description": "Raw and sashimi selections"},
]

categories = {}
for cat_data in categories_data:
    category, _ = Category.objects.get_or_create(
        Category_name=cat_data["Category_name"],
        restaurant=restaurant,
        defaults={
            "description": cat_data["description"]
        }
    )
    categories[cat_data["Category_name"]] = category
    print(f"Category: {category.Category_name}")

# Create Items (matching screenshot)
items_data = [
    {"name": "SALTED EDAMAME", "price": "35.00", "desc": "Lightly salted edamame beans", "category": "Light Bites"},
    {"name": "CHICKEN WINGS (6 PCS)", "price": "82.00", "desc": "Crispy chicken wings with signature sauce", "category": "Light Bites"},
    {"name": "POTATO STICK", "price": "62.00", "desc": "Crispy potato sticks with dipping sauce", "category": "Light Bites"},
    {"name": "CAVIAR PANCAKE", "price": "88.00", "desc": "Light pancake topped with caviar", "category": "Light Bites"},
    
    {"name": "SALMON SASHIMI", "price": "95.00", "desc": "Fresh salmon sashimi", "category": "Raw"},
    {"name": "TUNA TARTARE", "price": "120.00", "desc": "Finely chopped tuna with avocado", "category": "Raw"},
    
    {"name": "CAESAR SALAD", "price": "75.00", "desc": "Classic caesar with parmesan", "category": "Salad"},
    {"name": "GREEK SALAD", "price": "70.00", "desc": "Fresh Mediterranean salad", "category": "Salad"},
    
    {"name": "GRILLED SALMON", "price": "185.00", "desc": "Norwegian salmon with vegetables", "category": "Seafood Mains"},
    {"name": "SEAFOOD PLATTER", "price": "295.00", "desc": "Assorted fresh seafood", "category": "Seafood Mains"},
    
    {"name": "RIBEYE STEAK", "price": "245.00", "desc": "Premium ribeye 300g", "category": "Steaks"},
    {"name": "WAGYU BEEF", "price": "395.00", "desc": "Japanese A5 Wagyu 200g", "category": "Steaks"},
    
    {"name": "ROASTED CHICKEN", "price": "155.00", "desc": "Half roasted chicken with herbs", "category": "Land Mains"},
    {"name": "LAMB CHOPS", "price": "225.00", "desc": "Grilled lamb chops with mint sauce", "category": "Land Mains"},
    
    {"name": "DOM PERIGNON", "price": "1200.00", "desc": "Vintage champagne", "category": "Champagne"},
    {"name": "MOET & CHANDON", "price": "650.00", "desc": "Classic champagne", "category": "Champagne"},
]

for item_data in items_data:
    category = categories[item_data["category"]]
    Item.objects.get_or_create(
        item_name=item_data["name"],
        restaurant=restaurant,
        category=category,
        defaults={
            "price": item_data["price"],
            "description": item_data["desc"],
            "availability": True
        }
    )
    print(f"Item: {item_data['name']}")

print("\n✓ Seed data loaded successfully!")
print(f"Total: {Category.objects.count()} categories, {Item.objects.count()} items")
