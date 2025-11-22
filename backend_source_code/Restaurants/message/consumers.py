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
        self.user_info = self.scope.get('user_info', {})

        self.restaurant_group_name = f"room_{self.device_id}_{self.user_info.get('restaurants_id')}"
        print("jjdjdjdjjdjdjjd",self.restaurant_group_name)

        if self.user and self.user.is_authenticated and (self.user.role in ["customer", "owner", "staff","chef"]):
            await self.channel_layer.group_add(self.restaurant_group_name, self.channel_name)
            await self.accept()
        else:
            await self.close()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.restaurant_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message = data.get('message')
            if not message:
                raise ValueError("Missing message content")
        except Exception:
            await self.send(text_data=json.dumps({"error": "Invalid JSON or missing 'message' field"}))
            return

        # Determine sender and receiver
        if self.user.role == "customer":
            receiver = await self._get_restaurant_owner(self.user_info.get('restaurants_id'))
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
            restaurant_id=self.user_info.get('restaurants_id'),
            is_from_device=is_from_device,
            room_name=self.restaurant_group_name
        )

        if not chat_message:
            await self.send(text_data=json.dumps({"error": "Message could not be saved. Device or Restaurant may not exist."}))
            return

        # Broadcast the message
        await self.channel_layer.group_send(
            self.restaurant_group_name,
            {
                'type': 'chat_message',
                'message': message,
                'sender': sender.username,
                'device_id' : self.device_id,
                'is_from_device': is_from_device,
                'timestamp': str(chat_message.timestamp),
            }
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'message': event['message'],
            'sender': event['sender'],
            'device_id': event['device_id'],
            'is_from_device': event['is_from_device'],
            'timestamp': event['timestamp'],
        }))

    @database_sync_to_async
    def _save_message(self, sender, receiver, message, device_id, restaurant_id, is_from_device,room_name):
        try:
            device = Device.objects.get(id=device_id)
        except Device.DoesNotExist:
            logger.warning(f"Device with ID {device_id} does not exist.")
            return None

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
            new_message=True
        )

    @database_sync_to_async
    def _get_restaurant_owner(self, restaurant_id):
        return User.objects.filter(role='owner', restaurants__id=restaurant_id).first()


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

        # Join the WebSocket group for this device
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave the WebSocket group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # Receive message from the group
    async def order_status_update(self, event):
        order_id = event['order_id']
        status = event['status']

        # Send the status update to WebSocket
        await self.send(text_data=json.dumps({
            'order_id': order_id,
            'status': status
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





class RestaurantCallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        self.restaurant_id = self.scope["url_route"]["kwargs"]["restaurant_id"]

        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        # Restaurant-wide group (all users)
        self.restaurant_group = f"restaurant_{self.restaurant_id}"
        await self.channel_layer.group_add(self.restaurant_group, self.channel_name)

        # User-specific group for private messages
        self.user_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # End any stale calls for this user
        await self.end_existing_calls(self.user.id)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave groups
        await self.channel_layer.group_discard(self.restaurant_group, self.channel_name)
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

        # Busy checks
        if await self.is_user_busy(receiver_id):
            await self.send(json.dumps({"action": "receiver_busy", "receiver_id": receiver_id}))
            return
        if await self.is_user_busy(self.user.id):
            await self.send(json.dumps({"action": "caller_busy", "user_id": self.user.id}))
            return

        # Check if both users belong to the same restaurant
        if not await self.check_same_restaurant(self.user.id, receiver_id):
            await self.send(json.dumps({"error": "Users must belong to the same restaurant"}))
            return

        # End existing calls for caller
        await self.end_existing_calls(self.user.id)

        # Create new call session
        call_session = await self.create_call_session(self.user.id, receiver_id)
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
                    "call_id": call_session.id
                })
            }
        )

        # Confirm to caller
        await self.send(json.dumps({
            "action": "call_started",
            "call_id": call_session.id
        }))

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
            await self.end_call_session(call_session)
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

    # -------------------------------
    # Database Helpers
    # -------------------------------
    @database_sync_to_async
    def create_call_session(self, caller_id, receiver_id):
        try:
            caller = User.objects.get(id=caller_id)
            receiver = User.objects.get(id=receiver_id)
            return CallSession.objects.create(caller=caller, receiver=receiver, is_active=True)
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




