from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable

from django.conf import settings
from django.db import DatabaseError, connection
from django.db.models import Q

from .models import Integration


@dataclass(frozen=True)
class DetectedIntegration:
    provider_key: str
    name: str
    category: str
    notes: str
    logo_url: str = ""
    monthly_cost: Decimal = Decimal("0")
    currency: str = "USD"
    status: str = Integration.Status.ACTIVE
    connection_status: str = Integration.ConnectionStatus.REQUIRES_CONFIGURATION
    api_health: str = Integration.ApiHealth.UNKNOWN
    environment: str = ""
    documentation_url: str = ""

    def values(self) -> dict[str, Any]:
        return {
            "provider_key": self.provider_key,
            "name": self.name,
            "category": self.category,
            "notes": self.notes,
            "logo_url": self.logo_url,
            "monthly_cost": self.monthly_cost,
            "currency": self.currency,
            "status": self.status,
            "connection_status": self.connection_status,
            "api_health": self.api_health,
            "environment": self.environment,
            "documentation_url": self.documentation_url,
        }


ROOT = Path(settings.BASE_DIR).resolve()
REPO_ROOT = ROOT.parent.parent
PAYMENT_LOGOS = {
    "stripe": "https://stripe.com/favicon.ico",
    "checkout": "https://www.checkout.com/favicon.ico",
    "paytabs": "https://site.paytabs.com/favicon.ico",
    "payme": "https://www.payme.com/favicon.ico",
    "adyen": "https://www.adyen.com/favicon.ico",
    "worldpay": "https://developer.worldpay.com/favicon.ico",
    "sumup": "https://www.sumup.com/favicon.ico",
    "square": "https://squareup.com/favicon.ico",
}


def _env_any(keys: Iterable[str]) -> bool:
    for key in keys:
        value = os.getenv(key, "") or str(getattr(settings, key, "") or "")
        if str(value).strip():
            return True
    return False


def _file_exists(*parts: str) -> bool:
    return (REPO_ROOT.joinpath(*parts)).exists() or (ROOT.joinpath(*parts)).exists()


def _configured(value: bool) -> str:
    return Integration.ConnectionStatus.CONFIGURED if value else Integration.ConnectionStatus.REQUIRES_CONFIGURATION


def _database_integration() -> DetectedIntegration:
    db = settings.DATABASES.get("default", {})
    engine = str(db.get("ENGINE", "")).lower()
    if "postgresql" in engine:
        name = "PostgreSQL"
        logo = "https://www.postgresql.org/favicon.ico"
        docs = "https://www.postgresql.org/docs/"
    elif "sqlite" in engine:
        name = "SQLite"
        logo = ""
        docs = "https://www.sqlite.org/docs.html"
    else:
        name = db.get("ENGINE", "Database") or "Database"
        logo = ""
        docs = ""

    try:
        connection.ensure_connection()
        health = Integration.ApiHealth.HEALTHY
        connection_status = Integration.ConnectionStatus.CONNECTED
    except Exception:
        health = Integration.ApiHealth.ERROR
        connection_status = Integration.ConnectionStatus.ERROR

    host = db.get("HOST") or "local file"
    return DetectedIntegration(
        provider_key="database:default",
        name=name,
        category=Integration.Category.DATABASE,
        logo_url=logo,
        notes=f"Primary Django database configured through {engine or 'Django settings'} at {host}.",
        connection_status=connection_status,
        api_health=health,
        environment="production" if not getattr(settings, "DEBUG", False) else "development",
        documentation_url=docs,
    )


def _payment_integrations() -> list[DetectedIntegration]:
    try:
        from payment.models import Payment, PaymentGateway, StripeDetails
        from payment.provider_registry import PAYMENT_PROVIDER_CODES, PROVIDER_METADATA
        from payment.provider_views import LEGACY_PROVIDER_PAYLOADS
    except Exception:
        return []

    providers = list(PAYMENT_PROVIDER_CODES)
    if "paytabs" not in providers:
        providers.append("paytabs")

    rows: list[DetectedIntegration] = []
    for provider in providers:
        meta = PROVIDER_METADATA.get(provider)
        legacy = LEGACY_PROVIDER_PAYLOADS.get(provider, {})
        name = meta.name if meta else legacy.get("name", provider.title())
        docs = meta.documentation_url if meta else legacy.get("documentationUrl", "")
        logo = (meta.logo_url if meta else legacy.get("logoUrl", "")) or PAYMENT_LOGOS.get(provider, "")
        notes = meta.description if meta else legacy.get("description", "Payment provider integration.")
        status_label = getattr(meta, "status_label", legacy.get("statusLabel", ""))
        if status_label:
            notes = f"{notes} Provider status: {status_label}."

        connected = False
        configured = False
        monthly_count = 0
        try:
            gateways = PaymentGateway.objects.filter(provider=provider)
            connected = gateways.filter(connection_status="connected", is_enabled=True).exists()
            configured = gateways.filter(is_enabled=True).filter(
                Q(connection_status="connected") | Q(key_id__gt="") | Q(credentials_encrypted__gt="")
            ).exists()
        except DatabaseError:
            # Some local/dev databases lag behind payment migrations. Detection should
            # degrade to environment/schema signals instead of breaking integrations.
            configured = False
        try:
            monthly_count = Payment.objects.filter(provider=provider).count()
        except DatabaseError:
            monthly_count = 0
        if provider == "stripe":
            try:
                has_legacy_stripe = StripeDetails.objects.exists()
            except DatabaseError:
                has_legacy_stripe = False
            configured = configured or has_legacy_stripe or _env_any(["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"])

        if connected:
            connection_status = Integration.ConnectionStatus.CONNECTED
            api_health = Integration.ApiHealth.HEALTHY
        elif configured:
            connection_status = Integration.ConnectionStatus.CONFIGURED
            api_health = Integration.ApiHealth.UNKNOWN
        else:
            connection_status = Integration.ConnectionStatus.REQUIRES_CONFIGURATION
            api_health = Integration.ApiHealth.UNKNOWN

        if monthly_count:
            notes = f"{notes} Existing payment records found for this provider."

        rows.append(
            DetectedIntegration(
                provider_key=f"payment:{provider}",
                name=name,
                category=Integration.Category.PAYMENTS,
                logo_url=logo,
                notes=notes,
                connection_status=connection_status,
                api_health=api_health,
                environment="sandbox/live per restaurant gateway",
                documentation_url=docs,
            )
        )
    return rows


def _whatsapp_360dialog_integration() -> DetectedIntegration | None:
    if not _file_exists("backend_source_code", "Restaurants", "integrations", "whatsapp_360dialog.py") and not _file_exists("integrations", "whatsapp_360dialog.py"):
        return None
    try:
        from restaurant.models import Restaurant

        configured = Restaurant.objects.filter(
            whatsapp_enabled=True,
            whatsapp_provider__iexact="360dialog",
            whatsapp_phone_number_id__isnull=False,
            whatsapp_access_token__isnull=False,
        ).exclude(whatsapp_phone_number_id="").exclude(whatsapp_access_token="").exists()
    except Exception:
        configured = False

    return DetectedIntegration(
        provider_key="messaging:360dialog",
        name="360dialog WhatsApp Business",
        category=Integration.Category.MESSAGING,
        logo_url="https://www.360dialog.com/favicon.ico",
        monthly_cost=Decimal("49"),
        notes="360dialog WhatsApp Business API webhook and reservation chatbot integration.",
        connection_status=_configured(configured),
        api_health=Integration.ApiHealth.UNKNOWN,
        environment="per restaurant",
        documentation_url="https://docs.360dialog.com/",
    )


def _vapi_integration() -> list[DetectedIntegration]:
    rows: list[DetectedIntegration] = []
    if _file_exists("backend_source_code", "Restaurants", "vapi") or _file_exists("vapi"):
        try:
            from vapi.models import Assistance

            has_assistance = Assistance.objects.exists()
        except Exception:
            has_assistance = False
        configured = _env_any(["VAPI_API"]) or has_assistance
        rows.append(
            DetectedIntegration(
                provider_key="ai:vapi",
                name="Vapi",
                category=Integration.Category.AI,
                logo_url="https://vapi.ai/favicon.ico",
                notes="Voice AI assistance integration for reservation and support workflows.",
                connection_status=_configured(configured),
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="server API key",
                documentation_url="https://docs.vapi.ai/",
            )
        )
        rows.append(
            DetectedIntegration(
                provider_key="messaging:twilio-voice",
                name="Twilio Voice",
                category=Integration.Category.MESSAGING,
                logo_url="https://www.twilio.com/favicon.ico",
                notes="Twilio number credentials are stored with the Vapi assistance setup.",
                connection_status=_configured(has_assistance),
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="per assistance record",
                documentation_url="https://www.twilio.com/docs/voice",
            )
        )
    if _env_any(["OPENAI_API_KEY"]):
        rows.append(
            DetectedIntegration(
                provider_key="ai:openai",
                name="OpenAI",
                category=Integration.Category.AI,
                logo_url="https://openai.com/favicon.ico",
                notes="OpenAI API key is available in backend settings for AI workflows.",
                connection_status=Integration.ConnectionStatus.CONFIGURED,
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="server API key",
                documentation_url="https://platform.openai.com/docs",
            )
        )
    return rows


def _storage_integration() -> DetectedIntegration | None:
    implemented = _file_exists("backend_source_code", "Restaurants", "requirements.txt")
    if not implemented:
        return None
    configured = _env_any(["GS_BUCKET_NAME", "GS_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS"])
    return DetectedIntegration(
        provider_key="storage:google-cloud-storage",
        name="Google Cloud Storage",
        category="Storage" if "Storage" in dict(Integration.Category.choices) else Integration.Category.INFRASTRUCTURE,
        logo_url="https://cloud.google.com/favicon.ico",
        notes="Django media storage supports Google Cloud Storage when GS_BUCKET_NAME is configured.",
        connection_status=_configured(configured),
        api_health=Integration.ApiHealth.UNKNOWN,
        environment="production bucket" if configured else "not configured",
        documentation_url="https://cloud.google.com/storage/docs",
    )


def _smtp_email_integration() -> DetectedIntegration:
    configured = _env_any(["EMAIL", "EMAIL_HOST_USER"])
    backend = getattr(settings, "EMAIL_BACKEND", "")
    return DetectedIntegration(
        provider_key="email:smtp",
        name="SMTP Email",
        category=Integration.Category.MESSAGING,
        logo_url="",
        notes=f"Django email backend: {backend or 'not configured'}.",
        connection_status=_configured(configured),
        api_health=Integration.ApiHealth.UNKNOWN,
        environment="smtp.gmail.com" if configured else "console fallback",
        documentation_url="https://docs.djangoproject.com/en/stable/topics/email/",
    )


def _sentry_integration() -> DetectedIntegration:
    configured = _env_any(["SENTRY_DSN", "VITE_SENTRY_DSN"])
    return DetectedIntegration(
        provider_key="analytics:sentry",
        name="Sentry",
        category=Integration.Category.ANALYTICS,
        logo_url="https://sentry.io/_assets/favicon.ico",
        notes="Sentry is wired for backend Django and frontend React error monitoring when DSNs are configured.",
        connection_status=_configured(configured),
        api_health=Integration.ApiHealth.UNKNOWN,
        environment=getattr(settings, "SENTRY_ENVIRONMENT", "production" if not getattr(settings, "DEBUG", False) else "development") or "",
        documentation_url="https://docs.sentry.io/",
    )


def _redis_integration() -> DetectedIntegration:
    channel_backend = str(settings.CHANNEL_LAYERS.get("default", {}).get("BACKEND", ""))
    configured = "channels_redis" in channel_backend or _env_any(["REDIS_URL", "REDIS_HOST"])
    return DetectedIntegration(
        provider_key="infrastructure:redis",
        name="Redis Channels",
        category=Integration.Category.INFRASTRUCTURE,
        logo_url="https://redis.io/favicon.ico",
        notes=f"Django Channels backend: {channel_backend or 'not configured'}.",
        connection_status=Integration.ConnectionStatus.CONFIGURED if configured else Integration.ConnectionStatus.REQUIRES_CONFIGURATION,
        api_health=Integration.ApiHealth.UNKNOWN,
        environment="websocket/cache infrastructure",
        documentation_url="https://redis.io/docs/",
    )


def _infrastructure_integrations() -> list[DetectedIntegration]:
    rows: list[DetectedIntegration] = []
    if _file_exists("render.yaml") or "render.com" in str(settings.DATABASES.get("default", {}).get("HOST", "")):
        rows.append(
            DetectedIntegration(
                provider_key="infrastructure:render",
                name="Render",
                category=Integration.Category.INFRASTRUCTURE,
                logo_url="https://render.com/favicon.ico",
                notes="Render is used for backend hosting and the active managed PostgreSQL endpoint.",
                connection_status=Integration.ConnectionStatus.CONFIGURED,
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="production",
                documentation_url="https://render.com/docs",
            )
        )
    if _file_exists("netlify.toml"):
        rows.append(
            DetectedIntegration(
                provider_key="infrastructure:netlify",
                name="Netlify",
                category=Integration.Category.INFRASTRUCTURE,
                logo_url="https://www.netlify.com/favicon.ico",
                notes="Netlify deployment config proxies frontend API requests to the backend service.",
                connection_status=Integration.ConnectionStatus.CONFIGURED,
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="frontend hosting",
                documentation_url="https://docs.netlify.com/",
            )
        )
    if _file_exists("docker-compose.yml") or _file_exists("backend_source_code", "Restaurants", "Dockerfile"):
        rows.append(
            DetectedIntegration(
                provider_key="infrastructure:docker",
                name="Docker",
                category=Integration.Category.INFRASTRUCTURE,
                logo_url="https://www.docker.com/favicon.ico",
                notes="Dockerfile and docker-compose services exist for backend, PostgreSQL, and Redis runtime support.",
                connection_status=Integration.ConnectionStatus.CONFIGURED,
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="local/deployment runtime",
                documentation_url="https://docs.docker.com/",
            )
        )
    return rows


def _frontend_vendor_integrations() -> list[DetectedIntegration]:
    rows: list[DetectedIntegration] = []
    dashboard_pkg = REPO_ROOT / "frontend-sorce-code" / "dashboard_appllication_source_code" / "clever-biz-web-main" / "package.json"
    device_pkg = REPO_ROOT / "frontend-sorce-code" / "device_application_source_code" / "clever-biz-mobile-main" / "package.json"
    pkg_text = ""
    for path in [dashboard_pkg, device_pkg]:
        try:
            pkg_text += path.read_text(encoding="utf-8")
        except Exception:
            pass
    if "@zegocloud/zego-uikit-prebuilt" in pkg_text or "zego-zim-web" in pkg_text:
        rows.append(
            DetectedIntegration(
                provider_key="messaging:zegocloud",
                name="ZEGOCLOUD",
                category=Integration.Category.MESSAGING,
                logo_url="https://www.zegocloud.com/favicon.ico",
                notes="ZEGOCLOUD UI kit dependencies are present in dashboard and device frontend apps.",
                connection_status=Integration.ConnectionStatus.REQUIRES_CONFIGURATION,
                api_health=Integration.ApiHealth.UNKNOWN,
                environment="frontend SDK",
                documentation_url="https://docs.zegocloud.com/",
            )
        )
    return rows


def detect_integrations() -> list[dict[str, Any]]:
    detected: list[DetectedIntegration] = [_database_integration()]
    detected.extend(_payment_integrations())
    whatsapp = _whatsapp_360dialog_integration()
    if whatsapp:
        detected.append(whatsapp)
    detected.extend(_vapi_integration())
    storage = _storage_integration()
    if storage:
        detected.append(storage)
    detected.extend([_smtp_email_integration(), _sentry_integration(), _redis_integration()])
    detected.extend(_infrastructure_integrations())
    detected.extend(_frontend_vendor_integrations())

    unique: dict[str, DetectedIntegration] = {}
    for item in detected:
        unique[item.provider_key] = item
    return [item.values() for item in unique.values()]


def sync_detected_integrations() -> list[Integration]:
    rows = detect_integrations()
    synced: list[Integration] = []
    for data in rows:
        key = data["provider_key"]
        name = data["name"]
        existing = Integration.objects.filter(provider_key=key).first()
        if not existing:
            existing = Integration.objects.filter(name__iexact=name, provider_key="").first()
        if not existing:
            synced.append(Integration.objects.create(**data))
            continue

        update_fields: list[str] = []
        computed_fields = ["provider_key", "connection_status", "api_health", "environment", "documentation_url"]
        for field in computed_fields:
            value = data.get(field, "")
            if getattr(existing, field) != value:
                setattr(existing, field, value)
                update_fields.append(field)

        # Fill missing display metadata for older/manual records, but do not overwrite edits.
        for field in ["logo_url", "notes", "category"]:
            value = data.get(field)
            if value and not getattr(existing, field):
                setattr(existing, field, value)
                update_fields.append(field)

        if update_fields:
            existing.save(update_fields=list(set(update_fields + ["updated_at"])))
        synced.append(existing)
    return synced
