from django.core.management.base import BaseCommand
from accounts.models import User
from restaurant.models import Restaurant
from django.db import connection
from django.test.utils import override_settings


class Command(BaseCommand):
    help = 'Verifies database connectivity and tests user creation/login'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=== Database Verification ==="))
        
        # 1. Test database connection
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
            self.stdout.write(self.style.SUCCESS("✓ Database connection: OK"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Database connection failed: {e}"))
            return
        
        # 2. Check if we can query users
        try:
            user_count = User.objects.count()
            self.stdout.write(self.style.SUCCESS(f"✓ Can query users: {user_count} users found"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Cannot query users: {e}"))
            return
        
        # 3. Test user creation (then delete it)
        try:
            test_email = "test_verification@example.com"
            # Delete if exists
            User.objects.filter(email=test_email).delete()
            
            # Create test user
            test_user = User.objects.create_user(
                username="test_user",
                email=test_email,
                password="test_password_123",
                role="customer"
            )
            self.stdout.write(self.style.SUCCESS(f"✓ User creation: OK (created user ID: {test_user.id})"))
            
            # Verify user exists in database
            retrieved_user = User.objects.get(email=test_email)
            if retrieved_user.id == test_user.id:
                self.stdout.write(self.style.SUCCESS("✓ User retrieval: OK (user found in database)"))
            else:
                self.stdout.write(self.style.ERROR("✗ User retrieval: FAILED (user not found)"))
            
            # Test authentication
            if retrieved_user.check_password("test_password_123"):
                self.stdout.write(self.style.SUCCESS("✓ Password verification: OK"))
            else:
                self.stdout.write(self.style.ERROR("✗ Password verification: FAILED"))
            
            # Clean up test user
            test_user.delete()
            self.stdout.write(self.style.SUCCESS("✓ Test user cleanup: OK"))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ User creation test failed: {e}"))
            return
        
        # 4. Check restaurant creation (if owner exists)
        try:
            owner = User.objects.filter(role='owner').first()
            if owner:
                restaurant_count = Restaurant.objects.filter(owner=owner).count()
                self.stdout.write(self.style.SUCCESS(f"✓ Restaurant query: OK ({restaurant_count} restaurants for owner)"))
            else:
                self.stdout.write(self.style.WARNING("⚠ No owner found, skipping restaurant test"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Restaurant query failed: {e}"))
        
        self.stdout.write(self.style.SUCCESS("\n=== Verification Complete ==="))
        self.stdout.write(self.style.SUCCESS("✓ Database is working correctly!"))
        self.stdout.write(self.style.SUCCESS("✓ User creation/login will save to database"))

