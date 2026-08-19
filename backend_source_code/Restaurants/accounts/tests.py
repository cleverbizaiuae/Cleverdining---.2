from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import ChefStaff, User
from restaurant.models import Restaurant


class StaffLoginRestaurantContextTests(TestCase):
    def test_owner_login_returns_entered_display_name(self):
        owner = User.objects.create_user(
            email="named-owner@example.com",
            username="contact_a785",
            password="test-password",
            role="owner",
            first_name="Amelia",
            last_name="Stone",
        )
        Restaurant.objects.create(
            resturent_name="Named Owner Restaurant",
            location="Dubai",
            phone_number="+971500000112",
            owner=owner,
        )

        response = APIClient().post(
            "/login/",
            {"email": owner.email, "password": "test-password"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        user = response.json()["user"]
        self.assertEqual(user["first_name"], "Amelia")
        self.assertEqual(user["last_name"], "Stone")
        self.assertEqual(user["display_name"], "Amelia Stone")

    def test_uk_staff_login_includes_assigned_restaurant_currency(self):
        owner = User.objects.create_user(
            email="uk-owner@example.com",
            username="UK Owner",
            password="test-password",
            role="owner",
        )
        restaurant = Restaurant.objects.create(
            resturent_name="London Restaurant",
            location="London",
            region="UK",
            currency="GBP",
            timezone="Europe/London",
            country_code="+44",
            country="United Kingdom",
            phone_number="+447700900111",
            owner=owner,
        )
        staff = User.objects.create_user(
            email="uk-staff@example.com",
            username="UK Staff",
            password="test-password",
            role="staff",
        )
        ChefStaff.objects.create(
            restaurant=restaurant,
            user=staff,
            action="accepted",
        )

        response = APIClient().post(
            "/login/",
            {
                "email": staff.email,
                "password": "test-password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        restaurants = response.json()["user"]["restaurants"]
        self.assertEqual(len(restaurants), 1)
        self.assertEqual(restaurants[0]["id"], restaurant.id)
        self.assertEqual(restaurants[0]["region"], "UK")
        self.assertEqual(restaurants[0]["currency"], "GBP")


class StaffPasswordChangeValidationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="password-owner@example.com",
            username="Password Owner",
            password="owner-password",
            role="owner",
        )
        restaurant = Restaurant.objects.create(
            resturent_name="Password Restaurant",
            location="Dubai",
            phone_number="+971500000113",
            owner=self.owner,
        )
        self.staff = User.objects.create_user(
            email="password-staff@example.com",
            username="Password Staff",
            password="old-staff-password",
            role="staff",
        )
        self.membership = ChefStaff.objects.create(
            restaurant=restaurant,
            user=self.staff,
            action="accepted",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_change_password_requires_and_verifies_old_password(self):
        url = f"/owners/chef-staff/{self.membership.id}/change-password/"

        response = self.client.post(url, {"new_password": "new-staff-password"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["old_password"], ["Old password is required."])

        response = self.client.post(
            url,
            {"old_password": "wrong-password", "new_password": "new-staff-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["old_password"], ["Old password is incorrect."])

        response = self.client.post(
            url,
            {"old_password": "old-staff-password", "new_password": "new-staff-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("new-staff-password"))
