from rest_framework.permissions import BasePermission,SAFE_METHODS

class IsAdminRole(BasePermission):
    """
    Allows access only to users with admin role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) == 'admin'
    


class IsOwnerRole(BasePermission):
    """
    Allows access only to users with owner role.
    """

    def has_permission(self, request, view):
        print("Role:", getattr(request.user, 'role', None))
        return request.user.is_authenticated and getattr(request.user, 'role', None) == 'owner'
    


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
        return hasattr(request.user, 'is_authenticated') and request.user.is_authenticated and (
            request.user.role == 'chef' or request.user.role == 'staff'
        )
    

class IsAllowedRole(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, 'is_authenticated') and request.user.is_authenticated and (
            request.user.role == 'chef' or request.user.role == 'staff' or request.user.role == 'customer' or request.user.role == 'owner'
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
        
        # Must be authenticated and must have a role
        if not (user and user.is_authenticated and hasattr(user, 'role')):
            return False

        if user.role not in self.allowed_roles:
            return False
        
        # Admin has full access
        if user.role == 'admin':
            return True

        # Others can only read
        return request.method in SAFE_METHODS
    




class IsOwnerORStaff(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, 'is_authenticated') and request.user.is_authenticated and (
            request.user.role == 'staff' or request.user.role == 'owner'
        )
    




class IsOwnerChefOrStaff(BasePermission):
    """
    Allows access only to users with role 'owner', 'chef', or 'staff'.
    """

    allowed_roles = ['owner', 'chef', 'staff']

    def has_permission(self, request, view):
        user_role = getattr(request.user, 'role', None)
        print("Role:", user_role)
        return request.user.is_authenticated and user_role in self.allowed_roles