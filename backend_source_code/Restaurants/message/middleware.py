from channels.middleware import BaseMiddleware
from accounts.models import User
from asgiref.sync import sync_to_async
from rest_framework_simplejwt.tokens import AccessToken
import jwt
from urllib.parse import parse_qs

class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        import sys
        print(f"DEBUG: JWTAuthMiddleware called. Query: {scope.get('query_string')}", file=sys.stderr)
        headers = dict(scope["headers"])
        # print(f"DEBUG: Headers: {headers}", file=sys.stderr) # Be careful with sensitive info
        token = None
        selected_protocol = None

        # Extract token from Sec-WebSocket-Protocol
        if b'sec-websocket-protocol' in headers:
            protocols = headers[b'sec-websocket-protocol'].decode().split(",")
            for protocol in protocols:
                protocol = protocol.strip()
                if protocol.startswith("Bearer "):
                    token = protocol.split("Bearer ")[1]
                    selected_protocol = f"Bearer {token}"
                    break


        if not token:
            query_string = scope.get("query_string", b"").decode()
            query_params = parse_qs(query_string)
            token_list = query_params.get("token")
            if token_list:
                token = token_list[0]


        if token:
            if token == "guest_token":
                print("DEBUG: Guest token detected. Assigning AnonymousUser.", file=sys.stderr)
                from django.contrib.auth.models import AnonymousUser
                scope["user"] = AnonymousUser()
            else:
                # Check for GuestSession first
                from device.models import GuestSession
                session = None
                try:
                    session = await sync_to_async(GuestSession.objects.get)(session_token=token, is_active=True)
                except GuestSession.DoesNotExist:
                    pass

                if session:
                    print(f"DEBUG: GuestSession found: {session.id}", file=sys.stderr)
                    from django.contrib.auth.models import AnonymousUser
                    scope["user"] = AnonymousUser()
                    scope["guest_session"] = session
                else:
                    # Fallback to User authentication
                    try:
                        print(f"DEBUG: Attempting to authenticate with token: {token[:10]}...", file=sys.stderr)
                        access_token = AccessToken(token)
                        print(f"DEBUG: Token valid. User ID: {access_token['user_id']}", file=sys.stderr)
                        user = await sync_to_async(User.objects.get)(id=access_token["user_id"])
                        print(f"DEBUG: User found: {user.username}", file=sys.stderr)
                        scope["user"] = user
                        
                        @sync_to_async
                        def get_user_info(user):
                            info = {
                                "id": user.id,
                                "username": user.username,
                                "email": user.email,
                                "role": getattr(user, "role", "unknown"),
                                "restaurants_id": None
                            }
                            if hasattr(user, "restaurants") and user.restaurants.exists():
                                info["restaurants_id"] = user.restaurants.first().id
                            return info

                        scope["user_info"] = await get_user_info(user)
                    except Exception as e:
                        print(f"DEBUG: Authentication failed: {e}", file=sys.stderr)
                        scope["user"] = None
        else:
            print("DEBUG: No token found in request")
            scope["user"] = None

        # Inject selected protocol into scope for returning in handshake
        scope["subprotocol"] = selected_protocol
        return await super().__call__(scope, receive, send)



class ProtocolAcceptMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        async def wrapped_send(message):
            if message["type"] == "websocket.accept" and "subprotocol" in scope and scope["subprotocol"]:
                message["subprotocol"] = scope["subprotocol"]
            await send(message)

        return await self.app(scope, receive, wrapped_send)

