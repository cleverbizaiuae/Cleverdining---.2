from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from device.models import Device
from restaurant.models import Restaurant

from .models import ChatMessage
from .consumers import ChatConsumer


class CustomerChatRoutingTests(TestCase):
    def setUp(self):
        self.consumer = ChatConsumer()
        self.consumer.is_guest = True
        self.consumer.device_id = "1"
        self.consumer.session_id = "101"

    def test_manager_message_for_current_table_is_delivered(self):
        self.assertTrue(self.consumer._chat_event_matches_guest({
            "type": "chat_message",
            "guest_session_id": "101",
            "device_id": "1",
            "is_from_device": False,
        }))

    def test_manager_message_for_other_table_is_rejected(self):
        self.assertFalse(self.consumer._chat_event_matches_guest({
            "type": "chat_message",
            "guest_session_id": "202",
            "device_id": "2",
            "is_from_device": False,
        }))

    def test_manager_message_for_old_session_on_same_table_is_rejected(self):
        self.assertFalse(self.consumer._chat_event_matches_guest({
            "type": "chat_message",
            "guest_session_id": "202",
            "device_id": "1",
            "is_from_device": False,
        }))

    def test_untargeted_chat_message_is_rejected(self):
        self.assertFalse(self.consumer._chat_event_matches_guest({
            "type": "chat_message",
            "is_from_device": False,
        }))


class ClearChatPreservesTableTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="chat-owner@example.com",
            username="chat-owner",
            password="test-password",
            role="owner",
        )
        self.device_user = User.objects.create_user(
            email="table-user@example.com",
            username="table-user",
            password="test-password",
            role="customer",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Chat Test Restaurant",
            location="London",
            phone_number="+447000000090",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 1",
                table_number="1",
                user=self.device_user,
                restaurant=self.restaurant,
            )
        ChatMessage.objects.create(
            sender=self.device_user,
            receiver=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            message="Please bring water",
            is_from_device=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_clear_chat_deletes_messages_without_deleting_table_or_login(self):
        response = self.client.post(
            "/message/chat/clear-chat/",
            {"device_id": self.device.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(ChatMessage.objects.filter(device=self.device).exists())
        self.assertTrue(Device.objects.filter(pk=self.device.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.device_user.pk).exists())
