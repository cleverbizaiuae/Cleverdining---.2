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
        self.device_id = self.scope['url_route']['kwargs']['device_id']
        self.user = self.scope['user']
        self.guest_session = self.scope.get('guest_session') # Capture session from scope (set by Middleware)
        self.user_info = self.scope.get('user_info', {})
        
        # Get restaurant_id from user_info or query params
        self.restaurant_id = self.user_info.get('restaurants_id')
        if not self.restaurant_id:
            from urllib.parse import parse_qs
            query_string = self.scope['query_string'].decode()
            query_params = parse_qs(query_string)
            self.restaurant_id = query_params.get('restaurant_id', [None])[0]

        self.restaurant_group_name = f"room_{self.device_id}_{self.restaurant_id}"
        print("jjdjdjdjjdjdjjd",self.restaurant_group_name)

        if self.user and (self.user.is_authenticated or self.user.is_anonymous):
            # For anonymous users (guests), we might want to restrict them to their device room only
            # But for now, let's allow them to join the group to enable messaging
            await self.channel_layer.group_add(self.restaurant_group_name, self.channel_name)
            
            # Join the restaurant-wide group to receive item/menu updates
            if self.restaurant_id:
                self.restaurant_general_group = f"restaurant_{self.restaurant_id}"
                await self.channel_layer.group_add(self.restaurant_general_group, self.channel_name)
            
            await self.accept()
        else:
            await self.close()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.restaurant_group_name, self.channel_name)
        if hasattr(self, 'restaurant_general_group'):
            await self.channel_layer.group_discard(self.restaurant_general_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message = data.get('message')
            if not message:
                raise ValueError("Missing message content")
        except Exception:
            await self.send(text_data=json.dumps({"error": "Invalid JSON or missing 'message' field"}))
            return

        msg_type = data.get('type', 'message')

        # Determine sender and receiver
        if self.user.is_anonymous or (hasattr(self.user, 'role') and self.user.role == "customer"):
            receiver = await self._get_restaurant_owner(self.restaurant_id)
            is_from_device = True
        else:  # owner or staff
            receiver = await self._get_device_user(self.device_id)
            is_from_device = False

        sender = self.user

        chat_message = await self._save_message(
            sender=sender,
            receiver=receiver,
            message=message,
            device_id=self.device_id,
            restaurant_id=self.restaurant_id,
            is_from_device=is_from_device,
            is_from_device=is_from_device,
            room_name=self.restaurant_group_name,
            guest_session=self.guest_session # Pass session
        )

        if not chat_message:
            await self.send(text_data=json.dumps({"error": "Message could not be saved. Device or Restaurant may not exist."}))
            return

        # Broadcast the message to the specific chat room
        await self.channel_layer.group_send(
            self.restaurant_group_name,
            {
                'type': 'chat_message',
                'message': message,
                'msg_type': msg_type,
                'sender': sender.username,
                'device_id' : self.device_id,
                'is_from_device': is_from_device,
                'timestamp': str(chat_message.timestamp),
            }
        )

        # Broadcast the message to the general restaurant group (for notifications)
        await self.channel_layer.group_send(
            f"restaurant_{self.restaurant_id}",
            {
                'type': 'chat_message',
                'message': message,
                'msg_type': msg_type,
                'sender': sender.username,
                'device_id' : self.device_id,
                'is_from_device': is_from_device,
                'timestamp': str(chat_message.timestamp),
            }
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'message': event['message'],
            'msg_type': event.get('msg_type', 'message'),
            'sender': event['sender'],
            'device_id': event['device_id'],
            'is_from_device': event['is_from_device'],
            'timestamp': event['timestamp'],
        }))

    @database_sync_to_async
    def _save_message(self, sender, receiver, message, device_id, restaurant_id, is_from_device,room_name, guest_session=None):
        try:
            device = Device.objects.get(id=device_id)
        except Device.DoesNotExist:
            logger.warning(f"Device with ID {device_id} does not exist.")
            return None

        # If sender is anonymous (guest), use the device's user
        if sender.is_anonymous:
            sender = device.user

        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist:
            logger.warning(f"Restaurant with ID {restaurant_id} does not exist.")
            return None

        return ChatMessage.objects.create(
            sender=sender,
            receiver=receiver,
            message=message,
            device=device,
            restaurant=restaurant,
            is_from_device=is_from_device,
            room_name=room_name,
            new_message=True,
            room_name=room_name,
            new_message=True,
            business_day=restaurant.business_days.filter(is_active=True).last(), # Link to active business day
            guest_session=guest_session # Link to specific session
        )

    @database_sync_to_async
    def _get_restaurant_owner(self, restaurant_id):
        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
            return restaurant.owner
        except Restaurant.DoesNotExist:
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
        # Retrieve device id from the URL
        self.device_id = self.scope['url_route']['kwargs']['device_id']
        self.room_group_name = f'device_{self.device_id}'
        
        # Check for guest session
        self.guest_session = self.scope.get('guest_session')
        self.session_group_name = None

        # Strict Isolation: Require valid guest session for this table
        if self.guest_session:
            # Verify session belongs to this device/table
            if str(self.guest_session.device.id) != str(self.device_id):
                print(f"DEBUG: Session device mismatch. Session: {self.guest_session.device.id}, Requested: {self.device_id}")
                await self.close(code=4003) # Forbidden
                return

            self.session_group_name = f'session_{self.guest_session.id}'
            print(f"DEBUG: Joining session group {self.session_group_name}")
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
            
        elif self.scope.get("user") and self.scope["user"].is_authenticated:
             # Allow staff/admin to join table group
             # TODO: Add strict staff-restaurant validation here if needed
             await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
             await self.accept()
        else:
            # Reject unauthenticated connections
            print("DEBUG: Rejecting unauthenticated socket connection")
            await self.close(code=4001) # Unauthorized

    async def disconnect(self, close_code):
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
        order_id = event['order_id']
        status = event['status']

        # Send the status update to WebSocket
        response = {
            'order_id': event.get('order_id'),
            'status': event.get('status'),
            'type': 'order_status_update',  # Explicit type for frontend routing
        }
        if 'session_ended' in event:
            response['session_ended'] = event['session_ended']
        if 'bulk' in event:
            response['bulk'] = event['bulk']
            
        await self.send(text_data=json.dumps(response))

    # Receive cart update from the session group
    async def cart_updated(self, event):
        # Forward the update notification to the client
        await self.send(text_data=json.dumps({
            'type': 'cart_updated',
            'cart_id': event['cart_id']
        }))



class RestaurantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.restaurant_id = self.scope['url_route']['kwargs']['restaurant_id']
        self.room_group_name = f'restaurant_{self.restaurant_id}'

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)


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
            'sender': event['sender'],
            'device_id': event['device_id'],
            'is_from_device': event['is_from_device'],
            'timestamp': event['timestamp'],
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

        # End active calls
        if self.user and self.user.is_authenticated:
            await self.end_existing_calls(self.user.id)

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get("action")

        if action == "start_call":
            await self.handle_start_call(data)
        elif action == "accept_call":
            await self.handle_accept_call(data)
        elif action == "end_call":
            await self.handle_end_call(data)

    # -------------------------------
    # Start Call
    # -------------------------------
    async def handle_start_call(self, data):
        receiver_id = data.get("receiver_id")
        if not receiver_id:
            await self.send(json.dumps({"error": "Missing receiver_id"}))
            return

        # Resolve caller_id (handle anonymous guests)
        caller_id = self.user.id
        if self.user.is_anonymous:
            device_id = data.get("device_id")
            device_user = await self._get_device_user(device_id)
            if device_user:
                caller_id = device_user.id
            else:
                await self.send(json.dumps({"error": "Device user not found for guest"}))
                return

        # Busy checks
        if await self.is_user_busy(receiver_id):
            await self.send(json.dumps({"action": "receiver_busy", "receiver_id": receiver_id}))
            return
        if await self.is_user_busy(caller_id):
            await self.send(json.dumps({"action": "caller_busy", "user_id": caller_id}))
            return

        # Check if both users belong to the same restaurant
        if not await self.check_same_restaurant(caller_id, receiver_id):
            await self.send(json.dumps({"error": "Users must belong to the same restaurant"}))
            return

        # End existing calls for caller
        await self.end_existing_calls(caller_id)

        # Create new call session
        call_session = await self.create_call_session(caller_id, receiver_id, device_id)
        if not call_session:
            await self.send(json.dumps({"error": "Failed to create call session"}))
            return

        # Private call group
        self.call_group = f"call_{call_session.id}"
        await self.channel_layer.group_add(self.call_group, self.channel_name)

        # Notify receiver only
        await self.channel_layer.group_send(
            f"user_{receiver_id}",
            {
                "type": "call_message",
                "message": json.dumps({
                    "action": "incoming_call",
                    "from": self.user.username,
                    "call_id": call_session.id,
                    "device_id": data.get("device_id"),
                    "table_id": data.get("table_id")
                })
            }
        )

        # Confirm to caller
        await self.send(json.dumps({
            "action": "call_started",
            "call_id": call_session.id
        }))

        # --- NEW: Send "Incoming call" message to Chat ---
        try:
            # Get table name for the message
            device = await database_sync_to_async(Device.objects.get)(id=data.get("device_id"))
            table_name = device.table_name
            
            message_content = f"Incoming call from {table_name}"
            
            # Save message to DB
            chat_message = await self._save_message(
                sender=self.user,
                receiver=await database_sync_to_async(User.objects.get)(id=receiver_id),
                message=message_content,
                device_id=data.get("device_id"),
                restaurant_id=self.restaurant_id,
                is_from_device=True,
                room_name=f"room_{data.get('device_id')}_{self.restaurant_id}"
            )

            # Broadcast to Chat Group (so dashboard sees it)
            chat_group_name = f"room_{data.get('device_id')}_{self.restaurant_id}"
            await self.channel_layer.group_send(
                chat_group_name,
                {
                    'type': 'chat_message',
                    'message': message_content,
                    'sender': self.user.username,
                    'device_id': data.get("device_id"),
                    'is_from_device': True,
                    'timestamp': str(chat_message.timestamp) if chat_message else str(timezone.now()),
                }
            )
        except Exception as e:
            logger.error(f"Failed to send call alert message: {e}")

    # -------------------------------
    # Accept Call
    # -------------------------------
    async def handle_accept_call(self, data):
        call_id = data.get("call_id")
        call_session = await self.get_call_session(call_id)
        if call_session and call_session.is_active:
            self.call_group = f"call_{call_id}"
            await self.channel_layer.group_add(self.call_group, self.channel_name)

            # Notify only participants
            await self.channel_layer.group_send(
                self.call_group,
                {
                    "type": "call_message",
                    "message": json.dumps({
                        "action": "call_accepted",
                        "by": self.user.username,
                        "call_id": call_id
                    })
                }
            )

    # -------------------------------
    # End Call
    # -------------------------------
    async def handle_end_call(self, data):
        call_id = data.get("call_id")
        call_session = await self.get_call_session(call_id)
        
        if call_session and call_session.is_active:
            receiver_id = await database_sync_to_async(lambda: call_session.receiver.id)()
            await self.end_call_session(call_session)
            
            # Broadcast to call group (if established)
            await self.channel_layer.group_send(
                f"call_{call_id}",
                {
                    "type": "call_message",
                    "message": json.dumps({
                        "action": "call_ended",
                        "by": self.user.username
                    })
                }
            )
            
            # Also broadcast to receiver's user group (in case they haven't answered yet)
            if receiver_id:
                await self.channel_layer.group_send(
                    f"user_{receiver_id}",
                    {
                        "type": "call_message",
                        "message": json.dumps({
                            "action": "call_ended",
                            "by": self.user.username,
                            "call_id": call_id
                        })
                    }
                )

    # -------------------------------
    # Database Helpers
    # -------------------------------
    @database_sync_to_async
    def _get_device_user(self, device_id):
        try:
            device = Device.objects.get(id=device_id)
            return device.user
        except Device.DoesNotExist:
            return None

    @database_sync_to_async
    def create_call_session(self, caller_id, receiver_id, device_id=None):
        try:
            caller = User.objects.get(id=caller_id)
            receiver = User.objects.get(id=receiver_id)
            device = None
            if device_id:
                device = Device.objects.get(id=device_id)
            return CallSession.objects.create(caller=caller, receiver=receiver, device=device, is_active=True)
        except Exception:
            return None

    @database_sync_to_async
    def get_call_session(self, call_id):
        try:
            return CallSession.objects.get(id=call_id)
        except CallSession.DoesNotExist:
            return None

    @database_sync_to_async
    def end_call_session(self, call_session):
        call_session.is_active = False
        call_session.ended_at = timezone.now()
        call_session.save()

    @database_sync_to_async
    def end_existing_calls(self, user_id):
        CallSession.objects.filter(caller_id=user_id, is_active=True).update(is_active=False, ended_at=timezone.now())
        CallSession.objects.filter(receiver_id=user_id, is_active=True).update(is_active=False, ended_at=timezone.now())

    @database_sync_to_async
    def is_user_busy(self, user_id):
        cutoff = timezone.now() - timedelta(minutes=2)
        return CallSession.objects.filter(is_active=True, started_at__gte=cutoff, caller_id=user_id).exists() \
               or CallSession.objects.filter(is_active=True, started_at__gte=cutoff, receiver_id=user_id).exists()

    @database_sync_to_async
    def check_same_restaurant(self, user1_id, user2_id):
        try:
            # Restaurants for user1
            rest1_owner = set(Restaurant.objects.filter(owner_id=user1_id).values_list('id', flat=True))
            rest1_staff = set(ChefStaff.objects.filter(user_id=user1_id).values_list('restaurant_id', flat=True))
            rest1_device = set(Device.objects.filter(user_id=user1_id).values_list('restaurant_id', flat=True))
            rest1 = rest1_owner | rest1_staff | rest1_device

            # Restaurants for user2
            rest2_owner = set(Restaurant.objects.filter(owner_id=user2_id).values_list('id', flat=True))
            rest2_staff = set(ChefStaff.objects.filter(user_id=user2_id).values_list('restaurant_id', flat=True))
            rest2_device = set(Device.objects.filter(user_id=user2_id).values_list('restaurant_id', flat=True))
            rest2 = rest2_owner | rest2_staff | rest2_device

            # Check intersection
            return len(rest1 & rest2) > 0
        except Exception:
            return False

    # -------------------------------
    # Group message handler
    # -------------------------------
    async def call_message(self, event):
        await self.send(text_data=event["message"])

    # -------------------------------
    # Helper Methods
    # -------------------------------
    @database_sync_to_async
    def _save_message(self, sender, receiver, message, device_id, restaurant_id, is_from_device, room_name):
        try:
            device = Device.objects.get(id=device_id)
            restaurant = Restaurant.objects.get(id=restaurant_id)
            return ChatMessage.objects.create(
                sender=sender,
                receiver=receiver,
                message=message,
                device=device,
                restaurant=restaurant,
                is_from_device=is_from_device,
                room_name=room_name,
                new_message=True
            )
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            return None




