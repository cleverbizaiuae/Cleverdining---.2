# views.py
from rest_framework.viewsets import ModelViewSet
from rest_framework.response import Response
from rest_framework import status,permissions
from rest_framework.decorators import action
from django.utils import timezone
from .models import ChatMessage, UnreadCount
from django.db.models import Q
from .serializers import ChatMessageSerializer
from accounts.permissions import IsAllowedRole

class ChatMessageViewSet(ModelViewSet):
    queryset = ChatMessage.objects.all()
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # 1. Staff/User Authentication (Priority 1)
        user = self.request.user
        if user.is_authenticated:
            # Check role to differentiate between logged-in 'customer' (if any) and staff/owner
            if hasattr(user, 'role') and user.role in ['owner', 'staff', 'chef', 'manager']:
                 # Staff logic
                device_id = self.request.query_params.get('device_id')
                restaurant_id = self.request.query_params.get('restaurant_id')

                if self.action == 'list':
                    if device_id:
                        # Filter by device_id. The restaurant_id check is implicit via permission or can be explicit
                        # using device__restaurant_id to ensure the device belongs to the requested restaurant.
                        qs = queryset.filter(device_id=device_id)
                        if restaurant_id:
                            qs = qs.filter(device__restaurant_id=restaurant_id)
                        return qs.order_by('timestamp')
                    else:
                        # Maybe return all for restaurant? No, list requires filtering usually.
                        return queryset.none()
        
        # 2. Guest Session Token (Priority 2 - for Customers)
        try:
            session_token = self.request.headers.get('X-Guest-Session-Token')
            if session_token:
                from device.models import GuestSession
                try:
                    # Filter for active session, or just session by token
                    session = GuestSession.objects.filter(session_token=session_token, is_active=True).first()
                    if session:
                        # STRICT VALIDATION: Ensure we only return messages for the session's device
                        return queryset.filter(device=session.device).order_by('timestamp')
                    else:
                        return queryset.none()
                except Exception as e:
                    print(f"Guest Auth Error: {e}")
                    return queryset.none()
        except Exception as e:
            print(f"Queryset Error: {e}")
            return queryset.none()
        
        return queryset.none()
        
        return queryset.none()
    def perform_update(self, serializer):
        if self.get_object().sender != self.request.user:
            raise PermissionDenied("You can only update your own messages.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()
        if message.sender != request.user:
            raise PermissionDenied("You can only delete your own messages.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        device_id = request.query_params.get('device_id')
        user = request.user
        
        if not device_id:
            return Response({'error': 'device_id required'}, status=400)

        # Identify restaurant(s) for the user
        restaurant_ids = []
        if user.role == 'owner':
            restaurant_ids = list(user.restaurants.values_list('id', flat=True))
        elif user.role in ['staff', 'chef', 'manager']:
            from accounts.models import ChefStaff
            cs = ChefStaff.objects.filter(user=user).first()
            if cs:
                restaurant_ids = [cs.restaurant_id]
            else:
                from staff.models import Staff
                ls = Staff.objects.filter(user=user).first()
                if ls and ls.restaurant:
                    restaurant_ids = [ls.restaurant.id]
        
        if not restaurant_ids:
            return Response({'status': 'no access'}, status=403)

        # Logic: Mark unread messages FROM device TO restaurant as read
        updated_count = ChatMessage.objects.filter(
            device_id=device_id,
            restaurant_id__in=restaurant_ids,
            is_read=False,
            is_from_device=True
        ).update(is_read=True, read_at=timezone.now())
        
        # Update UnreadCount Model if exists
        # Better to just let the next fetch handle it or update naively
        # We can try to decrement, but bulk update makes it hard to know 'who' was decremented if multiple users?
        # Actually UnreadCount is per User.
        # We should update THIS user's unread count.
        
        try:
             unread_obj = UnreadCount.objects.get(user=user)
             if unread_obj.unread_count >= updated_count:
                 unread_obj.unread_count -= updated_count
                 unread_obj.save()
             else:
                 # Recalculate to be safe
                 pass 
        except UnreadCount.DoesNotExist:
             pass

        return Response({'status': 'marked all read', 'count': updated_count})

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        message = self.get_object()
        if not message.is_read:
            message.is_read = True
            message.read_at = timezone.now()
            message.save()
            
            # Decrement unread count for recipient
            try:
                unread_obj = UnreadCount.objects.get(user=message.receiver)
                if unread_obj.unread_count > 0:
                    unread_obj.unread_count -= 1
                    unread_obj.save()
            except UnreadCount.DoesNotExist:
                pass
                
        return Response({'status': 'marked as read'})

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response({'unread_count': 0})
            
        # Calculate unread messages from Customers (is_from_device=True) for this user's restaurant(s)
        restaurant_ids = []
        if user.role == 'owner':
            restaurant_ids = list(user.restaurants.values_list('id', flat=True))
        elif user.role in ['staff', 'chef', 'manager']:
            # Check ChefStaff
            from accounts.models import ChefStaff
             # Relaxed check as per order/views.py fix
            cs = ChefStaff.objects.filter(user=user).first()
            if cs:
                restaurant_ids = [cs.restaurant_id]
            else:
                 # Legacy Staff Fallback
                from staff.models import Staff
                ls = Staff.objects.filter(user=user).first()
                if ls and ls.restaurant:
                    restaurant_ids = [ls.restaurant.id]
        
        if not restaurant_ids:
             return Response({'unread_count': 0})

        # Logic: Unread messages FROM device TO restaurant
        # Use restaurant__id__in for safety
        count = ChatMessage.objects.filter(
            restaurant_id__in=restaurant_ids, 
            is_read=False, 
            is_from_device=True
        ).count()
        
        # Debugging
        if count == 0:
             print(f"DEBUG_UNREAD: User {user.email} (Restaurants: {restaurant_ids}) has 0 unread messages.")
        
        # Update or create the UnreadCount record (Optional/Legacy support)
        UnreadCount.objects.update_or_create(
            user=user,
            defaults={'unread_count': count, 'user_role': user.role}
        )
            
        return Response({'unread_count': count})
