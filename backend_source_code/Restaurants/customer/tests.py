from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from device.models import Device
from message.models import TableMessage
from restaurant.models import Restaurant


class TableMessageQueueTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="waiter-queue-owner@example.com",
            username="Waiter Queue Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Waiter Queue Restaurant",
            location="Dubai",
            phone_number="+971500008888",
            owner=self.owner,
        )
        self.devices = [
            Device.objects.create(
                table_name=f"Table {index}",
                table_number=str(index),
                user=self.owner,
                restaurant=self.restaurant,
            )
            for index in range(1, 6)
        ]
        self.client = APIClient()

    def request_waiter(self, index):
        device = self.devices[index - 1]
        return self.client.post(
            "/api/table-messages",
            {
                "deviceId": device.id,
                "restaurantId": self.restaurant.id,
                "tableNumber": index,
                "tableName": device.table_name,
                "type": "assistance",
                "message": f"{device.table_name} is requesting assistance.",
                "status": "pending",
            },
            format="json",
        )

    def test_fourth_request_is_queued_and_duplicate_is_rejected(self):
        for index in range(1, 4):
            response = self.request_waiter(index)
            self.assertEqual(response.status_code, 201, response.json())
            self.assertFalse(response.json()["queued"])

        queued_response = self.request_waiter(4)
        self.assertEqual(queued_response.status_code, 201, queued_response.json())
        self.assertTrue(queued_response.json()["queued"])
        self.assertEqual(queued_response.json()["status"], "queued")

        duplicate_response = self.request_waiter(4)
        self.assertEqual(duplicate_response.status_code, 409)
        self.assertEqual(duplicate_response.json()["error"], "already_requested")
        self.assertEqual(duplicate_response.json()["status"], "queued")

    def test_resolving_request_promotes_oldest_queued_request(self):
        for index in range(1, 6):
            self.request_waiter(index)

        first = TableMessage.objects.get(device=self.devices[0])
        fourth = TableMessage.objects.get(device=self.devices[3])
        fifth = TableMessage.objects.get(device=self.devices[4])
        self.assertEqual(fourth.status, "queued")
        self.assertEqual(fifth.status, "queued")

        response = self.client.patch(
            f"/api/table-messages/{first.id}",
            {"status": "resolved"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.json())
        first.refresh_from_db()
        fourth.refresh_from_db()
        fifth.refresh_from_db()
        self.assertEqual(first.status, "resolved")
        self.assertEqual(fourth.status, "pending")
        self.assertEqual(fifth.status, "queued")

# Create your tests here.
