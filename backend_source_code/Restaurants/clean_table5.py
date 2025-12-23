import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')
django.setup()

from device.models import Device

# Find device with name containing "Table 5" or "table 5"
devices = Device.objects.filter(table_name__icontains="Table 5")
print(f"Found {devices.count()} devices matching 'Table 5'")

for d in devices:
    print(f"Deleting Device: {d.table_name} (ID: {d.id}, Restaurant: {d.restaurant.resturent_name})")
    d.delete()
    
# Also check for GuestSessions
from device.models import GuestSession
# sessions = GuestSession.objects.filter(device__table_name__icontains="Table 5") # Device already deleted cascade?
# Check orphaned sessions if any?
print("Done.")
