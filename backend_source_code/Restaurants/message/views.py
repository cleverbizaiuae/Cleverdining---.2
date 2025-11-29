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
        device_id = self.request.query_params.get('device_id')
        restaurant_id = self.request.query_params.get('restaurant_id')

        if self.action == 'list':
            if device_id and restaurant_id:
                room_name = f"room_{device_id}_{restaurant_id}"
                return queryset.filter(room_name=room_name)
            else:
                return queryset.none()
        
        return queryset
    def perform_update(self, serializer):
        if self.get_object().sender != self.request.user:
            raise PermissionDenied("You can only update your own messages.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()
        if message.sender != request.user:
            raise PermissionDenied("You can only delete your own messages.")
        return super().destroy(request, *args, **kwargs)

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
        # Calculate directly from messages to ensure accuracy
        count = ChatMessage.objects.filter(receiver=user, is_read=False).count()
        
        # Update or create the UnreadCount record for consistency if needed elsewhere
        UnreadCount.objects.update_or_create(
            user=user,
            defaults={'unread_count': count, 'user_role': user.role}
        )
            
        return Response({'unread_count': count})
