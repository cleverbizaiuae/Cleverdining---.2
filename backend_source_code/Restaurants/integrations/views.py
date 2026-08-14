from __future__ import annotations

import logging
import secrets

from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ChefStaff
from restaurant.models import Restaurant
from .dialog360_config import Dialog360ConfigurationError, configure_360dialog_webhook
from .whatsapp_360dialog import (
    handle_360dialog_webhook,
    verify_token_matches,
)

logger = logging.getLogger(__name__)


class Dialog360WebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        mode = request.query_params.get("hub.mode")
        token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")
        if mode == "subscribe" and challenge and verify_token_matches(token or ""):
            return HttpResponse(challenge, status=200, content_type="text/plain")
        return Response({"error": "Invalid 360dialog webhook verification token"}, status=status.HTTP_403_FORBIDDEN)

    def post(self, request):
        try:
            result = handle_360dialog_webhook(request.data if isinstance(request.data, dict) else {})
        except Exception:
            logger.exception("Unhandled 360dialog webhook processing failure")
            result = {"handled": False, "action": "processing_failed"}
        # Process before acknowledging so a short-lived web worker cannot drop the reply.
        return Response(result, status=status.HTTP_200_OK)


class Dialog360SettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get_restaurant(self, user):
        if getattr(user, "role", None) == "owner":
            return Restaurant.objects.filter(owner=user).first()
        if getattr(user, "role", None) in ["manager", "chef", "staff"]:
            staff = ChefStaff.objects.filter(user=user, action="accepted").first()
            return staff.restaurant if staff else None
        return None

    def _payload(self, request, restaurant: Restaurant) -> dict:
        callback_url = request.build_absolute_uri("/api/integrations/360dialog/webhook/")
        webhook_registered = restaurant.whatsapp_webhook_callback_url == callback_url
        configured = bool(
            restaurant.whatsapp_enabled
            and restaurant.whatsapp_phone_number_id
            and restaurant.whatsapp_access_token
            and webhook_registered
        )
        return {
            "provider": restaurant.whatsapp_provider or "manual",
            "enabled": bool(restaurant.whatsapp_enabled),
            "chatbotEnabled": bool(restaurant.whatsapp_chatbot_enabled),
            "wabaId": restaurant.whatsapp_waba_id or "",
            "phoneNumberId": restaurant.whatsapp_phone_number_id or "",
            "displayNumber": restaurant.whatsapp_business_display_number or "",
            "channelId": restaurant.whatsapp_360dialog_channel_id or "",
            "apiVersion": restaurant.whatsapp_api_version or "v20.0",
            "verifyToken": restaurant.whatsapp_webhook_verify_token or getattr(settings, "WHATSAPP_360DIALOG_VERIFY_TOKEN", ""),
            "callbackUrl": callback_url,
            "webhookRegistered": webhook_registered,
            "greetingTone": restaurant.whatsapp_greeting_tone or "classic",
            "emojiStyle": restaurant.whatsapp_emoji_style or "minimal",
            "signoff": restaurant.whatsapp_signoff or "",
            "specialPhrases": restaurant.whatsapp_special_phrases or {},
            "configured": configured,
        }

    def get(self, request):
        restaurant = self.get_restaurant(request.user)
        if not restaurant:
            return Response({"error": "No restaurant found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._payload(request, restaurant))

    def patch(self, request):
        restaurant = self.get_restaurant(request.user)
        if not restaurant:
            return Response({"error": "No restaurant found"}, status=status.HTTP_404_NOT_FOUND)

        mapping = {
            "enabled": "whatsapp_enabled",
            "provider": "whatsapp_provider",
            "chatbotEnabled": "whatsapp_chatbot_enabled",
            "wabaId": "whatsapp_waba_id",
            "phoneNumberId": "whatsapp_phone_number_id",
            "displayNumber": "whatsapp_business_display_number",
            "channelId": "whatsapp_360dialog_channel_id",
            "apiKey": "whatsapp_access_token",
            "verifyToken": "whatsapp_webhook_verify_token",
            "greetingTone": "whatsapp_greeting_tone",
            "emojiStyle": "whatsapp_emoji_style",
            "signoff": "whatsapp_signoff",
            "specialPhrases": "whatsapp_special_phrases",
        }
        updated = []
        for incoming, field in mapping.items():
            if incoming not in request.data:
                continue
            value = request.data.get(incoming)
            if incoming == "provider" and not value:
                value = "360dialog"
            if incoming == "apiKey" and not str(value or "").strip():
                continue
            setattr(restaurant, field, value)
            updated.append(field)
        if "provider" not in request.data:
            restaurant.whatsapp_provider = "360dialog"
            updated.append("whatsapp_provider")

        if not restaurant.whatsapp_webhook_verify_token:
            restaurant.whatsapp_webhook_verify_token = secrets.token_urlsafe(32)
            updated.append("whatsapp_webhook_verify_token")

        register_value = request.data.get("registerWebhook")
        register_webhook = (
            bool(restaurant.whatsapp_enabled and restaurant.whatsapp_chatbot_enabled)
            if register_value is None
            else str(register_value).strip().lower() in {"1", "true", "yes", "on"}
        )
        webhook_registered = False
        if register_webhook and restaurant.whatsapp_enabled and restaurant.whatsapp_chatbot_enabled:
            if not restaurant.whatsapp_phone_number_id:
                return Response(
                    {"phoneNumberId": ["Phone Number ID is required before enabling WhatsApp reservations."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not restaurant.whatsapp_access_token:
                return Response(
                    {"apiKey": ["360dialog API key is required before enabling WhatsApp reservations."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            callback_url = request.build_absolute_uri("/api/integrations/360dialog/webhook/")
            try:
                configure_360dialog_webhook(restaurant.whatsapp_access_token, callback_url)
            except Dialog360ConfigurationError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
            restaurant.whatsapp_webhook_callback_url = callback_url
            updated.append("whatsapp_webhook_callback_url")
            webhook_registered = True

        if updated:
            restaurant.save(update_fields=list(set(updated + ["updated_at"])))
        payload = self._payload(request, restaurant)
        if webhook_registered:
            payload["webhookRegistered"] = True
        return Response(payload)
