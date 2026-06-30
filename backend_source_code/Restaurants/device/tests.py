from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import ChefStaff, User
from restaurant.models import Restaurant

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
    def test_database_errors_are_not_returned_as_empty_success(self, _filter):
        request = self.factory.get("/owners/devices/")
        force_authenticate(request, user=self.owner)

        response = SimpleDeviceListView.as_view()(request)

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["code"], "table_list_failed")
        self.assertNotIn("database unavailable", str(response.data))
