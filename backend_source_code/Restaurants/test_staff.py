import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')
django.setup()

from accounts.models import User
from restaurant.models import Restaurant
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.views import ChefStaffViewSet
from rest_framework.request import Request
from django.core.files.uploadedfile import SimpleUploadedFile

try:
    owner = User.objects.filter(role='owner').first()
    if not owner:
        print("No owner found")
    else:
        print(f"Testing with owner: {owner.email}")
        factory = APIRequestFactory()
        data = {
            'first_name': 'Test',
            'last_name': 'Staff',
            'email': 'teststaffnew2@example.com',
            'username': 'teststaffnew2@example.com',
            'password': 'password123',
            'role': 'staff'
        }
        request = factory.post('/owners/chef-staff/', data, format='multipart')
        force_authenticate(request, user=owner)
        
        view = ChefStaffViewSet.as_view({'post': 'create'})
        response = view(request)
        print(f"Status: {response.status_code}")
        print(f"Data: {response.data}")
except Exception as e:
    import traceback
    traceback.print_exc()
