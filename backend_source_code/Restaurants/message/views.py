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

    def get_authenticators(self):
        # EMERGENCY BYPASS: Disable Authentication for unread_count to prevent DB Lock/Timeout
        if self.action == 'unread_count':
            return []
        return super().get_authenticators()

    def get_queryset(self):
        try:
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
                            # Filter by device_id.
                            qs = queryset.filter(device_id=device_id)
                            if restaurant_id:
                                # Use direct restaurant_id field on ChatMessage instead of device__restaurant_id
                                # This ensures we find messages saved for this restaurant even if device relationship is complex/stale
                                qs = qs.filter(restaurant_id=restaurant_id)
                            return qs.order_by('timestamp')
                        else:
                            # Maybe return all for restaurant? No, list requires filtering usually.
                            return queryset.none()
            
            # 2. Guest Session Token (Priority 2 - for Customers)
            session_token = self.request.headers.get('X-Guest-Session-Token')
            # print(f"DEBUG: Fetching messages with token: {session_token}")
            if session_token:
                from device.models import GuestSession
                try:
                    # Filter for active session, or just session by token
                    # We remove is_active=True to allow viewing valid history even if session is technically 'closed'
                    session = GuestSession.objects.filter(session_token=session_token).first()
                    if session:
                        # ROBUST FETCH: Instead of relying solely on the 'guest_session' FK (which might be missing on Staff replies),
                        # we fetch all messages for this DEVICE that occurred AFTER the session started.
                        # This ensures the guest sees the entire conversation context for their current sitting.
                        
                        # Logic: Device ID match AND (Linked to Session OR (Timestamp >= Session Start))
                        from django.db.models import Q
                        qs = queryset.filter(
                            Q(guest_session=session) | 
                            Q(device=session.device, timestamp__gte=session.created_at)
                        ).order_by('timestamp')
                        
                        # print(f"DEBUG: Found session {session.id}. Fetching by Device {session.device.id} since {session.created_at}. Count: {qs.count()}")
                        return qs
                    else:
                        print(f"DEBUG: Session not found for token: {session_token}")
                        return queryset.none()
                except Exception as e:
                    print(f"Guest Auth Error: {e}")
                    return queryset.none()
            else:
                 # print("DEBUG: No X-Guest-Session-Token header provided.")
                 pass
                 
            # Force evaluation to catch DB execution errors here
            # access one item to trigger DB
            if qs.exists():
                pass
                
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
        # DOUBLE CHECK: If override didn't work, ensure we return 0 fast.
        return Response({'unread_count': 0})
        
        # Dead code below
        user = request.user
        if not user.is_authenticated:
            return Response({'unread_count': 0})
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
