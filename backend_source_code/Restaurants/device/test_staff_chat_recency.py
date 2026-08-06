from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from accounts.models import ChefStaff, User
from message.models import ChatMessage
from restaurant.models import Restaurant

from .models import Device, GuestSession


class StaffChatRecencyTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="staff-chat-owner@example.com",
            username="staff-chat-owner",
            password="test-password",
            role="owner",
        )
        self.staff = User.objects.create_user(
            email="staff-chat-user@example.com",
            username="staff-chat-user",
            password="test-password",
            role="staff",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Staff Chat Restaurant",
            location="London",
            phone_number="+447000000099",
            owner=self.owner,
        )
        ChefStaff.objects.create(
            user=self.staff,
            restaurant=self.restaurant,
            action="active",
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="T1",
                table_number="1",
                user=self.owner,
                restaurant=self.restaurant,
            )

        inactive_session = GuestSession.objects.create(
            device=self.device,
            session_token="staff-chat-inactive-session",
            is_active=False,
        )
        active_session = GuestSession.objects.create(
            device=self.device,
            session_token="staff-chat-active-session",
            is_active=True,
        )
        active_message = ChatMessage.objects.create(
            sender=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            guest_session=active_session,
            message="Earlier active-session message",
            is_from_device=True,
            is_read=False,
        )
        self.latest_message = ChatMessage.objects.create(
            sender=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            guest_session=inactive_session,
            message="Latest persisted conversation message",
            is_from_device=False,
            is_read=False,
        )

        earlier = timezone.now() - timedelta(minutes=2)
        latest = timezone.now() - timedelta(minutes=1)
        ChatMessage.objects.filter(pk=active_message.pk).update(timestamp=earlier)
        ChatMessage.objects.filter(pk=self.latest_message.pk).update(timestamp=latest)
        self.latest_message.refresh_from_db()

        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)

    def test_staff_table_list_uses_latest_persisted_message_for_recency(self):
        response = self.client.get("/api/staff/devicesall/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        table = response.json()[0]
        self.assertEqual(table["unread_count"], 1)
        self.assertEqual(
            parse_datetime(table["last_message_time"]),
            self.latest_message.timestamp,
        )


class ManagerChatRecencyTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="manager-chat-owner@example.com",
            username="manager-chat-owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Manager Chat Restaurant",
            location="London",
            phone_number="+447000000100",
            owner=self.owner,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="T1",
                table_number="1",
                user=self.owner,
                restaurant=self.restaurant,
            )

        inactive_session = GuestSession.objects.create(
            device=self.device,
            session_token="manager-chat-inactive-session",
            is_active=False,
        )
        active_session = GuestSession.objects.create(
            device=self.device,
            session_token="manager-chat-active-session",
            is_active=True,
        )
        active_message = ChatMessage.objects.create(
            sender=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            guest_session=active_session,
            message="Earlier active-session message",
            is_from_device=True,
            is_read=False,
        )
        self.latest_message = ChatMessage.objects.create(
            sender=self.owner,
            device=self.device,
            restaurant=self.restaurant,
            guest_session=inactive_session,
            message="Latest persisted conversation message",
            is_from_device=False,
            is_read=False,
        )

        earlier = timezone.now() - timedelta(minutes=2)
        latest = timezone.now() - timedelta(minutes=1)
        ChatMessage.objects.filter(pk=active_message.pk).update(timestamp=earlier)
        ChatMessage.objects.filter(pk=self.latest_message.pk).update(timestamp=latest)
        self.latest_message.refresh_from_db()

        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_manager_table_list_uses_latest_persisted_message_for_recency(self):
        response = self.client.get("/owners/devicesall/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        table = response.json()[0]
        self.assertEqual(table["unread_count"], 1)
        self.assertEqual(
            parse_datetime(table["last_message_time"]),
            self.latest_message.timestamp,
        )
