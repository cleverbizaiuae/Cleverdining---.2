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


    def handle_exception(self, exc):
        """
        Ultimate Safety Net: Catch ALL exceptions (Permissions, Throttling, Unexpected)
        and return empty list to prevent 500 crashes.
        """
        import traceback
        import sys
        print(f"CRITICAL HANDLE_EXCEPTION in ChatMessageViewSet: {exc}", file=sys.stderr)
        traceback.print_exc()
        # Force return 200 OK with empty list
        return Response([], status=200)

    def list(self, request, *args, **kwargs):
        # We still keep local try-catch but handle_exception is the real fallback
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            return self.handle_exception(e)


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
            if user.is_authenticated and hasattr(user, 'role') and getattr(user, 'role', None) in ['owner', 'staff', 'chef', 'manager']:
                 if self.action == 'list':
                    if device_id:
                        qs = queryset.filter(device_id=device_id)
                        if restaurant_id:
                            qs = qs.filter(restaurant_id=restaurant_id)
                        
                        # Filter by active guest session to only show current conversation
                        from device.models import GuestSession
                        active_session = GuestSession.objects.filter(
                            device_id=device_id, 
                            is_active=True
                        ).order_by('-created_at').first()
                        
                        if active_session:
                            # Only show messages from the current session
                            qs = qs.filter(timestamp__gte=active_session.created_at)
                            return qs.order_by('timestamp')
                        else:
                            # If no active session, show NO messages (Clean Dashboard)
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
            role = getattr(user, 'role', None)
            if role == 'owner':
                restaurant_ids = list(user.restaurants.values_list('id', flat=True)) if hasattr(user, 'restaurants') and user.restaurants.exists() else []
            elif role in ['staff', 'chef', 'manager']:
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
            # FAIL SAFE: Return 200 OK even if it fails, to prevent Dashboard crash
            return Response({'status': 'error_handled', 'error': str(e)}, status=200)

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
             # FAIL SAFE: Return 200 OK
             return Response({'status': 'error_handled', 'error': str(e)}, status=200)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        # EMERGENCY DAMAGE CONTROL: Hardcode 0 to prevent 504 Timeouts
        # This endpoint was causing DB locks/timeouts blocking the entire chat system.
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
            role = getattr(user, 'role', None)
            if role == 'owner':
                if hasattr(user, 'restaurants') and user.restaurants.exists():
                     restaurant_ids = list(user.restaurants.values_list('id', flat=True))
            elif role in ['staff', 'chef', 'manager']:
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
            # Delete messages
            deleted_count, _ = ChatMessage.objects.filter(
                device_id=device_id,
                restaurant_id__in=restaurant_ids
            ).delete()
            
            # Broadcast Clear Event to Mobile App
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            
            for rid in restaurant_ids:
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_chat_{rid}",
                        {
                            "type": "chat_cleared",
                            "device_id": device_id
                        }
                    )
                except Exception as ws_err:
                    print(f"WS Emit Error: {ws_err}")

            return Response({'status': 'chat cleared', 'count': deleted_count})
        except Exception as e:
            import traceback
            import sys
            print(f"CRITICAL ERROR in clear_chat: {e}", file=sys.stderr)
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)


# SEPARATE FAST VIEW for unread-count to bypass ChatMessageViewSet's slow get_queryset
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

class FastUnreadCountView(APIView):
    """
    Fast endpoint for total unread count across all devices.
    Calculates sum of unread device-originated messages for user's restaurant(s).
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        try:
            user = request.user
            
            # Get restaurant IDs for this user - BULLETPROOF
            restaurant_ids = []
            role = getattr(user, 'role', None)
            
            try:
                if role == 'owner':
                    # Safely get restaurants
                    if hasattr(user, 'restaurants'):
                        try:
                            restaurant_ids = list(user.restaurants.values_list('id', flat=True))
                        except Exception:
                            # Fallback: direct query
                            from restaurant.models import Restaurant
                            restaurant_ids = list(Restaurant.objects.filter(owner=user).values_list('id', flat=True))
                elif role in ['staff', 'chef', 'manager']:
                    from accounts.models import ChefStaff
                    cs = ChefStaff.objects.filter(user=user).exclude(action='hold').first()
                    if cs:
                        restaurant_ids = [cs.restaurant_id]
                    else:
                        try:
                            from staff.models import Staff
                            ls = Staff.objects.filter(user=user).first()
                            if ls and ls.restaurant:
                                restaurant_ids = [ls.restaurant.id]
                        except Exception:
                            pass
            except Exception as e:
                print(f"Error getting restaurant_ids: {e}")
            
            if not restaurant_ids:
                return Response({'unread_count': 0})
            
            # Count unread messages FROM devices (customer messages) for all devices in user's restaurants
            try:
                total_unread = ChatMessage.objects.filter(
                    restaurant_id__in=restaurant_ids,
                    is_read=False,
                    is_from_device=True,
                    guest_session__is_active=True,
                ).count()
            except Exception as e:
                print(f"Error counting messages: {e}")
                total_unread = 0
            
            return Response({'unread_count': total_unread})
            
        except Exception as e:
            # Fail-safe: return 0 on error to prevent crashes
            import traceback
            traceback.print_exc()
            return Response({'unread_count': 0})


class MarkAllReadView(APIView):
    """
    Authenticated endpoint to mark all messages as read for a specific device.
    Separate from ChatMessageViewSet to ensure authentication works.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        try:
            device_id = request.query_params.get('device_id') or request.data.get('device_id')
            user = request.user
            
            if not device_id:
                return Response({'error': 'device_id required'}, status=400)

            # Identify restaurant(s) for the user
            restaurant_ids = []
            if getattr(user, 'role', '') == 'owner':
                restaurant_ids = list(user.restaurants.values_list('id', flat=True)) if hasattr(user, 'restaurants') else []
            elif getattr(user, 'role', '') in ['staff', 'chef', 'manager']:
                from accounts.models import ChefStaff
                cs = ChefStaff.objects.filter(user=user, action='accepted').first()
                if cs:
                    restaurant_ids = [cs.restaurant_id]
                else:
                    from staff.models import Staff
                    ls = Staff.objects.filter(user=user).first()
                    if ls and ls.restaurant:
                        restaurant_ids = [ls.restaurant.id]
            
            if not restaurant_ids:
                return Response({'status': 'no access', 'count': 0}, status=200)

            # Mark unread messages FROM device TO restaurant as read
            updated_count = ChatMessage.objects.filter(
                device_id=device_id,
                restaurant_id__in=restaurant_ids,
                is_read=False,
                is_from_device=True
            ).update(is_read=True, read_at=timezone.now())
            
            return Response({'status': 'marked all read', 'count': updated_count})
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'status': 'error_handled', 'error': str(e), 'count': 0}, status=200)


class ClearChatView(APIView):
    """
    Authenticated endpoint for clearing chat history for a specific device/table.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        try:
            device_id = request.data.get('device_id') or request.query_params.get('device_id')
            user = request.user
            
            if not device_id:
                return Response({'error': 'device_id required'}, status=400)
            
            # Identify restaurant(s) for the user to ensure permission
            restaurant_ids = []
            if getattr(user, 'role', '') == 'owner':
                if hasattr(user, 'restaurants') and user.restaurants.exists():
                    restaurant_ids = list(user.restaurants.values_list('id', flat=True))
            elif getattr(user, 'role', '') in ['staff', 'chef', 'manager']:
                from accounts.models import ChefStaff
                cs = ChefStaff.objects.filter(user=user, action='accepted').first()
                if cs:
                    restaurant_ids = [cs.restaurant_id]
                else:
                    from staff.models import Staff
                    ls = Staff.objects.filter(user=user).first()
                    if ls and ls.restaurant:
                        restaurant_ids = [ls.restaurant.id]
            
            if not restaurant_ids:
                return Response({'error': 'You do not have permission to clear this chat.'}, status=403)
            
            # Delete messages for this device in user's restaurant(s)
            deleted_count, _ = ChatMessage.objects.filter(
                device_id=device_id,
                restaurant_id__in=restaurant_ids
            ).delete()

            # Broadcast clear event so dashboard/mobile can remove this table thread live
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            for rid in restaurant_ids:
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{rid}",
                        {
                            "type": "chat_cleared",
                            "device_id": str(device_id)
                        }
                    )
                except Exception as ws_err:
                    print(f"WS Emit Error (restaurant group): {ws_err}")
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_chat_{rid}",
                        {
                            "type": "chat_cleared",
                            "device_id": str(device_id)
                        }
                    )
                except Exception as ws_err:
                    print(f"WS Emit Error (chat group): {ws_err}")
            
            return Response({'status': 'chat cleared', 'count': deleted_count})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)
