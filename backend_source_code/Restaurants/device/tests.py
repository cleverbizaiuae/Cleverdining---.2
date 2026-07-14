from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import ChefStaff, User
from restaurant.models import Restaurant

from .models import Device
from .views import SimpleDeviceListView, _resolve_user_restaurant_ids


class RestaurantResolutionTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Test Restaurant",
            location="Dubai",
            phone_number="+971500000001",
            owner=self.owner,
        )

    def test_owner_restaurant_is_resolved(self):
        self.assertEqual(_resolve_user_restaurant_ids(self.owner), [self.restaurant.id])

    def test_active_manager_restaurant_is_resolved(self):
        manager = User.objects.create_user(
            email="manager@example.com",
            username="manager",
            password="test-password",
            role="manager",
        )
        ChefStaff.objects.create(
            user=manager,
            restaurant=self.restaurant,
            action="active",
        )

        self.assertEqual(_resolve_user_restaurant_ids(manager), [self.restaurant.id])

    def test_hold_staff_restaurant_is_not_resolved(self):
        staff = User.objects.create_user(
            email="staff@example.com",
            username="staff",
            password="test-password",
            role="staff",
        )
        ChefStaff.objects.create(
            user=staff,
            restaurant=self.restaurant,
            action="hold",
        )

        self.assertEqual(_resolve_user_restaurant_ids(staff), [])


class DeviceListErrorTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.owner = User.objects.create_user(
            email="owner2@example.com",
            username="owner2",
            password="test-password",
            role="owner",
        )
        Restaurant.objects.create(
            resturent_name="Error Test Restaurant",
            location="London",
            phone_number="+447000000001",
            owner=self.owner,
        )

    @patch("device.views.Device.objects.filter", side_effect=RuntimeError("database unavailable"))
    def test_database_errors_return_explicit_resilient_error_payload(self, _filter):
        request = self.factory.get("/owners/devices/")
        force_authenticate(request, user=self.owner)

        response = SimpleDeviceListView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "table_list_failed")
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["error"], "Unable to load tables.")
        self.assertNotIn("database unavailable", str(response.data))

    def test_owner_device_list_does_not_select_optional_restaurant_columns(self):
        device_user = User.objects.create_user(
            email="device@example.com",
            username="deviceuser",
            password="test-password",
            role="customer",
        )
        restaurant = self.owner.restaurants.only("id").get()
        Device.objects.create(
            table_name="T1",
            region="Primary",
            table_number="1",
            user=device_user,
            restaurant=restaurant,
        )
        request = self.factory.get("/owners/devices/")
        force_authenticate(request, user=self.owner)

        with CaptureQueriesContext(connection) as captured:
            response = SimpleDeviceListView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        sql = "\n".join(query["sql"] for query in captured.captured_queries).lower()
        self.assertNotIn("whatsapp_provider", sql)
        self.assertNotIn("whatsapp_360dialog_channel_id", sql)
