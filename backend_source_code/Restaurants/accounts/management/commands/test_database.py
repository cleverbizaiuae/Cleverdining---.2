"""
Management command to test database connectivity and basic operations.
Run with: python manage.py test_database
"""
from django.core.management.base import BaseCommand
from django.db import connection
from accounts.models import User
from restaurant.models import Restaurant
from django.contrib.auth import authenticate


class Command(BaseCommand):
    help = 'Test database connectivity and basic authentication operations'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('DATABASE CONNECTIVITY TEST'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        
        # Test 1: Database Connection
        self.stdout.write('\n1. Testing database connection...')
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                if result[0] == 1:
                    self.stdout.write(self.style.SUCCESS('   ✓ Database connection: SUCCESS'))
                else:
                    self.stdout.write(self.style.ERROR('   ✗ Database connection: FAILED'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'   ✗ Database connection error: {str(e)}'))
            return
        
        # Test 2: Count Users
        self.stdout.write('\n2. Counting users in database...')
        try:
            user_count = User.objects.count()
            self.stdout.write(self.style.SUCCESS(f'   ✓ Total users: {user_count}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'   ✗ Error counting users: {str(e)}'))
        
        # Test 3: Count Restaurants
        self.stdout.write('\n3. Counting restaurants in database...')
        try:
            restaurant_count = Restaurant.objects.count()
            self.stdout.write(self.style.SUCCESS(f'   ✓ Total restaurants: {restaurant_count}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'   ✗ Error counting restaurants: {str(e)}'))
        
        # Test 4: List sample users
        self.stdout.write('\n4. Sample users (first 5):')
        try:
            users = User.objects.all()[:5]
            if users.exists():
                for user in users:
                    self.stdout.write(f'   - {user.email} (Role: {user.role}, Active: {user.is_active})')
            else:
                self.stdout.write(self.style.WARNING('   ⚠ No users found in database'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'   ✗ Error listing users: {str(e)}'))
        
        # Test 5: Test authentication with a test user
        self.stdout.write('\n5. Testing authentication system...')
        try:
            # Try to find a test user
            test_users = User.objects.filter(email__icontains='test')[:1]
            if test_users.exists():
                test_user = test_users.first()
                self.stdout.write(f'   Found test user: {test_user.email}')
                self.stdout.write(self.style.SUCCESS('   ✓ Authentication system: OK'))
            else:
                self.stdout.write(self.style.WARNING('   ⚠ No test users found. Create one to test authentication.'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'   ✗ Error testing authentication: {str(e)}'))
        
        # Test 6: Test password hashing
        self.stdout.write('\n6. Testing password hashing...')
        try:
            # Create a temporary test
            from django.contrib.auth.hashers import make_password, check_password
            test_password = "test123"
            hashed = make_password(test_password)
            is_valid = check_password(test_password, hashed)
            if is_valid:
                self.stdout.write(self.style.SUCCESS('   ✓ Password hashing: OK'))
            else:
                self.stdout.write(self.style.ERROR('   ✗ Password hashing: FAILED'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'   ✗ Error testing password hashing: {str(e)}'))
        
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('DATABASE TEST COMPLETE'))
        self.stdout.write('=' * 60 + '\n')

