from django.core.management.base import BaseCommand
from accounts.models import User


class Command(BaseCommand):
    help = 'Fix admin user to have correct permissions for platform admin dashboard'

    def handle(self, *args, **kwargs):
        self.stdout.write("=== Fixing Admin User ===")
        
        try:
            admin = User.objects.get(email="solomon@cleverbiz.ai")
            
            # Set correct admin permissions
            admin.role = "admin"
            admin.is_staff = True
            admin.is_superuser = True
            admin.save()
            
            self.stdout.write(self.style.SUCCESS(f"✅ Admin user fixed!"))
            self.stdout.write(f"   Email: {admin.email}")
            self.stdout.write(f"   Role: {admin.role}")
            self.stdout.write(f"   is_staff: {admin.is_staff}")
            self.stdout.write(f"   is_superuser: {admin.is_superuser}")
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("This user can now access /admin dashboard"))
            
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR("❌ User solomon@cleverbiz.ai not found"))
            self.stdout.write("Run 'python manage.py seed_database' first")
