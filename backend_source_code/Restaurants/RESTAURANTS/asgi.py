import os
from django.core.asgi import get_asgi_application

# Set Django settings module FIRST - before ANY imports
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')

# Initialize Django ASGI application FIRST - this loads all Django apps
django_asgi_app = get_asgi_application()

# NOW import Django-dependent modules AFTER get_asgi_application()
# get_asgi_application() already calls django.setup() internally
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from message import routing
from message.middleware import JWTAuthMiddleware, ProtocolAcceptMiddleware


application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": ProtocolAcceptMiddleware(
        AuthMiddlewareStack(
            JWTAuthMiddleware(
                URLRouter(routing.websocket_urlpatterns)
            )
        )
    ),
})