import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from message.models import ChatMessage
from restaurant.models import Restaurant
from device.models import Device
from accounts.models import User
import logging
from .models import CallSession
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from order.models import Order
from accounts.models import ChefStaff
from django.utils import timezone
from datetime import timedelta



logger = logging.getLogger(__name__)

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            # SINGLE DELIVERY ROOM ARCHITECTURE
            # All users (Guest, Owner, Staff) join ONE room per restaurant.
            # Routing is handled by the payload, filtered by the client.
            
            # 1. Host Resolution (Robust)
            self.restaurant_id_kwarg = self.scope['url_route']['kwargs'].get('restaurant_id')
            self.user = self.scope.get('user')
            if not self.user:
                from django.contrib.auth.models import AnonymousUser
                self.user = AnonymousUser()

            self.guest_session = self.scope.get('guest_session')
            self.user_info = self.scope.get('user_info', {})
            
            self.restaurant_id = self.restaurant_id_kwarg
            if not self.restaurant_id:
                 self.restaurant_id = self.user_info.get('restaurants_id')
                 if not self.restaurant_id:
                    from urllib.parse import parse_qs
                    query_string = self.scope.get('query_string', b'').decode()
                    query_params = parse_qs(query_string)
                    self.restaurant_id = query_params.get('restaurant_id', [None])[0]

            if not self.restaurant_id:
                 print("DEBUG: Connection Rejected - No Restaurant ID")
                 await self.close(code=4002)
                 return
            self.restaurant_id = str(self.restaurant_id)
            
            # 2. Universal Room Name
            self.my_group = f"restaurant_chat_{self.restaurant_id}"
            
            # 3. Context Metadata (for message saving, NOT routing)
            if self.guest_session:
                 self.is_guest = True
                 self.device_id = str(self.guest_session.device_id)
                 self.session_id = str(self.guest_session.id)
                 print(f"DEBUG: Guest Joined Shared Room: {self.my_group}")
            elif self.user and self.user.is_authenticated:
                 self.is_guest = False
                 self.device_id = None
                 print(f"DEBUG: Staff Joined Shared Room: {self.my_group}")
            else:
                 # Allow anonymous connection if we have restaurant_id? 
                 # User says "Resolve restaurant_id first and only".
                 # We'll allow it but mark as Guest/Unknown if missing auth
                 self.is_guest = True # Assume guest if not staff
                 self.device_id = None # Will resolve from payload if provided
                 print(f"DEBUG: Unknown User Joined Shared Room: {self.my_group}")

            # 4. Join The One True Room
            await self.channel_layer.group_add(self.my_group, self.channel_name)
            await self.accept()

        except Exception as e:
            print(f"CRITICAL: Exception in ChatConsumer.connect: {e}")
            import traceback
            traceback.print_exc()
            await self.close(code=4000)

    async def disconnect(self, close_code):
        if hasattr(self, 'my_group'):
            await self.channel_layer.group_discard(self.my_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message = data.get('message')
            message_type = data.get('type', 'message')  # Capture message type (e.g., 'alert')
            if not message: return
            
            # Prepare Payload
            timestamp = str(timezone.now())
            
            if self.is_guest:
                sender_name = f"Table {self.guest_session.device_id}" if hasattr(self, 'guest_session') and self.guest_session else "Guest"
                is_from_device = True
                device_id = self.device_id
                guest_session_id = self.guest_session.id if hasattr(self, 'guest_session') and self.guest_session else None
                
                # Save (wrapped - don't let save failure block broadcast)
                try:
                    await self._save_message(
                        sender=None, 
                        receiver=None, 
                        message=message, 
                        device_id=device_id, 
                        restaurant_id=self.restaurant_id, 
                        is_from_device=True, 
                        room_name=self.my_group, 
                        guest_session=self.guest_session
                    )
                except Exception as save_err:
                    logger.warning(f"Guest message save failed (will still broadcast): {save_err}")
            else:
                sender_name = self.user.username if self.user else "Staff"
                is_from_device = False
                
                # Staff sends target context: prefer session, fallback to direct device_id
                target_session_id = data.get('guest_session_id')
                target_device_id = data.get('device_id')  # Accept device_id directly
                target_guest_session = None
                
                if target_session_id:
                    target_guest_session = await self._get_guest_session_by_id(target_session_id)
                    if target_guest_session:
                        target_device_id = target_guest_session.device_id
                
                # Fallback: If no session but device_id provided, resolve session from device
                if not target_guest_session and target_device_id:
                    target_guest_session = await self._get_active_session_for_device(target_device_id)
                
                guest_session_id = target_session_id
                device_id = target_device_id  # Use resolved or direct device_id
                
                # Save (wrapped - don't let save failure block broadcast)
                try:
                    await self._save_message(
                        sender=self.user, 
                        receiver=None, 
                        message=message, 
                        device_id=target_device_id,
                        restaurant_id=self.restaurant_id, 
                        is_from_device=False, 
                        room_name=self.my_group, 
                        guest_session=target_guest_session
                    )
                except Exception as save_err:
                    logger.warning(f"Staff message save failed (will still broadcast): {save_err}")

            # BROADCAST TO CHAT ROOM (for chat page)
            await self.channel_layer.group_send(
                self.my_group,
                {
                    'type': 'chat_message',
                    'message': message,
                    'message_type': message_type,  # Include alert type
                    'sender': sender_name,
                    'is_from_device': is_from_device,
                    'device_id': device_id, # Crucial for client-side filtering
                    'guest_session_id': guest_session_id,
                    'timestamp': timestamp
                }
            )
            
            # ALSO BROADCAST TO RESTAURANT GROUP (for sidebar badge in Dashboard)
            await self.channel_layer.group_send(
                f"restaurant_{self.restaurant_id}",
                {
                    'type': 'chat_message',
                    'message': message,
                    'message_type': message_type,  # Include alert type
                    'sender': sender_name,
                    'is_from_device': is_from_device,
                    'device_id': device_id,
                    'guest_session_id': guest_session_id,
                    'timestamp': timestamp
                }
            )

        except Exception as e:
            logger.error(f"ChatConsumer Error: {e}", exc_info=True)
            await self.send(text_data=json.dumps({"error": f"Error: {str(e)}"}))

    async def chat_message(self, event):
        # Unified Handler: Just push whatever comes to the socket
        await self.send(text_data=json.dumps(event))

    async def session_closed(self, event):
        # Forward the target metadata so shared restaurant-room clients can
        # ignore close events for other tables/sessions.
        await self.send(text_data=json.dumps({
            "type": "session_closed",
            "message": event.get("message", "Session ended"),
            "session_id": event.get("session_id"),
            "guest_session_id": event.get("guest_session_id") or event.get("session_id"),
            "table_id": event.get("table_id") or event.get("device_id"),
            "device_id": event.get("device_id") or event.get("table_id"),
            "reason": event.get("reason"),
        }))

    async def chat_cleared(self, event):
        await self.send(text_data=json.dumps(event))

    @database_sync_to_async
    def _save_message(self, sender, receiver, message, device_id, restaurant_id, is_from_device,room_name, guest_session=None):
        try:
            device = Device.objects.get(id=device_id)
        except Device.DoesNotExist:
            logger.warning(f"Device with ID {device_id} does not exist.")
            return None

        # If sender is None (guest) or anonymous, use the device's user
        if sender is None or (hasattr(sender, 'is_anonymous') and sender.is_anonymous):
            sender = device.user

        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist:
            logger.warning(f"Restaurant with ID {restaurant_id} does not exist.")
            return None

        # CRITICAL FIX: If guest_session is None (e.g. Staff reply, or fallback), try to find the ACTIVE session for this device
        # This ensures messages are linked to the current conversation context so they appear in history fetches.
        if not guest_session:
            from device.models import GuestSession
            try:
                # 1. Try to find the most recent ACTIVE session
                active_session = GuestSession.objects.filter(device=device, is_active=True).order_by('-created_at').first()
                if active_session:
                    guest_session = active_session
                    print(f"DEBUG: Auto-linked message to Active GuestSession: {guest_session.id}")
                else:
                    # 2. Fallback: Find the LATEST session (even if inactive) to capture messages for closed/expired sessions
                    # This handles cases where the session expired but the user is still viewing the chat.
                    latest_session = GuestSession.objects.filter(device=device).order_by('-created_at').first()
                    if latest_session:
                        guest_session = latest_session
                        print(f"DEBUG: Auto-linked message to Latest (Inactive?) GuestSession: {guest_session.id}")
                    else:
                        print(f"DEBUG: No GuestSession found for Device {device.id}. Message will be unlinked.")
            except Exception as e:
                print(f"Error resolving active session: {e}")

        try:
            msg = ChatMessage.objects.create(
                sender=sender,
                receiver=receiver,
                message=message,
                device=device,
                restaurant=restaurant,
                is_from_device=is_from_device,
                room_name=room_name,
                new_message=True,
                business_day=restaurant.business_days.filter(is_active=True).last(), # Link to active business day
                guest_session=guest_session # Link to specific session
            )
        except Exception as e:
            # Fallback: If creation fails (e.g. IntegrityError due to invalid guest_session), retry without session
            print(f"WARNING: Failed to save message with session {getattr(guest_session, 'id', 'None')}. Retrying without session. Error: {e}")
            msg = ChatMessage.objects.create(
                sender=sender,
                receiver=receiver,
                message=message,
                device=device,
                restaurant=restaurant,
                is_from_device=is_from_device,
                room_name=room_name,
                new_message=True,
                business_day=restaurant.business_days.filter(is_active=True).last(), 
                guest_session=None # Detach stale session
            )
        # Attach username explicitly while we are in sync context to prevent Async/LazyLoading errs
        msg.safe_sender_username = sender.username if sender else "Unknown"
        return msg

    @database_sync_to_async
    def _get_restaurant_owner(self, restaurant_id):
        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
            return restaurant.owner
        except Restaurant.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_guest_session(self, token):
        from device.models import GuestSession
        try:
            # Try to get active first
            session = GuestSession.objects.filter(session_token=token, is_active=True).first()
            if session: return session
            # Fallback: get any session (maybe it expired just now?)
            return GuestSession.objects.filter(session_token=token).first()
        except Exception:
            return None

    @database_sync_to_async
    def _get_guest_session_by_id(self, session_id):
        from device.models import GuestSession
        try:
            return GuestSession.objects.get(id=session_id)
        except Exception:
            return None

    @database_sync_to_async
    def _get_active_session_for_device(self, device_id):
        """Resolve the active (or latest) guest session for a given device_id."""
        from device.models import GuestSession
        try:
            # Try active first
            session = GuestSession.objects.filter(device_id=device_id, is_active=True).order_by('-created_at').first()
            if session:
                return session
            # Fallback to latest inactive
            return GuestSession.objects.filter(device_id=device_id).order_by('-created_at').first()
        except Exception:
            return None

    # --- Item Event Handlers for Real-time Menu via Chat Socket ---
    async def item_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "item_created",
            "item": event["item"]
        }))

    async def item_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "item_updated",
            "item": event["item"]
        }))

    async def item_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "item_deleted",
            "item_id": event["item_id"]
        }))


    @database_sync_to_async
    def _get_device_user(self, device_id):
        try:
            device = Device.objects.get(id=device_id)
            return device.user
        except Device.DoesNotExist:
            logger.warning(f"Device not found when fetching user. Device ID: {device_id}")
            return None
        



logger = logging.getLogger(__name__)


class CallSignalConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.device_id = self.scope['url_route']['kwargs']['device_id']
        self.user = self.scope['user']
        self.user_info = self.scope.get('user_info', {})
        self.group_name = f"call_room_{self.device_id}_{self.user_info.get('restaurants_id')}"


        if self.user and self.user.is_authenticated:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()
            logger.debug(f"User {self.user.username} connected to {self.group_name}")
        else:
            await self.close()


    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        
        # End existing calls if user is present
        if self.user:
            await self.end_existing_calls(self.user.id)


    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
            action = data.get("action")
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid JSON"}))
            return


        if action == "start_call":
            await self.handle_start_call(data)
        elif action == "accept_call":
            await self.handle_accept_call(data)
        elif action == "end_call":
            await self.handle_end_call(data)
        else:
            await self.send(text_data=json.dumps({"error": "Invalid action"}))


    async def call_message(self, event):
        await self.send(text_data=event['message'])


    async def handle_start_call(self, data):
        receiver_id = data.get("receiver_id")
        device_id = data.get("device_id")
        restaurant_id = self.user_info.get('restaurants_id')


        if not (receiver_id and device_id and restaurant_id):
            await self.send(text_data=json.dumps({"error": "Missing receiver_id, device_id, or restaurant_id"}))
            return


        # End any existing active calls for the caller
        await self.end_existing_calls(self.user.id)


        # Create a new call session
        call_session = await self.create_call_session(self.user.id, receiver_id, device_id)
        if not call_session:
            await self.send(text_data=json.dumps({"error": "Failed to create call session"}))
            return


        # Broadcast incoming call to the group
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'call_message',
                'message': json.dumps({
                    "action": "incoming_call",
                    "from": self.user.username,
                    "call_id": call_session.id,
                    "device_id": device_id,
                    "restaurant_id": restaurant_id
                })
            }
        )


    async def handle_accept_call(self, data):
        call_id = data.get("call_id")
        device_id = data.get("device_id")
        if not call_id:
            await self.send(text_data=json.dumps({"error": "Missing call_id"}))
            return


        call_session = await self.get_call_session(call_id)
        if not call_session or not call_session.is_active:
            await self.send(text_data=json.dumps({"error": "Invalid or inactive call"}))
            return


        # Broadcast call accepted to the group
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'call_message',
                'message': json.dumps({
                    "action": "call_accepted",
                    "from": self.user.username,
                    "call_id": call_id,
                    "device_id": device_id,
                })
            }
        )


    async def handle_end_call(self, data):
        call_id = data.get("call_id")
        if call_id:
            call_session = await self.get_call_session(call_id)
            if call_session and call_session.is_active:
                await self.end_call_session(call_session.id)


        # End all active calls for the user as a fallback
        await self.end_existing_calls(self.user.id)


        # Broadcast call ended to the group
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'call_message',
                'message': json.dumps({
                    "action": "call_ended",
                    "by": self.user.username
                })
            }
        )


    @database_sync_to_async
    def create_call_session(self, caller_id, receiver_id, device_id):
        try:
            caller = User.objects.get(id=caller_id)
            receiver = User.objects.get(id=receiver_id)
            device = Device.objects.get(id=device_id)
            return CallSession.objects.create(caller=caller, receiver=receiver, device=device)
        except Exception as e:
            logger.exception(f"Error creating call session: {str(e)}")
            return None


    @database_sync_to_async
    def get_call_session(self, call_id):
        try:
            return CallSession.objects.get(id=call_id)
        except CallSession.DoesNotExist:
            logger.warning(f"Call session with ID {call_id} does not exist.")
            return None


    @database_sync_to_async
    def end_existing_calls(self, user_id):
        active_calls = CallSession.objects.filter(caller_id=user_id, is_active=True)
        for call in active_calls:
            call.end_call()


    @database_sync_to_async
    def end_call_session(self, call_id):
        try:
            call = CallSession.objects.get(id=call_id, is_active=True)
            call.end_call()
        except CallSession.DoesNotExist:
            logger.warning(f"Call session with ID {call_id} does not exist or is already inactive.")





class OrderConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        import sys
        # Retrieve device id from the URL
        self.device_id = self.scope['url_route']['kwargs']['device_id']
        self.room_group_name = f'device_{self.device_id}'
        
        print(f"[ORDER-WS] CONNECT attempt | device_id={self.device_id} | group={self.room_group_name}", file=sys.stderr)
        
        # Check for guest session
        self.guest_session = self.scope.get('guest_session')
        self.session_group_name = None

        # Strict Isolation: Require valid guest session for this table
        if self.guest_session:
            # Verify session belongs to this device/table
            if str(self.guest_session.device.id) != str(self.device_id):
                print(f"[ORDER-WS] REJECTED - device mismatch | session_device={self.guest_session.device.id} requested_device={self.device_id}", file=sys.stderr)
                await self.close(code=4003) # Forbidden
                return

            self.session_group_name = f'session_{self.guest_session.id}'
            print(f"[ORDER-WS] Guest session OK | session_id={self.guest_session.id} | joining groups: [{self.room_group_name}, {self.session_group_name}]", file=sys.stderr)
            
            await self.channel_layer.group_add(
                self.session_group_name,
                self.channel_name
            )
            
            # Join the shared table group (authorized)
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.accept()
            print(f"[ORDER-WS] ACCEPTED guest | device={self.device_id} | channel={self.channel_name[:20]}...", file=sys.stderr)
            
        elif self.scope.get("user") and self.scope["user"].is_authenticated:
             # Allow staff/admin to join table group
             await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
             )
             await self.accept()
             print(f"[ORDER-WS] ACCEPTED staff/admin | device={self.device_id} | user={self.scope['user']}", file=sys.stderr)
        else:
            # Reject unauthenticated connections
            print(f"[ORDER-WS] REJECTED - no auth | device={self.device_id} | user={self.scope.get('user')}", file=sys.stderr)
            await self.close(code=4001) # Unauthorized

    async def disconnect(self, close_code):
        import sys
        print(f"[ORDER-WS] DISCONNECT | device={self.device_id} | code={close_code}", file=sys.stderr)
        # Leave the WebSocket group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        if self.session_group_name:
            await self.channel_layer.group_discard(
                self.session_group_name,
                self.channel_name
            )

    # Receive message from the group
    async def order_status_update(self, event):
        import sys
        order_id = event.get('order_id')
        status = event.get('status')
        print(f"[ORDER-WS] >>> FORWARDING order_status_update | order={order_id} status={status} → client device={self.device_id}", file=sys.stderr)

        # Send the status update to WebSocket
        response = {
            'order_id': order_id,
            'status': status,
            'type': 'order_status_update',  # Explicit type for frontend routing
        }
        if 'session_ended' in event:
            response['session_ended'] = event['session_ended']
        if 'bulk' in event:
            response['bulk'] = event['bulk']
            
        await self.send(text_data=json.dumps(response))
        print(f"[ORDER-WS] >>> SENT to client | payload={response}", file=sys.stderr)

    # Forward order_updated events (sent when dashboard updates status)
    async def order_updated(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING order_updated → client device={self.device_id}", file=sys.stderr)
        await self.send(text_data=json.dumps({
            'type': 'order_updated',
            'order': event.get('order', {}),
        }))

    # Forward order_created events (sent when new order is placed)
    async def order_created(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING order_created → client device={self.device_id}", file=sys.stderr)
        await self.send(text_data=json.dumps({
            'type': 'order_created',
            'order': event.get('order', {}),
        }))

    # Forward payment status updates
    async def payment_status_update(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING payment_status_update | order={event.get('order_id')} → client device={self.device_id}", file=sys.stderr)
        await self.send(text_data=json.dumps({
            'type': 'payment_status_update',
            'order_id': event.get('order_id'),
            'payment_status': event.get('payment_status', ''),
        }))

    # Forward order_paid events
    async def order_paid(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING order_paid → client device={self.device_id}", file=sys.stderr)
        await self.send(text_data=json.dumps({
            'type': 'payment_status_update',
            'order': event.get('order', {}),
        }))

    # Forward cash payment alerts
    async def cash_payment_alert(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING cash_payment_alert → client device={self.device_id}", file=sys.stderr)
        await self.send(text_data=json.dumps({
            'type': 'order_updated',
            'order': event.get('order', {}),
        }))

    # Forward cash payment confirmed
    async def cash_payment_confirmed(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING cash_payment_confirmed | order={event.get('order_id')} → client device={self.device_id}", file=sys.stderr)
        await self.send(text_data=json.dumps({
            'type': 'payment_status_update',
            'order_id': event.get('order_id'),
        }))

    # Receive cart update from the session group
    async def cart_updated(self, event):
        import sys
        print(f"[ORDER-WS] >>> FORWARDING cart_updated → client device={self.device_id}", file=sys.stderr)
        # Forward the update notification to the client
        await self.send(text_data=json.dumps({
            'type': 'cart_updated',
            'cart_id': event['cart_id']
        }))



class RestaurantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.restaurant_id = self.scope['url_route']['kwargs']['restaurant_id']
        self.room_group_name = f'restaurant_{self.restaurant_id}'

        try:
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()
        except Exception as exc:
            logger.exception(
                "RestaurantConsumer connect failed for restaurant_%s: %s",
                self.restaurant_id,
                exc,
            )
            # Graceful close instead of server 500 during WS handshake.
            await self.close(code=1011)

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        except Exception:
            pass


    # Category created
    async def category_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "category_created",
            "category": event["category"]
        }))

    # Category updated
    async def category_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "category_updated",
            "category": event["category"]
        }))

    # Category deleted
    async def category_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "category_deleted",
            "category_id": event["category_id"]
        }))
    

    # --- Item events ---
    async def item_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "item_created",
            "item": event["item"]
        }))

    async def item_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "item_updated",
            "item": event["item"]
        }))

    async def item_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "item_deleted",
            "item_id": event["item_id"]
        }))

    
    # --- Order events ---
    async def order_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "order_created",
            "order": event["order"]
        }))

    async def order_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "order_updated",
            "order": event["order"]
        }))


    
    # --- Device events ---
    async def device_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "device_created",
            "device": event["device"]
        }))

    async def device_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "device_updated",
            "device": event["device"]
        }))

    async def device_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "device_deleted",
            "device_id": event["device_id"]
        }))



    # --- Reservation events ---
    async def reservation_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "reservation_created",
            "reservation": event["reservation"]
        }))

    async def reservation_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "reservation_updated",
            "reservation": event["reservation"]
        }))

    async def upsell_event_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "upsell_event_updated",
            "restaurant_id": event["restaurant_id"],
        }))

    # --- Review Events ---
    async def review_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "review_created",
            "review": event["review"]
        }))

    # --- Payment Events ---
    async def order_paid(self, event):
        await self.send(text_data=json.dumps({
            "type": "order_paid",
            "order": event["order"]
        }))

    # --- Order Status Events (CRITICAL — were missing, caused silent drops) ---
    async def order_status_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def new_order(self, event):
        await self.send(text_data=json.dumps(event))

    # --- Cash Payment Events (CRITICAL — were missing) ---
    async def cash_payment_alert(self, event):
        await self.send(text_data=json.dumps(event))

    async def cash_payment_confirmed(self, event):
        await self.send(text_data=json.dumps(event))

    async def payment_status_update(self, event):
        await self.send(text_data=json.dumps(event))

    # --- Session Events ---
    async def session_started(self, event):
        await self.send(text_data=json.dumps(event))

    async def session_closed(self, event):
         await self.send(text_data=json.dumps(event))

    # ----------------------------
    # ChefStaff events (NEW)
    # ----------------------------
    async def chefstaff_created(self, event):
        await self.send(text_data=json.dumps({
            "type": "chefstaff_created",
            "chefstaff": event["chefstaff"]
        }))

    async def chefstaff_updated(self, event):
        await self.send(text_data=json.dumps({
            "type": "chefstaff_updated",
            "chefstaff": event["chefstaff"]
        }))

    async def chefstaff_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "chefstaff_deleted",
            "chefstaff_id": event["chefstaff_id"]
        }))

    # --- Chat events (NEW) ---
    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
            'message_type': event.get('message_type', 'message'),  # Include alert type
            'sender': event['sender'],
            'device_id': event['device_id'],
            'is_from_device': event['is_from_device'],
            'timestamp': event['timestamp'],
        }))

    async def chat_cleared(self, event):
        await self.send(text_data=json.dumps({
            "type": "chat_cleared",
            "device_id": event.get("device_id"),
            "session_id": event.get("session_id"),
            "reason": event.get("reason"),
        }))





class RestaurantCallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        self.restaurant_id = self.scope["url_route"]["kwargs"]["restaurant_id"]

        if not self.user or (not self.user.is_authenticated and not self.user.is_anonymous):
            print(f"DEBUG: Connection rejected. User: {self.user}, Authenticated: {self.user.is_authenticated if self.user else 'N/A'}")
            await self.close()
            return

        # Restaurant-wide group (all users)
        self.restaurant_group = f"restaurant_{self.restaurant_id}"
        await self.channel_layer.group_add(self.restaurant_group, self.channel_name)

        # User-specific group for private messages
        if self.user and self.user.is_authenticated:
            self.user_group = f"user_{self.user.id}"
            await self.channel_layer.group_add(self.user_group, self.channel_name)
            # End any stale calls for this user
            await self.end_existing_calls(self.user.id)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave groups
        if hasattr(self, "restaurant_group"):
            await self.channel_layer.group_discard(self.restaurant_group, self.channel_name)
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        if hasattr(self, "call_group"):
            await self.channel_layer.group_discard(self.call_group, self.channel_name)
