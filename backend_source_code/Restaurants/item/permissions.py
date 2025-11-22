from rest_framework.permissions import BasePermission
from accounts.models import ChefStaff

class IsStafforChefOfRestaurant(BasePermission):
    def has_object_permission(self, request, view, obj):
        try:
            chef_staff = ChefStaff.objects.get(user=request.user, restaurant=obj.restaurant)
            return True
        except ChefStaff.DoesNotExist:
            return False