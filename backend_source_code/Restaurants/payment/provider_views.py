from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ChefStaff
from order.models import Order
from restaurant.models import Restaurant
from restaurant.region_config import get_region_config
from .models import Payment, PaymentGateway
from .provider_registry import PAYMENT_PROVIDER_CODES, get_provider, provider_metadata_payload
from .serializers import PaymentGatewaySerializer
from .services import PaymentService


LEGACY_PROVIDER_PAYLOADS = {
    "paytabs": {
        "code": "paytabs",
        "name": "PayTabs",
        "logoUrl": "",
        "description": "Legacy MENA hosted payments integration retained for existing UAE restaurants.",
        "documentationUrl": "https://site.paytabs.com/en/developers/",
        "supportedCountries": ["UAE", "MENA"],
        "supportedCurrencies": ["AED", "USD"],
        "supportedPaymentMethods": ["card", "apple_pay"],
        "statusLabel": "deprecated",
        "credentialFields": [
            {"key": "profile_id", "label": "Profile ID", "secret": False, "required": True, "placeholder": ""},
            {"key": "server_key", "label": "Server Key", "secret": True, "required": True, "placeholder": ""},
        ],
    }
}


def _bool_from_payload(value, default=None):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "on"}


def _restaurant_from_request(request, required=True):
    user = request.user
    restaurant_id = (
        request.data.get("restaurantId")
        or request.data.get("restaurant_id")
        or request.query_params.get("restaurantId")
        or request.query_params.get("restaurant_id")
    )

    if getattr(user, "is_superuser", False) and restaurant_id:
        try:
            return Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist:
            raise ValidationError("Restaurant not found")

    if getattr(user, "role", "") == "owner":
        restaurant = user.restaurants.first()
        if restaurant:
            return restaurant

    if getattr(user, "role", "") == "manager":
        staff_link = ChefStaff.objects.filter(user=user, action="accepted").first()
        if staff_link:
            return staff_link.restaurant

    if required:
        raise ValidationError("You do not have a valid restaurant association.")
    return None


def _provider_payload(provider, restaurant=None):
    if provider in LEGACY_PROVIDER_PAYLOADS:
        payload = dict(LEGACY_PROVIDER_PAYLOADS[provider])
    else:
        payload = provider_metadata_payload(provider)

    gateways = PaymentGateway.objects.filter(provider=provider)
    month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    payments = Payment.objects.filter(provider=provider, created_at__gte=month_start)
    completed = payments.filter(status="completed")
    total_count = payments.count()
    volume = completed.aggregate(total=Sum("amount")).get("total") or Decimal("0")
    success_rate = (completed.count() / total_count * 100) if total_count else 0

    payload.update(
        {
            "category": "Payments",
            "connectionStatus": "connected" if gateways.filter(connection_status="connected").exists() else "not_configured",
            "totalRestaurantsUsing": gateways.filter(is_enabled=True).values("restaurant_id").distinct().count(),
            "monthlyProcessedPayments": completed.count(),
            "monthlyTransactionVolume": str(volume),
            "successRate": round(success_rate, 2),
            "webhookStatus": "healthy" if gateways.filter(webhook_status="healthy").exists() else "unknown",
            "apiHealth": "healthy" if gateways.filter(connection_status="connected").exists() else "unknown",
        }
    )

    if restaurant:
        gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider).first()
        payload.update(
            {
                "isAllowed": bool(gateway and gateway.is_enabled),
                "isConfigured": bool(gateway and gateway.has_credentials()),
                "isActive": bool(gateway and gateway.is_active),
                "gateway": PaymentGatewaySerializer(gateway).data if gateway else None,
            }
        )
    return payload


class PaymentProviderListAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        restaurant = None
        restaurant_id = request.query_params.get("restaurantId") or request.query_params.get("restaurant_id")
        if restaurant_id:
            restaurant = Restaurant.objects.filter(id=restaurant_id).first()
        providers = list(PAYMENT_PROVIDER_CODES) + ["paytabs"]
        return Response([_provider_payload(provider, restaurant=restaurant) for provider in providers])


class EnabledPaymentProvidersAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        restaurant = _restaurant_from_request(request)
        assigned = list(PaymentGateway.objects.filter(restaurant=restaurant, is_enabled=True).order_by("provider"))
        if assigned:
            return Response(PaymentGatewaySerializer(assigned, many=True).data)

        # Backward-compatible fallback for restaurants not yet assigned by Super Admin.
        providers = [p for p in get_region_config(getattr(restaurant, "region", "UAE")).get("payments", []) if p != "cash"]
        payload = []
        for provider in providers:
            gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider).first()
            if gateway:
                payload.append(PaymentGatewaySerializer(gateway).data)
            else:
                meta = _provider_payload(provider, restaurant=restaurant)
                meta.update({"provider": provider, "isEnabled": True, "is_active": False})
                payload.append(meta)
        return Response(payload)


class PaymentProviderConnectAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, provider):
        restaurant = _restaurant_from_request(request)
        provider = provider.strip().lower()
        if provider not in PAYMENT_PROVIDER_CODES and provider != "paytabs":
            raise ValidationError(f"Unsupported payment provider: {provider}")

        credentials = request.data.get("credentials") or {}
        gateway, _ = PaymentGateway.objects.get_or_create(
            restaurant=restaurant,
            provider=provider,
            defaults={"is_enabled": True},
        )
        gateway.is_enabled = _bool_from_payload(request.data.get("isEnabled"), True)
        gateway.sandbox_mode = _bool_from_payload(request.data.get("sandboxMode"), gateway.sandbox_mode)
        gateway.is_active = _bool_from_payload(request.data.get("is_active"), request.data.get("isActive", gateway.is_active))
        if credentials:
            gateway.set_credentials(credentials)

        if provider == "paytabs":
            if gateway.has_credentials():
                gateway.connection_status = "connected"
                gateway.last_validation_at = timezone.now()
                gateway.last_error = ""
            else:
                gateway.connection_status = "not_configured"
        elif credentials or gateway.has_credentials():
            try:
                get_provider(provider, gateway).validate_credentials()
                gateway.connection_status = "connected"
                gateway.last_validation_at = timezone.now()
                gateway.last_error = ""
            except Exception as exc:
                gateway.connection_status = "error"
                gateway.last_validation_at = timezone.now()
                gateway.last_error = str(exc)
                gateway.save()
                return Response({"error": str(exc), "gateway": PaymentGatewaySerializer(gateway).data}, status=status.HTTP_400_BAD_REQUEST)

        gateway.save()
        return Response(PaymentGatewaySerializer(gateway).data, status=status.HTTP_200_OK)


class PaymentProviderDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, provider):
        restaurant = _restaurant_from_request(request)
        provider = provider.strip().lower()
        gateway, _ = PaymentGateway.objects.get_or_create(
            restaurant=restaurant,
            provider=provider,
            defaults={"is_enabled": True},
        )
        data = dict(request.data)
        data.pop("restaurantId", None)
        data.pop("restaurant_id", None)
        serializer = PaymentGatewaySerializer(gateway, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        gateway = serializer.save(restaurant=restaurant)
        return Response(PaymentGatewaySerializer(gateway).data)

    def delete(self, request, provider):
        restaurant = _restaurant_from_request(request)
        gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider.strip().lower()).first()
        if not gateway:
            return Response(status=status.HTTP_204_NO_CONTENT)
        gateway.is_active = False
        gateway.connection_status = "disabled"
        gateway.last_error = "Disconnected by user"
        gateway.save(update_fields=["is_active", "connection_status", "last_error", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PaymentProviderTestAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, provider):
        restaurant = _restaurant_from_request(request)
        gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider.strip().lower()).first()
        if not gateway:
            return Response({"error": "Provider is not assigned to this restaurant"}, status=status.HTTP_404_NOT_FOUND)
        try:
            if gateway.provider == "paytabs":
                if not gateway.has_credentials():
                    raise ValidationError("Missing required credentials")
                result = {"ok": True, "provider": gateway.provider, "checkedAt": timezone.now().isoformat()}
            else:
                result = get_provider(gateway.provider, gateway).health_check()
            gateway.connection_status = "connected"
            gateway.last_health_check_at = timezone.now()
            gateway.last_error = ""
            gateway.save(update_fields=["connection_status", "last_health_check_at", "last_error", "updated_at"])
            return Response({"ok": True, "result": result, "gateway": PaymentGatewaySerializer(gateway).data})
        except Exception as exc:
            gateway.connection_status = "error"
            gateway.last_health_check_at = timezone.now()
            gateway.last_error = str(exc)
            gateway.save(update_fields=["connection_status", "last_health_check_at", "last_error", "updated_at"])
            return Response({"ok": False, "error": str(exc), "gateway": PaymentGatewaySerializer(gateway).data}, status=status.HTTP_400_BAD_REQUEST)


class PaymentProviderStatusAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, provider):
        restaurant = _restaurant_from_request(request)
        gateway = PaymentGateway.objects.filter(restaurant=restaurant, provider=provider.strip().lower()).first()
        if not gateway:
            return Response({"provider": provider, "connectionStatus": "not_configured", "isConfigured": False})
        return Response(PaymentGatewaySerializer(gateway).data)


class PaymentProviderWebhookAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, provider):
        result = PaymentService.handle_webhook(provider.strip().lower(), request)
        return Response({"status": "received", "result": result}, status=status.HTTP_200_OK)
