from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import check_password
from .models import Staff
from rest_framework_simplejwt.tokens import RefreshToken

class AdminLoginView(APIView):
    authentication_classes = [] # Public access
    permission_classes = []

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        role = request.data.get('role')

        if not email or not password or not role:
            return Response({'error': 'Please provide email, password and role.'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalize role
        role = role.lower()
        if role not in ['manager', 'staff', 'chef']:
            return Response({'error': 'Invalid role selected.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # First try Legacy Staff model
            staff_member = Staff.objects.get(email=email, role=role)
            user = staff_member.user
            db_password = staff_member.password
            shop_id = staff_member.restaurant.id if staff_member.restaurant else None
        except Staff.DoesNotExist:
            # Fallback to ChefStaff model (New Standard)
            from accounts.models import ChefStaff
            try:
                # ChefStaff links User. Role is in User or handled via action='accepted'. 
                # But here we filter by email and role.
                # User model has role. 
                # We need to find a ChefStaff entry where user.email = email and user.role = role
                # AND action='accepted' (optional but recommended)
                chef_staff = ChefStaff.objects.get(user__email=email, user__role=role, action='accepted')
                staff_member = chef_staff
                user = chef_staff.user
                db_password = user.password # ChefStaff uses User password
                shop_id = chef_staff.restaurant.id
            except ChefStaff.DoesNotExist:
                 return Response({'error': 'Invalid credentials or role.'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Verify password
        # For ChefStaff, password is user.password (hashed).
        # For Staff, it might be plain text or hashed.
        
        if not check_password(password, db_password):
             # Fallback check if it's plain text (legacy Staff)
            if password != db_password:
                return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Generate Token
        if user:
            refresh = RefreshToken.for_user(user)
            # Add custom claims
            refresh['role'] = role
            refresh['restaurant_id'] = shop_id
            
            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'role': role,
                'name': user.username,
                'restaurant_id': shop_id
            }, status=status.HTTP_200_OK)
        else:
             return Response({'error': 'System misconfiguration: Staff has no linked user.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
