from django.core.management.base import BaseCommand
from accounts.models import User


class Command(BaseCommand):
    help = 'Update admin user email to solomon@cleverbiz.ai'

    def handle(self, *args, **kwargs):
        self.stdout.write("=== Updating Admin User ===")
        
        try:
            # Find the existing admin user
            admin = User.objects.get(email="admin@cb.demo")
            
            # Update email
            admin.email = "solomon@cleverbiz.ai"
            admin.save()
            
            self.stdout.write(self.style.SUCCESS(f"✅ Admin email updated to: {admin.email}"))
            self.stdout.write(f"Username: {admin.username}")
            self.stdout.write(f"Password: password123 (unchanged)")
            
        except User.DoesNotExist:
            # If old admin doesn't exist, create new one
            admin, created = User.objects.get_or_create(
                email="solomon@cleverbiz.ai",
                defaults={
                    "username": "admin",
                    "role": "admin",
                    "is_staff": True,
                    "is_superuser": True
                }
            )
            if created:
                admin.set_password("password123")
                admin.save()
                self.stdout.write(self.style.SUCCESS(f"✅ New admin created: {admin.email}"))
            else:
                self.stdout.write(self.style.SUCCESS(f"✅ Admin already exists: {admin.email}"))
