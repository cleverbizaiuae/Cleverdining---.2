from django.core.management.base import BaseCommand
from accounts.models import User
from django.contrib.auth import authenticate

class Command(BaseCommand):
    help = 'Verify admin user exists and can authenticate'

    def handle(self, *args, **options):
        self.stdout.write("=== Verifying Admin Login ===")
        
        email = "solomon@cleverbiz.ai"
        password = "password123"
        
        try:
            user = User.objects.get(email=email)
            self.stdout.write(self.style.SUCCESS(f"✓ User found: {user.email}"))
            self.stdout.write(f"  • Username: {user.username}")
            self.stdout.write(f"  • Role: {user.role}")
            self.stdout.write(f"  • is_staff: {user.is_staff}")
            self.stdout.write(f"  • is_superuser: {user.is_superuser}")
            self.stdout.write(f"  • is_active: {user.is_active}")
            
            # Test password
            if user.check_password(password):
                self.stdout.write(self.style.SUCCESS(f"✓ Password verification: CORRECT"))
            else:
                self.stdout.write(self.style.ERROR(f"✗ Password verification: FAILED"))
                self.stdout.write(self.style.WARNING("Resetting password to 'password123'..."))
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.SUCCESS("✓ Password reset complete"))
            
            # Test authentication
            auth_user = authenticate(username=email, password=password)
            if auth_user:
                self.stdout.write(self.style.SUCCESS(f"✓ Authentication test: SUCCESS"))
            else:
                self.stdout.write(self.style.ERROR(f"✗ Authentication test: FAILED"))
                self.stdout.write(self.style.WARNING("This might be due to is_active=False or backend issue"))
            
            self.stdout.write("\n=== Login Credentials ===")
            self.stdout.write(self.style.SUCCESS(f"Email: {email}"))
            self.stdout.write(self.style.SUCCESS(f"Password: {password}"))
            
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"✗ User '{email}' NOT FOUND in database"))
            self.stdout.write(self.style.WARNING("Run 'python manage.py seed_database' to create the user"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Error: {e}"))

