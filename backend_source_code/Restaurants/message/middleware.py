from channels.middleware import BaseMiddleware
from accounts.models import User
from asgiref.sync import sync_to_async
from rest_framework_simplejwt.tokens import AccessToken
import jwt
from urllib.parse import parse_qs

class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        headers = dict(scope["headers"])
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
            try:
                access_token = AccessToken(token)
                user = await sync_to_async(User.objects.get)(id=access_token["user_id"])
                scope["user"] = user
                scope["user_info"] = access_token["user"]
            except Exception as e:
                scope["user"] = None
        else:
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

