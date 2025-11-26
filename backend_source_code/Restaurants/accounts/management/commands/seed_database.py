from django.core.management.base import BaseCommand
from accounts.models import User
from restaurant.models import Restaurant
from category.models import Category
from item.models import Item


class Command(BaseCommand):
    help = 'Seed database with sample data'

    def handle(self, *args, **kwargs):
        self.stdout.write("=== Creating Demo Data ===")

        # 1. Create basic users
        owner, created = User.objects.get_or_create(
            email="owner@cb.demo",
            defaults={
                "username": "Owner",
                "role": "owner"
            }
        )
        if created:
            owner.set_password("password123")
            owner.save()
        self.stdout.write(self.style.SUCCESS(f"✓ Owner: {owner.email}"))

        # Create Platform Super Admin (for /admin dashboard)
        admin, created = User.objects.get_or_create(
            email="solomon@cleverbiz.ai",
            defaults={
                "username": "admin",
                "role": "admin",  # Keep as admin for platform dashboard
                "is_staff": True,
                "is_superuser": True
            }
        )
        if created:
            admin.set_password("password123")
            admin.save()
        else:
            # Ensure admin has correct privileges
            admin.role = "admin"
            admin.is_staff = True
            admin.is_superuser = True
            admin.save()
        self.stdout.write(self.style.SUCCESS(f"✓ Platform Admin: {admin.email} (role: {admin.role})"))

        # 2. Create Restaurant (owned by owner@cb.demo)
        restaurant, _ = Restaurant.objects.get_or_create(
            resturent_name="CleverBIZ Demo Restaurant",
            defaults={
                "owner": owner,
                "location": "Dubai Marina",
                "phone_number": "+971501234567",
                "package": "Pro"
            }
        )
        self.stdout.write(self.style.SUCCESS(f"✓ Restaurant: {restaurant.resturent_name} (owner: {owner.email})"))

        # 3. Create Categories
        categories = {
            "Light Bites": Category.objects.get_or_create(
                Category_name="Light Bites",
                restaurant=restaurant
            )[0],
            "Seafood": Category.objects.get_or_create(
                Category_name="Seafood Mains",
                restaurant=restaurant
            )[0],
            "Steaks": Category.objects.get_or_create(
                Category_name="Steaks",
                restaurant=restaurant
            )[0],
            "Salad": Category.objects.get_or_create(
                Category_name="Salad",
                restaurant=restaurant
            )[0],
        }
        self.stdout.write(self.style.SUCCESS(f"✓ Created {len(categories)} categories"))

        # 4. Create Items
        items_data = [
            ("SALTED EDAMAME", "35.00", "Light Bites", "Lightly salted edamame beans"),
            ("CHICKEN WINGS (6 PCS)", "82.00", "Light Bites", "Crispy wings with sauce"),
            ("POTATO STICK", "62.00", "Light Bites", "Crispy potato sticks"),
            ("CAVIAR PANCAKE", "88.00", "Light Bites", "Pancake with caviar"),
            ("GRILLED SALMON", "185.00", "Seafood", "Norwegian salmon"),
            ("SEAFOOD PLATTER", "295.00", "Seafood", "Assorted seafood"),
            ("RIBEYE STEAK", "245.00", "Steaks", "Premium ribeye 300g"),
            ("WAGYU BEEF", "395.00", "Steaks", "Japanese A5 Wagyu"),
            ("CAESAR SALAD", "75.00", "Salad", "Classic caesar"),
            ("GREEK SALAD", "70.00", "Salad", "Mediterranean salad"),
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

        self.stdout.write(self.style.SUCCESS(f"✓ Created {len(items_data)} menu items"))
        self.stdout.write(self.style.SUCCESS("\n=== Seed Data Complete! ==="))
        self.stdout.write("")
        self.stdout.write("Login Credentials:")
        self.stdout.write(f"  • Platform Admin: solomon@cleverbiz.ai / password123 → /admin dashboard")
        self.stdout.write(f"  • Restaurant Owner: owner@cb.demo / password123 → /restaurant dashboard")
