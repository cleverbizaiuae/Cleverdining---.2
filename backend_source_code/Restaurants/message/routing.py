from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Unified Chat Route: Connects to the Restaurant Room
    # Both Mobile (Guest) and Dashboard (Staff) connect here.
    # The Consumers.py logic determines which internal groups to join based on Token Scope.
    re_path(r'ws/chat/restaurant/(?P<restaurant_id>\d+)/$', consumers.ChatConsumer.as_asgi()),
    
    # Legacy Support (Temporary, to prevent instant breakage during migration)
    re_path(r'ws/chat/(?P<device_id>\d+)/$', consumers.ChatConsumer.as_asgi()),
    re_path(r'ws/call/(?P<device_id>\w+)/$', consumers.CallSignalConsumer.as_asgi()),
    re_path(r'ws/order/(?P<device_id>\d+)/$', consumers.OrderConsumer.as_asgi()),
    re_path(r'ws/alldatalive/(?P<restaurant_id>\d+)/$', consumers.RestaurantConsumer.as_asgi()),
    re_path(r'ws/calls/(?P<restaurant_id>\w+)/$', consumers.RestaurantCallConsumer.as_asgi()),
]
