from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChatMessageViewSet, FastUnreadCountView, MarkAllReadView, ClearChatView

router = DefaultRouter()
router.register('chat', ChatMessageViewSet, basename='chatmessage')

urlpatterns = [
    # FAST unread-count route - BEFORE router to ensure it matches first
    path('chat/unread-count/', FastUnreadCountView.as_view(), name='fast-unread-count'),
    # Authenticated mark-all-read route - BEFORE router to ensure it matches first
    path('chat/mark-all-read/', MarkAllReadView.as_view(), name='mark-all-read'),
    # Authenticated clear-chat route - BEFORE router to ensure it matches first
    path('chat/clear-chat/', ClearChatView.as_view(), name='clear-chat'),
    path('', include(router.urls)),
]