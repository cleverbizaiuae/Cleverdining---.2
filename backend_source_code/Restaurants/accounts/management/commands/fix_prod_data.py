from django.core.management.base import BaseCommand
from accounts.models import User
from restaurant.models import Restaurant
from category.models import Category
from django.conf import settings
from django.utils import timezone

class Command(BaseCommand):
    help = 'Fixes production data by ensuring user and restaurant exist'

    def handle(self, *args, **options):
        self.stdout.write("Checking production data...")
        
        # 1. User
        email = 'pranay@cleverbiz.ai'
        
        user = User.objects.filter(email=email).first()
        if not user:
             self.stdout.write(f"User {email} missing. Creating...")
             try:
                 user = User.objects.create_superuser('pranay', email, 'Pass@123')
                 user.role = 'owner'
                 user.save()
                 self.stdout.write("User created with password 'Pass@123'")
             except Exception as e:
                 self.stdout.write(self.style.ERROR(f"Failed to create user: {e}"))
                 return
        else:
             self.stdout.write(f"User {email} exists.")
             if user.role != 'owner':
                 user.role = 'owner'
                 user.save()
                 self.stdout.write("Fixed user role to owner.")

        # 2. Restaurant
        rest = Restaurant.objects.filter(owner=user).first()
        if not rest:
             self.stdout.write("Restaurant missing. Creating...")
             try:
                 rest = Restaurant.objects.create(
                     owner=user,
                     resturent_name="CleverDining Main",
                     location="Dubai",
                     phone_number="+971500000000",
                     package="Enterprise",
                     plan="enterprise",
                     status="active",
                     subscription_start=timezone.now()
                 )
                 self.stdout.write(f"Restaurant created: {rest.id}")
             except Exception as e:
                 self.stdout.write(self.style.ERROR(f"Failed to create restaurant: {e}"))
        else:
             self.stdout.write(f"Restaurant exists: {rest.resturent_name}")

        # 3. Category
        if rest:
            cat = Category.objects.filter(restaurant=rest).first()
            if not cat:
                self.stdout.write("Category missing. Creating 'Starters'...")
                Category.objects.create(
                    Category_name="Starters",
                    restaurant=rest,
                    slug="starters"
                )
                self.stdout.write("Category created.")
            else:
                self.stdout.write(f"Categories exist ({Category.objects.filter(restaurant=rest).count()})")

        self.stdout.write(self.style.SUCCESS("Data check complete!"))
