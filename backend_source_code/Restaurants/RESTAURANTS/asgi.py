import os
import django
from django.core.asgi import get_asgi_application

# Set Django settings module FIRST
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'RESTAURANTS.settings')

# Initialize Django BEFORE any other imports
django.setup()

# Initialize Django ASGI application early to ensure apps are loaded
django_asgi_app = get_asgi_application()

# NOW import everything that depends on Django apps (AFTER django.setup())
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from message import routing
from message.middleware import JWTAuthMiddleware, ProtocolAcceptMiddleware


application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": ProtocolAcceptMiddleware(
        JWTAuthMiddleware(
            AuthMiddlewareStack(
                URLRouter(routing.websocket_urlpatterns)
            )
        )
    ),
})