from rest_framework.permissions import BasePermission,SAFE_METHODS

class IsAdminRole(BasePermission):
    """
    Allows access only to users with admin role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) == 'admin'


class IsSuperAdmin(BasePermission):
    """
    Restricts access to platform super admins (role=admin + Django superuser/staff).
    """

    def has_permission(self, request, view):
        user = request.user
        return (
            hasattr(user, "is_authenticated")
            and user.is_authenticated
            and getattr(user, "role", None) == "admin"
            and getattr(user, "is_staff", False)
            and getattr(user, "is_superuser", False)
        )
    


class IsOwnerRole(BasePermission):
    """
    Allows access only to users with owner role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) in ['owner', 'manager']
    


class IsChefRole(BasePermission):
    """
    Allows access only to users with chef role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) == 'chef'
    

class IsStaffRole(BasePermission):
    """
    Allows access only to users with staff role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) == 'staff'
    
    
    
class IsCustomerRole(BasePermission):
    """
    Allows access only to users with customer role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) == 'customer'
    


class IsChefOrStaff(BasePermission):
    def has_permission(self, request, view):
        role = getattr(request.user, 'role', None)
        return hasattr(request.user, 'is_authenticated') and request.user.is_authenticated and (
            role == 'chef' or role == 'staff'
        )
    

class IsAllowedRole(BasePermission):
    def has_permission(self, request, view):
        role = getattr(request.user, 'role', None)
        return hasattr(request.user, 'is_authenticated') and request.user.is_authenticated and (
            role in ['chef', 'staff', 'customer', 'owner']
        )
    



class IsAllowedRoleAndAdmin(BasePermission):
    """
    Custom permission:
    - Admin can do all actions (CRUD)
    - Other allowed roles (owner, chef, staff, customer) can only read
    - All other roles are denied
    """
    
    allowed_roles = ['admin', 'owner', 'chef', 'staff', 'customer']

    def has_permission(self, request, view):
        user = request.user
        
        # Must be authenticated
        if not (user and user.is_authenticated):
            return False

        role = getattr(user, 'role', None)
        if role not in self.allowed_roles:
            return False
        
        # Admin has full access
        if role == 'admin':
            return True

        # Others can only read
        return request.method in SAFE_METHODS
    




class IsOwnerORStaff(BasePermission):
    def has_permission(self, request, view):
        role = getattr(request.user, 'role', None)
        return hasattr(request.user, 'is_authenticated') and request.user.is_authenticated and (
            role == 'staff' or role == 'owner'
        )
    




class IsOwnerChefOrStaff(BasePermission):
    """
    Allows access only to users with role 'owner', 'chef', or 'staff'.
    """

    allowed_roles = ['owner', 'chef', 'staff', 'manager']

    def has_permission(self, request, view):
        user_role = getattr(request.user, 'role', None)
        print("Role:", user_role)
        return request.user.is_authenticated and user_role in self.allowed_roles