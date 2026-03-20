import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')
django.setup()

from accounts.models import User
from restaurant.models import Restaurant
from category.models import Category
from rest_framework.test import APIRequestFactory, force_authenticate
from category.views import SubCategoryViewSet
from rest_framework.request import Request

try:
    owner = User.objects.filter(role='owner').first()
    if not owner:
        print("No owner found")
    else:
        print(f"Testing with owner: {owner.email}")
        
        # ensure there's a category
        restaurant = owner.restaurants.first()
        parent_category = Category.objects.filter(restaurant=restaurant, level=0).first()
        if not parent_category:
            parent_category = Category.objects.create(Category_name='Test Parent Cat', restaurant=restaurant)
            print(f"Created parent category: {parent_category.id}")
        
        print(f"Parent Category ID: {parent_category.id}, level: {parent_category.level}")
        
        factory = APIRequestFactory()
        data = {
            'Category_name': 'Test Sub Cat 1',
            'parent_category': parent_category.id
        }
        request = factory.post('/owners/sub-categories/', data, format='multipart')
        force_authenticate(request, user=owner)
        
        view = SubCategoryViewSet.as_view({'post': 'create'})
        response = view(request)
        print(f"Create Status: {response.status_code}")
        print(f"Create Data: {response.data}")
        
        if response.status_code == 201:
            sub_id = response.data.get('id')
            sub = Category.objects.get(id=sub_id)
            print(f"DB Record: ID={sub.id}, Parent={sub.parent_category_id}, Level={sub.level}, Restaurant={sub.restaurant_id}")
            
            # Now test get_queryset logic
            qs = Category.objects.filter(restaurant__owner=owner, level__gt=0)
            print(f"Queryset matches: {[c.Category_name for c in qs]}")
            
except Exception as e:
    import traceback
    traceback.print_exc()

