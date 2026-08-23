from django.contrib.auth import authenticate
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import ChefStaff, User
from restaurant.models import Restaurant


class CaseInsensitiveEmailLoginTests(TestCase):
    password = "case-safe-password"

    def setUp(self):
        self.owner = User.objects.create_user(
            email="Case.Owner@Example.com",
            username="Case Owner",
            password=self.password,
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Case Safe Restaurant",
            location="Dubai",
            phone_number="+971500000119",
            owner=self.owner,
        )
        self.staff = User.objects.create_user(
            email="Case.Staff@Example.com",
            username="Case Staff",
            password=self.password,
            role="staff",
        )
        ChefStaff.objects.create(
            restaurant=self.restaurant,
            user=self.staff,
            action="accepted",
        )
        self.client = APIClient()

    def test_primary_login_accepts_mixed_case_email(self):
        response = self.client.post(
            "/login/",
            {"email": "cASE.oWNER@example.COM", "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["id"], self.owner.id)

    def test_primary_login_uses_password_to_resolve_legacy_case_duplicates(self):
        duplicate = User.objects.create_user(
            email="case.owner@example.com",
            username="Case Duplicate",
            password="duplicate-password",
            role="owner",
        )

        response = self.client.post(
            "/login/",
            {"email": "CASE.OWNER@EXAMPLE.COM", "password": "duplicate-password"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["id"], duplicate.id)

    def test_django_authentication_backend_accepts_mixed_case_email(self):
        user = authenticate(
            username="CASE.owner@EXAMPLE.COM",
            password=self.password,
        )

        self.assertEqual(user, self.owner)

    def test_backup_login_accepts_mixed_case_email(self):
        response = self.client.post(
            "/login-old/",
            {"email": "case.OWNER@example.com", "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, 200)

    def test_staff_login_accepts_mixed_case_email(self):
        response = self.client.post(
            "/api/staff/login/",
            {
                "email": "CASE.staff@example.COM",
                "password": self.password,
                "role": "staff",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "staff")
