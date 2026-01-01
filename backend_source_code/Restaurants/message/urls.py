from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChatMessageViewSet, FastUnreadCountView

router = DefaultRouter()
router.register('chat', ChatMessageViewSet, basename='chatmessage')

urlpatterns = [
    # FAST unread-count route - BEFORE router to ensure it matches first
    path('chat/unread-count/', FastUnreadCountView.as_view(), name='fast-unread-count'),
    path('', include(router.urls)),
]