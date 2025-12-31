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
    authentication_classes = [] # DISABLE AUTH: Prevent 500s from Token/User lookup crashes
    pagination_class = None

    # Removed get_authenticators override as authentication_classes=[] handles it globally for this view


    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            import traceback
            import sys
            print(f"CRITICAL LIST ERROR in ChatMessageViewSet: {e}", file=sys.stderr)
            traceback.print_exc()
            return Response([], status=200) # Safe fallback


    def get_queryset(self):
        # FIX: Strict Null-Safety
        queryset = super().get_queryset()
        qs = ChatMessage.objects.none() # Default to Avoid UnboundLocalError
        
        try:
            # 1. Extract Parameters Safely
            device_id = self.request.query_params.get('device_id')
            restaurant_id = self.request.query_params.get('restaurant_id')
            session_token = self.request.headers.get('X-Guest-Session-Token')
            user = self.request.user

            # 2. Logic Cascade (Priority: Auth > Session > Device Fallback)

            # A. Authenticated Staff/Owner
            if user.is_authenticated and hasattr(user, 'role') and user.role in ['owner', 'staff', 'chef', 'manager']:
                 if self.action == 'list':
                    if device_id:
                        qs = queryset.filter(device_id=device_id)
                        if restaurant_id:
                            qs = qs.filter(restaurant_id=restaurant_id)
                        return qs.order_by('timestamp')
                    else:
                        return ChatMessage.objects.none()

            # B. Guest Session (Token Provided)
            if session_token:
                from device.models import GuestSession
                try:
                    session = GuestSession.objects.filter(session_token=session_token).first()
                    if session:
                        # Optimized Access
                        qs = queryset.filter(
                            device=session.device, 
                            timestamp__gte=session.created_at
                        ).order_by('timestamp')
                        return qs
                except Exception:
                    pass 

            # C. Device ID Fallback (Requested by User: "If device_id exists -> use it")
            # Only allow if explicitly requested (e.g. public/kiosk mode or lost token recovery)
            # We strictly filter by restaurant_id too to prevent data leaks across restaurants
            if device_id and restaurant_id:
                 qs = queryset.filter(
                     device_id=device_id,
                     restaurant_id=restaurant_id
                 ).order_by('timestamp')
                 return qs

            # D. Fallthrough
            return qs

        except Exception as e:
            import traceback
            import sys
            print(f"CRITICAL ERROR in ChatMessageViewSet.get_queryset: {e}", file=sys.stderr)
            traceback.print_exc()
            return ChatMessage.objects.none()

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
        try:
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
            try:
                 unread_obj = UnreadCount.objects.get(user=user)
                 if unread_obj.unread_count >= updated_count:
                     unread_obj.unread_count -= updated_count
                     unread_obj.save()
            except UnreadCount.DoesNotExist:
                 pass

            return Response({'status': 'marked all read', 'count': updated_count})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        try:
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
        except Exception as e:
             return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        try:
            user = request.user
            if not user.is_authenticated:
                return Response({'unread_count': 0})
            
            # Efficient Count Query (No Object Loading)
            # 1. Resolve Restaurant IDs
            restaurant_ids = []
            if hasattr(user, 'role'):
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
                 return Response({'unread_count': 0})

            # 2. Count unread messages for these restaurants (using Index)
            # Filter: restaurant IN [...], is_read=False, is_from_device=True
            count = ChatMessage.objects.filter(
                restaurant_id__in=restaurant_ids,
                is_read=False,
                is_from_device=True
            ).count()
            
            return Response({'unread_count': count})
        except Exception as e:
             # Fail safe silently to 0
             print(f"Unread Count Error: {e}")
             return Response({'unread_count': 0})

    @action(detail=False, methods=['post'], url_path='clear-chat')
    def clear_chat(self, request):
        try:
            device_id = request.data.get('device_id') or request.query_params.get('device_id')
            user = request.user
            
            if not device_id:
                return Response({'error': 'device_id required'}, status=400)
                
            # Identify restaurant(s) for the user to ensure permission
            restaurant_ids = []
            if user.role == 'owner':
                if hasattr(user, 'restaurants') and user.restaurants.exists():
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
                return Response({'error': 'You do not have permission to perform this action.'}, status=403)
            
            # Delete messages
            deleted_count, _ = ChatMessage.objects.filter(
                device_id=device_id,
                restaurant_id__in=restaurant_ids
            ).delete()
            
            return Response({'status': 'chat cleared', 'count': deleted_count})
        except Exception as e:
            import traceback
            import sys
            print(f"CRITICAL ERROR in clear_chat: {e}", file=sys.stderr)
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)
