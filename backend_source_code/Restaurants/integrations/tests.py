from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from customer.models import WhatsAppConversation
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

    def inbound_payload(self, text="Hi", message_id="wamid.1", timestamp=None):
        timestamp = timestamp or str(int(timezone.now().timestamp()))
        return {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "waba-1",
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "waba_id": "waba-1",
                                "metadata": {
                                    "display_phone_number": "+15554446810",
                                    "phone_number_id": "phone-number-1",
                                },
                                "contacts": [{"profile": {"name": "Pranay"}, "wa_id": "971500001234"}],
                                "messages": [
                                    {
                                        "from": "971500001234",
                                        "id": message_id,
                                        "timestamp": timestamp,
                                        "text": {"body": text},
                                        "type": "text",
                                    }
                                ],
                            },
                        }
                    ],
                }
            ],
        }

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

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_greeting_starts_question_flow_and_sends_name_question(self, send):
        send.return_value = Mock(status_code=200, text="{}")

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "conversation_started")
        self.assertTrue(response.json()["outbound_sent"])
        conversation = WhatsAppConversation.objects.get(
            restaurant=self.restaurant,
            phone="971500001234",
            provider="360dialog",
        )
        self.assertEqual(conversation.state, "collecting")
        self.assertEqual(conversation.context["awaiting"], "name")
        request = send.call_args
        self.assertEqual(request.args[0], "https://waba-v2.360dialog.io/messages")
        self.assertEqual(request.kwargs["headers"]["D360-API-KEY"], "secret-api-key")
        self.assertIn("What name", request.kwargs["json"]["text"]["body"])

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_duplicate_message_id_is_ignored_without_second_reply(self, send):
        send.return_value = Mock(status_code=200, text="{}")
        payload = self.inbound_payload(message_id="wamid.duplicate")

        first_response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            payload,
            format="json",
        )
        second_response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            payload,
            format="json",
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(first_response.json()["action"], "conversation_started")
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["action"], "duplicate_ignored")
        self.assertFalse(second_response.json()["outbound_sent"])
        self.assertEqual(send.call_count, 1)

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_status_callback_does_not_trigger_a_reply(self, send):
        payload = self.inbound_payload()
        value = payload["entry"][0]["changes"][0]["value"]
        value.pop("messages")
        value["statuses"] = [{"id": "wamid.sent", "status": "delivered"}]

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["handled"])
        send.assert_not_called()

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_business_number_echo_does_not_trigger_a_reply(self, send):
        payload = self.inbound_payload()
        value = payload["entry"][0]["changes"][0]["value"]
        value["contacts"][0]["wa_id"] = "15554446810"
        value["messages"][0]["from"] = "+15554446810"

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["handled"])
        send.assert_not_called()

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_stale_replayed_message_does_not_restart_completed_conversation(self, send):
        conversation = WhatsAppConversation.objects.create(
            restaurant=self.restaurant,
            phone="971500001234",
            provider="360dialog",
            state="completed",
            context={"reservation_id": 123, "awaiting": None},
            last_message_id="wamid.latest",
        )
        old_timestamp = str(int((timezone.now() - timedelta(hours=1)).timestamp()))

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(
                text="Hi",
                message_id="wamid.old",
                timestamp=old_timestamp,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "stale_message_ignored")
        self.assertFalse(response.json()["outbound_sent"])
        send.assert_not_called()
        conversation.refresh_from_db()
        self.assertEqual(conversation.state, "completed")
        self.assertEqual(conversation.last_message_id, "wamid.latest")

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_complete_question_sequence_reaches_confirmation(self, send):
        send.return_value = Mock(status_code=200, text="{}")

        steps = [
            ("Hi", "conversation_started", "name", "What name"),
            ("Pranay", "requested_field", "guests", "How many guests"),
            ("2", "requested_field", "date", "Which date"),
            ("tomorrow", "requested_field", "time", "What time"),
            ("7:30pm", "requested_confirmation", None, "Reply YES to confirm"),
        ]

        for index, (text, action, awaiting, reply_text) in enumerate(steps, start=1):
            response = self.client.post(
                "/api/integrations/360dialog/webhook/",
                self.inbound_payload(text=text, message_id=f"wamid.sequence.{index}"),
                format="json",
            )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["action"], action)
            self.assertTrue(response.json()["outbound_sent"])
            if awaiting:
                self.assertEqual(response.json()["awaiting"], awaiting)
            self.assertIn(reply_text, send.call_args.kwargs["json"]["text"]["body"])

        conversation = WhatsAppConversation.objects.get(
            restaurant=self.restaurant,
            phone="971500001234",
            provider="360dialog",
        )
        self.assertEqual(conversation.state, "confirming")
        self.assertEqual(conversation.context["customer_name"], "Pranay")
        self.assertEqual(conversation.context["guests"], 2)
        self.assertEqual(conversation.context["time"], "19:30")

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_name_reply_formats_advance_to_guest_question(self, send):
        send.return_value = Mock(status_code=200, text="{}")

        name_replies = [
            ("Pranay", "Pranay"),
            ("Pranay Bhardwaj", "Pranay Bhardwaj"),
            ("Name- Pranay", "Pranay"),
            ("Name: Pranay Bhardwaj", "Pranay Bhardwaj"),
        ]

        for index, (reply, expected_name) in enumerate(name_replies, start=1):
            with self.subTest(reply=reply):
                WhatsAppConversation.objects.filter(restaurant=self.restaurant).delete()
                self.client.post(
                    "/api/integrations/360dialog/webhook/",
                    self.inbound_payload(message_id=f"wamid.name-start.{index}"),
                    format="json",
                )

                response = self.client.post(
                    "/api/integrations/360dialog/webhook/",
                    self.inbound_payload(text=reply, message_id=f"wamid.name-reply.{index}"),
                    format="json",
                )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["action"], "requested_field")
                self.assertEqual(response.json()["awaiting"], "guests")
                self.assertIn("How many guests", send.call_args.kwargs["json"]["text"]["body"])
                conversation = WhatsAppConversation.objects.get(
                    restaurant=self.restaurant,
                    phone="971500001234",
                    provider="360dialog",
                )
                self.assertEqual(conversation.context["customer_name"], expected_name)

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_conversation_schema_is_checked_before_state_lookup(self, send):
        send.return_value = Mock(status_code=200, text="{}")

        with patch("integrations.whatsapp_360dialog.ensure_customer_intelligence_schema") as ensure_schema:
            response = self.client.post(
                "/api/integrations/360dialog/webhook/",
                self.inbound_payload(),
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        ensure_schema.assert_called_once_with()

    def test_reservation_conversation_uses_dedicated_state_table(self):
        self.assertEqual(
            WhatsAppConversation._meta.db_table,
            "whatsapp_reservation_conversations",
        )

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_greeting_restarts_an_in_progress_conversation(self, send):
        send.return_value = Mock(status_code=200, text="{}")
        WhatsAppConversation.objects.create(
            restaurant=self.restaurant,
            phone="971500001234",
            provider="360dialog",
            state="collecting",
            context={"customer_name": "Old Name", "awaiting": "guests"},
        )

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(text="Hi", message_id="wamid.restart"),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "conversation_started")
        self.assertEqual(response.json()["awaiting"], "name")
        conversation = WhatsAppConversation.objects.get(
            restaurant=self.restaurant,
            phone="971500001234",
            provider="360dialog",
        )
        self.assertEqual(conversation.context, {"awaiting": "name"})
        self.assertIn("What name", send.call_args.kwargs["json"]["text"]["body"])

    @patch("integrations.whatsapp_360dialog.requests.post")
    @patch("integrations.whatsapp_360dialog._upsert_lead")
    def test_lead_failure_does_not_block_question_reply(self, upsert, send):
        upsert.side_effect = RuntimeError("lead table unavailable")
        send.return_value = Mock(status_code=200, text="{}")

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "conversation_started")
        self.assertFalse(response.json()["lead_recorded"])
        self.assertTrue(response.json()["outbound_sent"])
        send.assert_called_once()

    @patch("integrations.whatsapp_360dialog.requests.post")
    @patch("integrations.whatsapp_360dialog._get_conversation")
    def test_conversation_failure_still_sends_stateless_greeting(self, get_conversation, send):
        get_conversation.side_effect = RuntimeError("conversation table unavailable")
        send.return_value = Mock(status_code=200, text="{}")

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "conversation_started")
        self.assertFalse(response.json()["conversation_persisted"])
        self.assertTrue(response.json()["outbound_sent"])
        send.assert_called_once()

    @patch("integrations.whatsapp_360dialog.requests.post")
    def test_rejected_outbound_send_is_not_reported_as_success(self, send):
        send.return_value = Mock(status_code=401, text='{"error": "invalid api key"}')

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["handled"])
        self.assertFalse(response.json()["outbound_sent"])
        self.assertEqual(response.json()["action"], "outbound_send_failed")
        self.assertEqual(response.json()["intended_action"], "conversation_started")

    @patch("integrations.views.handle_360dialog_webhook")
    def test_unhandled_processing_failure_is_acknowledged_and_logged(self, handle):
        handle.side_effect = RuntimeError("unexpected")

        response = self.client.post(
            "/api/integrations/360dialog/webhook/",
            self.inbound_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["handled"])
        self.assertEqual(response.json()["action"], "processing_failed")
