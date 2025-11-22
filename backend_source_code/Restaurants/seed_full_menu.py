"""
Complete menu seed data based on user screenshots
Creates the full rich menu with all categories and items
"""

from accounts.models import User  
from restaurant.models import Restaurant
from device.models import Device
from category.models import Category
from item.models import Item

print("=== Creating Complete Rich Menu ===")

# Get or create restaurant and owner
owner, _ = User.objects.get_or_create(
    email="owner@cleverbiz.demo",
    defaults={"username": "Owner", "role": "owner"}
)
owner.set_password("password123")
owner.save()

restaurant, _ = Restaurant.objects.get_or_create(
    resturent_name="CleverBIZ Demo Restaurant",
    defaults={
        "owner": owner,
        "location": "Dubai Marina",
        "phone_number": "+971501234567",
        "package": "Pro"
    }
)

print(f"✓ Restaurant: {restaurant.resturent_name}")

# Delete old items and categories to start fresh
Item.objects.filter(restaurant=restaurant).delete()
Category.objects.filter(restaurant=restaurant).delete()
print("✓ Cleared existing menu")

# Create Categories (from screenshots)
categories = {}
cat_data = [
    "Light Bites",
    "Seafood Mains", 
    "Champagne",
    "To Start With",
    "Steaks",
    "Land Mains",
    "Salad",
    "Raw"
]

for cat_name in cat_data:
    cat, _ = Category.objects.get_or_create(
        Category_name=cat_name,
        restaurant=restaurant
    )
    categories[cat_name] = cat

print(f"✓ Created {len(categories)} categories")

# Create ALL items from screenshots with proper pricing
items_data = [
    # Light Bites (from screenshot 2)
    ("SALTED EDAMAME", "35.00", "Light Bites", "Lightly salted edamame beans"),
    ("CHICKEN WINGS (6 PCS)", "82.00", "Light Bites", "6 pieces of crispy chicken wings with signature sauce"),
    ("POTATO STICK", "62.00", "Light Bites", "Crispy potato sticks served with dipping sauce"),
    ("CAVIAR PANCAKE", "88.00", "Light Bites", "Delicate pancake topped with premium caviar"),
    
    # More items from screenshot 3
    ("WAGYU CROQUETTES", "62.00", "To Start With", "Crispy wagyu beef croquettes"),
    ("K.F.C CHICKEN", "82.00", "To Start With", "Korean fried chicken with special sauce"),
    ("CHICKEN TANTORI", "78.00", "To Start With", "Tandoori-style chicken skewers"),
    ("BANG SUSHI", "82.00", "To Start With", "Spicy bang sauce sushi rolls"),
    
    ("THE KEBAB", "78.00", "Land Mains", "Traditional kebab platter"),
    ("CHARR GRILLED EGGPLANT", "53.00", "Land Mains", "Charred eggplant with herbs"),
    ("WAGYU MEATBALLS", "117.00", "Land Mains", "Premium wagyu beef meatballs in rich sauce"),
    ("WAGYU BEEF CARPACCIO", "98.00", "Raw", "Thinly sliced wagyu beef carpaccio"),
    
    ("BLUEFIN TUNA TARTARE", "125.00", "Raw", "Fresh bluefin tuna tartare with avocado"),
    ("BLUEFIN TUNA TATAKI", "135.00", "Raw", "Lightly seared bluefin tuna"),
    ("WAGYU BEEF TARTARE", "116.00", "Raw", "Hand-cut wagyu beef tartare"),
    ("MISO PURSLANE", "71.00", "Salad", "Purslane salad with miso dressing"),
    
    # Additional items
    ("GRILLED SALMON", "185.00", "Seafood Mains", "Norwegian salmon with seasonal vegetables"),
    ("SEAFOOD PLATTER", "295.00", "Seafood Mains", "Assorted fresh seafood"),
    ("RIBEYE STEAK", "245.00", "Steaks", "Premium ribeye 300g"),
    ("WAGYU BEEF STEAK", "395.00", "Steaks", "Japanese A5 Wagyu 200g"),
    
    ("CAESAR SALAD", "75.00", "Salad", "Classic caesar with parmesan"),
    ("GREEK SALAD", "70.00", "Salad", "Fresh Mediterranean salad"),
    
    ("DOM PERIGNON", "1200.00", "Champagne", "Vintage champagne"),
    ("MOET & CHANDON", "650.00", "Champagne", "Classic champagne"),
]

for name, price, cat_name, desc in items_data:
    Item.objects.get_or_create(
        item_name=name,
        restaurant=restaurant,
        defaults={
            "price": price,
            "description": desc,
            "category": categories[cat_name],
            "availability": True
        }
    )

print(f"✓ Created {len(items_data)} menu items")
print("\n=== Menu Complete! ===")
print(f"Total: {Category.objects.filter(restaurant=restaurant).count()} categories")
print(f"Total: {Item.objects.filter(restaurant=restaurant).count()} items")
print("\nLogin: owner@cleverbiz.demo / password123")
