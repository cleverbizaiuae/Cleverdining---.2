from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import ChefStaff, User
from restaurant.models import Restaurant


class StaffLoginRestaurantContextTests(TestCase):
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
