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
            # Find staff member with matching email and role
            staff_member = Staff.objects.get(email=email, role=role)
        except Staff.DoesNotExist:
            return Response({'error': 'Invalid credentials or role.'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Verify password
        # Note: We assume password is plain text for now if not using setUserPassword, 
        # but standard practice is check_password with hashed value.
        # If user was created via Django Admin, password is in User model.
        # But here we added password to Staff model. 
        # For security, we should check use check_password if it's hashed, 
        # or simple comparison if testing (User request implies new custom password field).
        
        # Let's assume hashed for security
        if not check_password(password, staff_member.password):
             # Fallback check if it's plain text (during transition/testing)
            if password != staff_member.password:
                return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Generate Token
        # We can manually create a token for the associated User if it exists, or a custom token.
        # Best approach: Use SimpleJWT to generate token for the *User* linked to this Staff, 
        # OR if User is null (legacy), we might have an issue.
        # Let's assume we link to the User model for JWT generation if possible.
        
        user = staff_member.user
        if user:
            refresh = RefreshToken.for_user(user)
            # Add custom claims
            refresh['role'] = staff_member.role
            refresh['restaurant_id'] = staff_member.restaurant.id if staff_member.restaurant else None
            
            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'role': staff_member.role,
                'name': user.username, # Or add name field to Staff
                'restaurant_id': staff_member.restaurant.id
            }, status=status.HTTP_200_OK)
        else:
            # Fallback for staff without Django User (shim) - though model enforces OneToOne usually, we made it nullable.
            # If so, we can't easily use SimpleJWT standard User tokens.
            # For now, we return a mock token or fail.
             return Response({'error': 'System misconfiguration: Staff has no linked user.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
