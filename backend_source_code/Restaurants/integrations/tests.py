from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from restaurant.models import Restaurant

from .dialog360_config import Dialog360ConfigurationError


class Dialog360IntegrationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="dialog360-owner@example.com",
            username="dialog360-owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="360dialog Test Restaurant",
            location="Dubai",
            phone_number="+971500002001",
            owner=self.owner,
            whatsapp_enabled=True,
            whatsapp_chatbot_enabled=True,
            whatsapp_provider="360dialog",
            whatsapp_waba_id="waba-1",
            whatsapp_phone_number_id="phone-number-1",
            whatsapp_business_display_number="+15554446810",
            whatsapp_access_token="secret-api-key",
        )
        self.client = APIClient()

    @patch("integrations.views.configure_360dialog_webhook")
    def test_existing_dashboard_save_registers_webhook_without_flag(self, configure):
        self.client.force_authenticate(self.owner)

        response = self.client.patch(
            "/owners/whatsapp/360dialog-settings/",
            {
                "enabled": True,
                "chatbotEnabled": True,
                "phoneNumberId": "phone-number-1",
                "displayNumber": "+15554446810",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["configured"])
        self.assertTrue(response.json()["webhookRegistered"])
        configure.assert_called_once_with(
            "secret-api-key",
            "http://testserver/api/integrations/360dialog/webhook/",
        )
        self.restaurant.refresh_from_db()
        self.assertEqual(
            self.restaurant.whatsapp_webhook_callback_url,
            "http://testserver/api/integrations/360dialog/webhook/",
        )

    @patch("integrations.views.configure_360dialog_webhook")
    def test_failed_registration_does_not_report_connected(self, configure):
        configure.side_effect = Dialog360ConfigurationError("Registration failed")
        self.client.force_authenticate(self.owner)

        response = self.client.patch(
            "/owners/whatsapp/360dialog-settings/",
            {"enabled": True, "chatbotEnabled": True},
            format="json",
        )

        self.assertEqual(response.status_code, 502)
        self.restaurant.refresh_from_db()
        self.assertFalse(bool(self.restaurant.whatsapp_webhook_callback_url))

    @patch("integrations.views.handle_360dialog_webhook")
    def test_inbound_webhook_is_processed_before_acknowledgement(self, handle):
        handle.return_value = {"received": True, "action": "greeted"}
        payload = {"messages": [{"id": "wamid.1", "text": {"body": "Hi"}}]}

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "greeted")
        handle.assert_called_once_with(payload)
