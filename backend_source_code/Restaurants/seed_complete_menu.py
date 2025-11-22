"""
Comprehensive Restaurant Menu Seeding Script
Creates a full-featured menu with 6 categories, 14 sub-categories, and 77 items
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')
django.setup()

from restaurant.models import Restaurant
from category.models import Category
from item.models import Item
from accounts.models import User

def clear_existing_menu():
    """Clear existing menu data for The Gourmet Kitchen"""
    print("Clearing existing menu data...")
    try:
        restaurant = Restaurant.objects.get(resturent_name="The Gourmet Kitchen")
        Item.objects.filter(restaurant=restaurant).delete()
        Category.objects.filter(
            Category_name__in=[
                "Appetizers", "Soups", "Salads", "Main Course", "Desserts", "Beverages",
                # Sub-categories
                "Hot Appetizers", "Cold Appetizers", "Finger Foods",
                "Steaks & Grills", "Seafood", "Pasta", "Asian Cuisine", "Vegetarian",
                "Cocktails", "Mocktails", "Hot Beverages", "Cold Drinks", "Milkshakes"
            ]
        ).delete()
        print("✓ Cleared existing menu data")
    except Restaurant.DoesNotExist:
        print("Restaurant not found, will create new one")

def create_or_get_restaurant():
    """Create or get The Gourmet Kitchen restaurant"""
    print("\nSetting up restaurant...")
    
    # Get owner user
    owner = User.objects.filter(email="owner@cleverbiz.demo").first()
    if not owner:
        print("! Owner user not found, using first owner in database")
        owner = User.objects.filter(role='owner').first()
    
    restaurant, created = Restaurant.objects.update_or_create(
        resturent_name="The Gourmet Kitchen",
        defaults={
            'location': 'Dubai Marina',
            'phone_number': '+971-555-0123',
            'package': 'Pro',
            'owner': owner
        }
    )
    
    action = "Created" if created else "Updated"
    print(f"✓ {action} restaurant: {restaurant.resturent_name}")
    return restaurant

def create_menu_structure(restaurant):
    """Create complete menu structure"""
    print("\nCreating menu structure...")
    
    # Menu data structure
    menu_data = {
        "Appetizers": {
            "icon": "🥟",
            "sub_categories": {
                "Hot Appetizers": [
                    {"name": "Crispy Spring Rolls", "price": 8.99, "desc": "Golden fried rolls filled with fresh vegetables and served with sweet chili sauce", "image": "https://images.unsplash.com/photo-1611171711912-e0be6378a52f"},
                    {"name": "Buffalo Chicken Wings", "price": 12.99, "desc": "Spicy chicken wings tossed in buffalo sauce with ranch dip", "image": "https://images.unsplash.com/photo-1608039755401-742074f1fa36"},
                    {"name": "Mozzarella Sticks", "price": 9.99, "desc": "Crispy breaded mozzarella with marinara sauce", "image": "https://images.unsplash.com/photo-1531749668029-2db88e4276c7"},
                    {"name": "Dynamite Shrimp", "price": 14.99, "desc": "Crispy shrimp tossed in spicy dynamite sauce", "image": "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47"},
                    {"name": "Vegetable Tempura", "price": 10.99, "desc": "Lightly battered and fried mixed vegetables", "image": "https://images.unsplash.com/photo-1626776876729-bab4b65283c7"}
                ],
                "Cold Appetizers": [
                    {"name": "Bruschetta", "price": 8.99, "desc": "Toasted bread topped with tomatoes, garlic, and basil", "image": "https://images.unsplash.com/photo-1572695157366-5e585ab2b69f"},
                    {"name": "Caprese Salad", "price": 11.99, "desc": "Fresh mozzarella, tomatoes, and basil with balsamic glaze", "image": "https://images.unsplash.com/photo-1608897013039-887f21d8c804"},
                    {"name": "Smoked Salmon Platter", "price": 15.99, "desc": "Norwegian smoked salmon with capers and cream cheese", "image": "https://images.unsplash.com/photo-1580822184713-fc5400e7fe10"}
                ],
                "Finger Foods": [
                    {"name": "Chicken Satay Skewers", "price": 10.99, "desc": "Grilled chicken skewers with peanut sauce", "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398"},
                    {"name": "Mini Beef Sliders", "price": 13.99, "desc": "Three mini beef burgers with cheese and pickles", "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd"},
                    {"name": "Jalapeño Poppers", "price": 9.99, "desc": "Cream cheese stuffed jalapeños wrapped in bacon", "image": "https://images.unsplash.com/photo-1599921841143-819065a55cc6"}
                ]
            }
        },
        "Soups": {
            "icon": "🍲",
            "items": [
                {"name": "French Onion Soup", "price": 8.99, "desc": "Classic caramelized onion soup with cheese crouton", "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd"},
                {"name": "Tom Yum Soup", "price": 9.99, "desc": "Spicy Thai soup with shrimp and lemongrass", "image": "https://images.unsplash.com/photo-1613844237701-8f3664fc2eff"},
                {"name": "Cream of Mushroom", "price": 8.99, "desc": "Rich and creamy mushroom soup", "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd"},
                {"name": "Chicken Noodle Soup", "price": 7.99, "desc": "Homestyle chicken soup with egg noodles", "image": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d"},
                {"name": "Miso Soup", "price": 5.99, "desc": "Traditional Japanese soup with tofu and seaweed", "image": "https://images.unsplash.com/photo-1606895405506-c32e16cf4ee3"},
                {"name": "Lobster Bisque", "price": 14.99, "desc": "Creamy lobster soup with cognac", "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd"}
            ]
        },
        "Salads": {
            "icon": "🥗",
            "items": [
                {"name": "Caesar Salad", "price": 10.99, "desc": "Romaine lettuce with caesar dressing and parmesan", "image": "https://images.unsplash.com/photo-1546793665-c74683f339c1"},
                {"name": "Greek Salad", "price": 11.99, "desc": "Fresh vegetables with feta cheese and olives", "image": "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe"},
                {"name": "Grilled Chicken Salad", "price": 13.99, "desc": "Mixed greens with grilled chicken and vinaigrette", "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd"},
                {"name": "Asian Sesame Salad", "price": 12.99, "desc": "Crispy wontons with sesame ginger dressing", "image": "https://images.unsplash.com/photo-1505253716362-afaea1d3d1af"},
                {"name": "Cobb Salad", "price": 14.99, "desc": "Chicken, bacon, eggs, and blue cheese", "image": "https://images.unsplash.com/photo-1607532941433-304659e8198a"},
                {"name": "Quinoa Buddha Bowl", "price": 13.99, "desc": "Quinoa with roasted vegetables and tahini", "image": "https://images.unsplash.com/photo-1600803907087-f56d462fd26b"}
            ]
        },
        "Main Course": {
            "icon": "🍽️",
            "sub_categories": {
                "Steaks & Grills": [
                    {"name": "Ribeye Steak (12oz)", "price": 34.99, "desc": "Premium beef ribeye grilled to perfection", "image": "https://images.unsplash.com/photo-1600891964092-4316c288032e"},
                    {"name": "Grilled Lamb Chops", "price": 32.99, "desc": "Tender lamb chops with herbs and garlic", "image": "https://images.unsplash.com/photo-1546833998-877b37c2e5c6"},
                    {"name": "BBQ Baby Back Ribs", "price": 28.99, "desc": "Slow-cooked ribs with BBQ glaze", "image": "https://images.unsplash.com/photo-1544025162-d76694265947"},
                    {"name": "Filet Mignon (8oz)", "price": 38.99, "desc": "Tender beef tenderloin with red wine reduction", "image": "https://images.unsplash.com/photo-1600891964092-4316c288032e"}
                ],
                "Seafood": [
                    {"name": "Grilled Salmon", "price": 26.99, "desc": "Atlantic salmon with lemon butter sauce", "image": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2"},
                    {"name": "Lobster Tail", "price": 42.99, "desc": "Butter-poached lobster tail", "image": "https://images.unsplash.com/photo-1625943553852-781c6dd46faa"},
                    {"name": "Pan-Seared Sea Bass", "price": 35.99, "desc": "Mediterranean sea bass with herb oil", "image": "https://images.unsplash.com/photo-1580959375944-850674f1e9fe"},
                    {"name": "Shrimp Scampi", "price": 24.99, "desc": "Garlic butter shrimp over linguine", "image": "https://images.unsplash.com/photo-1633504581786-316c8002b1b2"}
                ],
                "Pasta": [
                    {"name": "Fettuccine Alfredo", "price": 18.99, "desc": "Creamy parmesan sauce with fettuccine", "image": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a"},
                    {"name": "Spaghetti Carbonara", "price": 19.99, "desc": "Classic Roman pasta with pancetta and egg", "image": "https://images.unsplash.com/photo-1612874742237-6526221588e3"},
                    {"name": "Penne Arrabiata", "price": 16.99, "desc": "Spicy tomato sauce with penne pasta", "image": "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9"},
                    {"name": "Seafood Linguine", "price": 26.99, "desc": "Mixed seafood in white wine sauce", "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8"}
                ],
                "Asian Cuisine": [
                    {"name": "Pad Thai", "price": 17.99, "desc": "Thai rice noodles with shrimp and peanuts", "image": "https://images.unsplash.com/photo-1559314809-0d155014e29e"},
                    {"name": "General Tso's Chicken", "price": 16.99, "desc": "Crispy chicken in sweet and spicy sauce", "image": "https://images.unsplash.com/photo-1626804475297-41608ea09aeb"},
                    {"name": "Beef Teriyaki", "price": 21.99, "desc": "Grilled beef with teriyaki glaze", "image": "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0"},
                    {"name": "Vegetable Fried Rice", "price": 13.99, "desc": "Wok-fried rice with mixed vegetables", "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19"}
                ],
                "Vegetarian": [
                    {"name": "Vegetable Stir Fry", "price": 15.99, "desc": "Mixed vegetables in Asian sauce", "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19"},
                    {"name": "Eggplant Parmesan", "price": 17.99, "desc": "Breaded eggplant with marinara and cheese", "image": "https://images.unsplash.com/photo-1579631542720-3a87824fff86"},
                    {"name": "Mushroom Risotto", "price": 19.99, "desc": "Creamy arborio rice with wild mushrooms", "image": "https://images.unsplash.com/photo-1476124369491-b79b338c5744"},
                    {"name": "Veggie Burger", "price": 14.99, "desc": "House-made veggie patty with all toppings", "image": "https://images.unsplash.com/photo-1520072959219-c595dc870360"}
                ]
            }
        },
        "Desserts": {
            "icon": "🍰",
            "items": [
                {"name": "Chocolate Lava Cake", "price": 8.99, "desc": "Warm chocolate cake with molten center", "image": "https://images.unsplash.com/photo-1624353365286-3f8d62daad51"},
                {"name": "New York Cheesecake", "price": 7.99, "desc": "Classic creamy cheesecake with berry compote", "image": "https://images.unsplash.com/photo-1533134242116-1d62f50778c8"},
                {"name": "Tiramisu", "price": 8.99, "desc": "Italian coffee-flavored dessert", "image": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9"},
                {"name": "Crème Brûlée", "price": 7.99, "desc": "Vanilla custard with caramelized sugar", "image": "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc"},
                {"name": "Apple Pie à la Mode", "price": 6.99, "desc": "Warm apple pie with vanilla ice cream", "image": "https://images.unsplash.com/photo-1535920527002-b35e96722eb9"},
                {"name": "Panna Cotta", "price": 7.99, "desc": "Italian cream dessert with berry sauce", "image": "https://images.unsplash.com/photo-1488477181946-6428a0291777"},
                {"name": "Chocolate Mousse", "price": 7.99, "desc": "Rich dark chocolate mousse", "image": "https://images.unsplash.com/photo-1541519920649-d2e9d0e863cd"},
                {"name": "Banoffee Pie", "price": 8.99, "desc": "Banana and toffee pie with cream", "image": "https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81"}
            ]
        },
        "Beverages": {
            "icon": "🍹",
            "sub_categories": {
                "Cocktails": [
                    {"name": "Mojito", "price": 10.99, "desc": "Refreshing mint and lime cocktail", "image": "https://images.unsplash.com/photo-1551538827-9c037cb4f32a"},
                    {"name": "Margarita", "price": 11.99, "desc": "Classic tequila cocktail with lime", "image": "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf"},
                    {"name": "Cosmopolitan", "price": 12.99, "desc": "Vodka cranberry cocktail", "image": "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b"},
                    {"name": "Old Fashioned", "price": 13.99, "desc": "Bourbon with bitters and orange", "image": "https://images.unsplash.com/photo-1470337458703-46ad1756a187"},
                    {"name": "Piña Colada", "price": 11.99, "desc": "Tropical rum cocktail with pineapple", "image": "https://images.unsplash.com/photo-1575467678930-c7acd65d6470"}
                ],
                "Mocktails": [
                    {"name": "Virgin Mojito", "price": 6.99, "desc": "Non-alcoholic mint and lime refresher", "image": "https://images.unsplash.com/photo-1556679343-c7306c1976bc"},
                    {"name": "Strawberry Lemonade", "price": 5.99, "desc": "Fresh strawberry and lemon blend", "image": "https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9c"},
                    {"name": "Tropical Paradise", "price": 7.99, "desc": "Exotic fruit blend mocktail", "image": "https://images.unsplash.com/photo-1546171753-97d7676e9da0"},
                    {"name": "Blue Lagoon Mocktail", "price": 6.99, "desc": "Blue curacao flavored mocktail", "image": "https://images.unsplash.com/photo-1587223962930-cb7f31384c19"}
                ],
                "Hot Beverages": [
                    {"name": "Espresso", "price": 3.99, "desc": "Strong Italian coffee shot", "image": "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04"},
                    {"name": "Cappuccino", "price": 4.99, "desc": "Espresso with steamed milk foam", "image": "https://images.unsplash.com/photo-1572442388796-11668a67e53d"},
                    {"name": "Latte", "price": 5.99, "desc": "Smooth espresso with steamed milk", "image": "https://images.unsplash.com/photo-1461023058943-07fcbe16d735"},
                    {"name": "Green Tea", "price": 3.99, "desc": "Premium Japanese green tea", "image": "https://images.unsplash.com/photo-1556679343-c7306c1976bc"},
                    {"name": "Hot Chocolate", "price": 4.99, "desc": "Rich hot chocolate with whipped cream", "image": "https://images.unsplash.com/photo-1542990253-a781e04c0082"}
                ],
                "Cold Drinks": [
                    {"name": "Fresh Orange Juice", "price": 5.99, "desc": "Freshly squeezed orange juice", "image": "https://images.unsplash.com/photo-1600271886742-f049cd451bba"},
                    {"name": "Mango Smoothie", "price": 6.99, "desc": "Tropical mango smoothie", "image": "https://images.unsplash.com/photo-1505252585461-04db1eb84625"},
                    {"name": "Iced Tea", "price": 3.99, "desc": "Refreshing iced tea with lemon", "image": "https://images.unsplash.com/photo-1556679343-c7306c1976bc"},
                    {"name": "Lemonade", "price": 4.99, "desc": "Fresh lemon ade", "image": "https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9c"},
                    {"name": "Soft Drinks", "price": 2.99, "desc": "Assorted soft drinks", "image": "https://images.unsplash.com/photo-1581006852262-e4307cf6283a"}
                ],
                "Milkshakes": [
                    {"name": "Chocolate Milkshake", "price": 6.99, "desc": "Thick chocolate shake", "image": "https://images.unsplash.com/photo-1572490122747-3968b75cc699"},
                    {"name": "Vanilla Milkshake", "price": 6.99, "desc": "Classic vanilla shake", "image": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002"},
                    {"name": "Strawberry Milkshake", "price": 6.99, "desc": "Fresh strawberry shake", "image": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc"},
                    {"name": "Oreo Milkshake", "price": 7.99, "desc": "Cookies and cream shake", "image": "https://images.unsplash.com/photo-1619158401874-52b7df7f7e81"},
                    {"name": "Peanut Butter Milkshake", "price": 7.99, "desc": "Creamy peanut butter shake", "image": "https://images.unsplash.com/photo-1572490122747-3968b75cc699"}
                ]
            }
        }
    }
    
    total_items = 0
    total_categories = 0
    total_subcategories = 0
    
    # Create categories and items
    for cat_name, cat_data in menu_data.items():
        # Create main category
        main_category = Category.objects.create(
            Category_name=cat_name,
            level=1,
            parent_category=None,
            restaurant=restaurant
        )
        total_categories += 1
        print(f"\n✓ Created category: {cat_name}")
        
        # Check if category has sub-categories or direct items
        if "sub_categories" in cat_data:
            # Create sub-categories and their items
            for subcat_name, items in cat_data["sub_categories"].items():
                sub_category = Category.objects.create(
                    Category_name=subcat_name,
                    level=2,
                    parent_category=main_category,
                    restaurant=restaurant
                )
                total_subcategories += 1
                print(f"  ✓ Created sub-category: {subcat_name}")
                
                # Create items for this sub-category
                for item_data in items:
                    Item.objects.create(
                        item_name=item_data["name"],
                        description=item_data["desc"],
                        price=item_data["price"],
                        category=main_category,
                        sub_category=sub_category,
                        restaurant=restaurant,
                        image1=item_data["image"],
                        availability=True
                    )
                    total_items += 1
                print(f"    ✓ Created {len(items)} items")
        
        elif "items" in cat_data:
            # Create items directly under main category (no sub-category)
            for item_data in cat_data["items"]:
                Item.objects.create(
                    item_name=item_data["name"],
                    description=item_data["desc"],
                    price=item_data["price"],
                    category=main_category,
                    sub_category=None,
                    restaurant=restaurant,
                    image1=item_data["image"],
                    availability=True
                )
                total_items += 1
            print(f"  ✓ Created {len(cat_data['items'])} items (no sub-categories)")
    
    print(f"\n" + "="*60)
    print(f"📊 SUMMARY")
    print(f"="*60)
    print(f"✓ Total Categories: {total_categories}")
    print(f"✓ Total Sub-Categories: {total_subcategories}")
    print(f"✓ Total Items: {total_items}")
    print(f"="*60)

def main():
    print("="*60)
    print("🍽️  COMPREHENSIVE RESTAURANT MENU SETUP")
    print("="*60)
    
    # Clear existing data
    clear_existing_menu()
    
    # Create or get restaurant
    restaurant = create_or_get_restaurant()
    
    # Create complete menu structure
    create_menu_structure(restaurant)
    
    print(f"\n✅ Menu setup complete!")
    print(f"\n📱 Restaurant: {restaurant.resturent_name}")
    print(f"📍 Location: {restaurant.location}")
    print(f"📞 Phone: {restaurant.phone_number}")
    print(f"\n{'='*60}\n")

if __name__ == "__main__":
    main()
