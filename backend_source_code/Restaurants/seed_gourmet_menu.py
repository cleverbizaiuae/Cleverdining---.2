"""
Comprehensive Demo Menu Seed Data for CleverBiz
Based on The Gourmet Kitchen restaurant structure
Includes hierarchical categories with sub-categories and Unsplash images
"""

from accounts.models import User
from restaurant.models import Restaurant
from category.models import Category
from item.models import Item

print("=== Creating The Gourmet Kitchen Demo Menu ===\n")

# Get or create owner
owner, _ = User.objects.get_or_create(
    email="owner@cleverbiz.demo",
    defaults={"username": "Owner", "role": "owner"}
)
owner.set_password("password123")
owner.save()

# Create restaurant with logo
restaurant, created = Restaurant.objects.get_or_create(
    resturent_name="The Gourmet Kitchen",
    defaults={
        "owner": owner,
        "location": "Dubai Marina",
        "phone_number": "+971-555-0123",
        "package": "Pro"
    }
)

if not created:
    # Clear existing menu data
    Item.objects.filter(restaurant=restaurant).delete()
    Category.objects.filter(restaurant=restaurant).delete()
    print("✓ Cleared existing menu data\n")

print(f"✓ Restaurant: {restaurant.resturent_name}\n")

# ============ CREATE MAIN CATEGORIES (Level 0) ============

print("Creating main categories...")

starters = Category.objects.create(
    Category_name="Starters",
    restaurant=restaurant,
    parent_category=None,
    level=0
)

main_course = Category.objects.create(
    Category_name="Main Course",
    restaurant=restaurant,
    parent_category=None,
    level=0
)

drinks = Category.objects.create(
    Category_name="Drinks",
    restaurant=restaurant,
    parent_category=None,
    level=0
)

desserts = Category.objects.create(
    Category_name="Desserts",
    restaurant=restaurant,
    parent_category=None,
    level=0
)

print("✓ Created 4 main categories\n")

# ============ CREATE SUB-CATEGORIES (Level 1) ============

print("Creating sub-categories...")

# Starters sub-categories
salads = Category.objects.create(
    Category_name="Salads",
    restaurant=restaurant,
    parent_category=starters,
    level=1
)

soups = Category.objects.create(
    Category_name="Soups",
    restaurant=restaurant,
    parent_category=starters,
    level=1
)

appetizers = Category.objects.create(
    Category_name="Appetizers",
    restaurant=restaurant,
    parent_category=starters,
    level=1
)

# Main Course sub-categories
pasta_risotto = Category.objects.create(
    Category_name="Pasta & Risotto",
    restaurant=restaurant,
    parent_category=main_course,
    level=1
)

grilled_roasted = Category.objects.create(
    Category_name="Grilled & Roasted",
    restaurant=restaurant,
    parent_category=main_course,
    level=1
)

vegetarian = Category.objects.create(
    Category_name="Vegetarian",
    restaurant=restaurant,
    parent_category=main_course,
    level=1
)

# Drinks sub-categories
cocktails = Category.objects.create(
    Category_name="Cocktails",
    restaurant=restaurant,
    parent_category=drinks,
    level=1
)

mocktails = Category.objects.create(
    Category_name="Mocktails",
    restaurant=restaurant,
    parent_category=drinks,
    level=1
)

coffee_tea = Category.objects.create(
    Category_name="Coffee & Tea",
    restaurant=restaurant,
    parent_category=drinks,
    level=1
)

# Desserts sub-categories
cakes_pastries = Category.objects.create(
    Category_name="Cakes & Pastries",
    restaurant=restaurant,
    parent_category=desserts,
    level=1
)

ice_cream = Category.objects.create(
    Category_name="Ice Cream",
    restaurant=restaurant,
    parent_category=desserts,
    level=1
)

print("✓ Created 11 sub-categories\n")

# ============ CREATE MENU ITEMS ============

print("Creating menu items...")

menu_items = [
    # STARTERS > SALADS
    {
        "name": "Caesar Salad",
        "desc": "Crisp romaine lettuce, parmesan cheese, croutons, Caesar dressing",
        "price": "12.99",
        "category": starters,
        "sub_category": salads,
        "image": "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=600"
    },
    {
        "name": "Greek Salad",
        "desc": "Fresh vegetables, feta cheese, olives, olive oil dressing",
        "price": "11.99",
        "category": starters,
        "sub_category": salads,
        "image": "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600"
    },
    
    # STARTERS > SOUPS
    {
        "name": "Tomato Basil Soup",
        "desc": "Creamy tomato soup with fresh basil and croutons",
        "price": "8.99",
        "category": starters,
        "sub_category": soups,
        "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600"
    },
    {
        "name": "French Onion Soup",
        "desc": "Caramelized onions, beef broth, melted gruyere cheese",
        "price": "9.99",
        "category": starters,
        "sub_category": soups,
        "image": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=600"
    },
    
    # STARTERS > APPETIZERS
    {
        "name": "Bruschetta",
        "desc": "Grilled bread with tomatoes, garlic, basil, olive oil",
        "price": "10.99",
        "category": starters,
        "sub_category": appetizers,
        "image": "https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600"
    },
    
    # MAIN COURSE > PASTA & RISOTTO
    {
        "name": "Spaghetti Carbonara",
        "desc": "Classic Italian pasta with pancetta, egg, parmesan",
        "price": "18.99",
        "category": main_course,
        "sub_category": pasta_risotto,
        "image": "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600"
    },
    {
        "name": "Mushroom Risotto",
        "desc": "Creamy arborio rice with wild mushrooms, parmesan",
        "price": "17.99",
        "category": main_course,
        "sub_category": pasta_risotto,
        "image": "https://images.unsplash.com/photo-1476124369491-f4a9a3aaa6dd?w=600"
    },
    
    # MAIN COURSE > GRILLED & ROASTED
    {
        "name": "Grilled Salmon",
        "desc": "Atlantic salmon with lemon butter sauce, seasonal vegetables",
        "price": "24.99",
        "category": main_course,
        "sub_category": grilled_roasted,
        "image": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600"
    },
    {
        "name": "Ribeye Steak",
        "desc": "12oz USDA Prime ribeye, garlic butter, mashed potatoes",
        "price": "32.99",
        "category": main_course,
        "sub_category": grilled_roasted,
        "image": "https://images.unsplash.com/photo-1558030006-450675393462?w=600"
    },
    
    # MAIN COURSE > VEGETARIAN
    {
        "name": "Vegetable Stir Fry",
        "desc": "Fresh seasonal vegetables, ginger soy sauce, jasmine rice",
        "price": "15.99",
        "category": main_course,
        "sub_category": vegetarian,
        "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600"
    },
    
    # DRINKS > COCKTAILS
    {
        "name": "Mojito",
        "desc": "White rum, mint, lime juice, soda water, sugar",
        "price": "11.99",
        "category": drinks,
        "sub_category": cocktails,
        "image": "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=600"
    },
    {
        "name": "Margarita",
        "desc": "Tequila, triple sec, lime juice, salt rim",
        "price": "12.99",
        "category": drinks,
        "sub_category": cocktails,
        "image": "https://images.unsplash.com/photo-1606217483002-af26f93873ee?w=600"
    },
    
    # DRINKS > MOCKTAILS
    {
        "name": "Virgin Mojito",
        "desc": "Fresh mint, lime, soda water, sugar syrup",
        "price": "6.99",
        "category": drinks,
        "sub_category": mocktails,
        "image": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600"
    },
    
    # DRINKS > COFFEE & TEA
    {
        "name": "Cappuccino",
        "desc": "Espresso with steamed milk and foam",
        "price": "4.99",
        "category": drinks,
        "sub_category": coffee_tea,
        "image": "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600"
    },
    {
        "name": "Green Tea",
        "desc": "Premium Japanese green tea",
        "price": "3.99",
        "category": drinks,
        "sub_category": coffee_tea,
        "image": "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600"
    },
    
    # DESSERTS > CAKES & PASTRIES
    {
        "name": "Tiramisu",
        "desc": "Classic Italian dessert with mascarpone, espresso, cocoa",
        "price": "8.99",
        "category": desserts,
        "sub_category": cakes_pastries,
        "image": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600"
    },
    {
        "name": "Chocolate Lava Cake",
        "desc": "Warm chocolate cake with molten center, vanilla ice cream",
        "price": "9.99",
        "category": desserts,
        "sub_category": cakes_pastries,
        "image": "https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=600"
    },
    
    # DESSERTS > ICE CREAM
    {
        "name": "Vanilla Bean Ice Cream",
        "desc": "Premium Madagascar vanilla bean ice cream",
        "price": "5.99",
        "category": desserts,
        "sub_category": ice_cream,
        "image": "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600"
    },
]

for item_data in menu_items:
    Item.objects.create(
        item_name=item_data["name"],
        description=item_data["desc"],
        price=item_data["price"],
        category=item_data["category"],
        sub_category=item_data["sub_category"],
        restaurant=restaurant,
        image1=item_data["image"],
        availability=True
    )

print(f"✓ Created {len(menu_items)} menu items\n")

# Summary
print("=" * 50)
print("MENU STRUCTURE SUMMARY")
print("=" * 50)
print(f"Restaurant: {restaurant.resturent_name}")
print(f"Main Categories: 4")
print(f"Sub-Categories: 11")
print(f"Menu Items: {len(menu_items)}")
print("\nHierarchy:")
print("  Starters → Salads, Soups, Appetizers")
print("  Main Course → Pasta & Risotto, Grilled & Roasted, Vegetarian")
print("  Drinks → Cocktails, Mocktails, Coffee & Tea")
print("  Desserts → Cakes & Pastries, Ice Cream")
print("\n✓ Demo menu seeded successfully!")
print(f"\nLogin: owner@cleverbiz.demo / password123")
