from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from django.utils import timezone
from rest_framework.exceptions import ValidationError


@dataclass(frozen=True)
class CredentialField:
    key: str
    label: str
    secret: bool = True
    required: bool = True
    placeholder: str = ""


@dataclass(frozen=True)
class ProviderMetadata:
    code: str
    name: str
    logo_url: str
    description: str
    documentation_url: str
    supported_countries: List[str]
    supported_currencies: List[str]
    supported_payment_methods: List[str]
    status_label: str = "recommended"
    credentials: List[CredentialField] = field(default_factory=list)


PAYMENT_PROVIDER_CODES = ["stripe", "checkout", "payme", "adyen", "worldpay", "sumup", "square"]


def provider_choices(include_legacy: bool = True):
    choices = [
        ("stripe", "Stripe"),
        ("checkout", "Checkout.com"),
        ("payme", "PayMe"),
        ("adyen", "Adyen"),
        ("worldpay", "Worldpay"),
        ("sumup", "SumUp"),
        ("square", "Square"),
    ]
    if include_legacy:
        # PayTabs remains supported for existing UAE restaurants.
        choices.insert(2, ("paytabs", "PayTabs"))
    return choices

PROVIDER_METADATA: Dict[str, ProviderMetadata] = {
    "stripe": ProviderMetadata(
        code="stripe",
        name="Stripe",
        logo_url="https://stripe.com/favicon.ico",
        description="Card, wallet, and hosted checkout payments.",
        documentation_url="https://docs.stripe.com/payments/checkout",
        supported_countries=["UAE", "UK", "US", "EU"],
        supported_currencies=["AED", "GBP", "USD", "EUR"],
        supported_payment_methods=["card", "apple_pay", "google_pay"],
        status_label="recommended",
        credentials=[
            CredentialField("publishable_key", "Publishable Key", secret=False, placeholder="pk_live_..."),
            CredentialField("secret_key", "Secret Key", secret=True, placeholder="sk_live_..."),
            CredentialField("webhook_secret", "Webhook Secret", secret=True, required=False, placeholder="whsec_..."),
        ],
    ),
    "checkout": ProviderMetadata(
        code="checkout",
        name="Checkout.com",
        logo_url="",
        description="Hosted Payments Page for card and wallet payments.",
        documentation_url="https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-a-hosted-page",
        supported_countries=["UAE", "UK", "US", "EU"],
        supported_currencies=["AED", "GBP", "USD", "EUR"],
        supported_payment_methods=["card", "apple_pay", "google_pay"],
        status_label="recommended",
        credentials=[
            CredentialField("public_key", "Public Key", secret=False, placeholder="pk_..."),
            CredentialField("secret_key", "Secret Key", secret=True, placeholder="sk_..."),
            CredentialField("webhook_secret", "Webhook Secret", secret=True, required=False),
        ],
    ),
    "payme": ProviderMetadata(
        code="payme",
        name="PayMe",
        logo_url="",
        description="Open banking provider for UK bank payments.",
        documentation_url="https://www.payme.com/",
        supported_countries=["UK"],
        supported_currencies=["GBP"],
        supported_payment_methods=["open_banking", "bank_transfer"],
        status_label="beta",
        credentials=[
            CredentialField("merchant_id", "Merchant ID", secret=False),
            CredentialField("api_key", "API Key", secret=True),
            CredentialField("secret", "Secret", secret=True, required=False),
            CredentialField("webhook_url", "Webhook URL", secret=False, required=False),
        ],
    ),
    "adyen": ProviderMetadata(
        code="adyen",
        name="Adyen",
        logo_url="",
        description="Enterprise acquiring, cards, wallets, and local payment methods.",
        documentation_url="https://docs.adyen.com/online-payments/",
        supported_countries=["UAE", "UK", "US", "EU"],
        supported_currencies=["AED", "GBP", "USD", "EUR"],
        supported_payment_methods=["card", "apple_pay", "google_pay", "local_methods"],
        status_label="beta",
        credentials=[
            CredentialField("merchant_account", "Merchant Account", secret=False),
            CredentialField("api_key", "API Key", secret=True),
            CredentialField("client_key", "Client Key", secret=False),
            CredentialField("hmac_key", "HMAC Key", secret=True, required=False),
            CredentialField("webhook_username", "Webhook Username", secret=True, required=False),
            CredentialField("webhook_password", "Webhook Password", secret=True, required=False),
        ],
    ),
    "worldpay": ProviderMetadata(
        code="worldpay",
        name="Worldpay",
        logo_url="",
        description="Card acquiring and hosted payment integrations.",
        documentation_url="https://developer.worldpay.com/",
        supported_countries=["UK", "US", "EU"],
        supported_currencies=["GBP", "USD", "EUR"],
        supported_payment_methods=["card", "wallets"],
        status_label="beta",
        credentials=[
            CredentialField("merchant_code", "Merchant Code", secret=False),
            CredentialField("service_key", "Service Key", secret=True),
            CredentialField("username", "Username", secret=False),
            CredentialField("password", "Password", secret=True),
            CredentialField("webhook_secret", "Webhook Secret", secret=True, required=False),
        ],
    ),
    "sumup": ProviderMetadata(
        code="sumup",
        name="SumUp",
        logo_url="",
        description="Simple card and merchant checkout payments.",
        documentation_url="https://developer.sumup.com/",
        supported_countries=["UK", "EU", "US"],
        supported_currencies=["GBP", "EUR", "USD"],
        supported_payment_methods=["card", "payment_link"],
        status_label="beta",
        credentials=[
            CredentialField("api_key", "API Key", secret=True),
            CredentialField("merchant_code", "Merchant Code", secret=False),
            CredentialField("client_id", "OAuth Client ID", secret=False, required=False),
            CredentialField("client_secret", "OAuth Client Secret", secret=True, required=False),
        ],
    ),
    "square": ProviderMetadata(
        code="square",
        name="Square",
        logo_url="",
        description="Square online payments and payment links.",
        documentation_url="https://developer.squareup.com/docs/payments-api/overview",
        supported_countries=["UK", "US", "EU"],
        supported_currencies=["GBP", "USD", "EUR"],
        supported_payment_methods=["card", "apple_pay", "google_pay", "cash_app_pay"],
        status_label="beta",
        credentials=[
            CredentialField("access_token", "Access Token", secret=True),
            CredentialField("application_id", "Application ID", secret=False),
            CredentialField("location_id", "Location ID", secret=False),
            CredentialField("webhook_signature_key", "Webhook Signature Key", secret=True, required=False),
        ],
    ),
}


def get_provider_metadata(provider: str) -> ProviderMetadata:
    code = (provider or "").strip().lower()
    if code not in PROVIDER_METADATA:
        raise ValidationError(f"Unsupported payment provider: {provider}")
    return PROVIDER_METADATA[code]


def provider_metadata_payload(provider: str) -> Dict[str, Any]:
    meta = get_provider_metadata(provider)
    return {
        "code": meta.code,
        "name": meta.name,
        "logoUrl": meta.logo_url,
        "description": meta.description,
        "documentationUrl": meta.documentation_url,
        "supportedCountries": meta.supported_countries,
        "supportedCurrencies": meta.supported_currencies,
        "supportedPaymentMethods": meta.supported_payment_methods,
        "statusLabel": meta.status_label,
        "credentialFields": [field.__dict__ for field in meta.credentials],
    }


class PaymentProvider:
    code = "base"

    def __init__(self, gateway=None):
        self.gateway = gateway
        self.meta = get_provider_metadata(self.code)

    def initialize(self):
        return True

    def validate_credentials(self, credentials: Optional[Dict[str, Any]] = None):
        credentials = credentials or (self.gateway.get_credentials() if self.gateway else {})
        missing = [field.label for field in self.meta.credentials if field.required and not credentials.get(field.key)]
        if missing:
            raise ValidationError(f"Missing required credentials: {', '.join(missing)}")
        return {"ok": True, "provider": self.code, "validatedAt": timezone.now().isoformat()}

    def create_payment(self, *args, **kwargs):
        raise ValidationError(f"{self.meta.name} payment execution is not enabled for hosted checkout yet.")

    def capture_payment(self, *args, **kwargs):
        raise ValidationError(f"{self.meta.name} capture is not configured.")

    def refund_payment(self, *args, **kwargs):
        raise ValidationError(f"{self.meta.name} refunds are not configured.")

    def webhook(self, request):
        return {"status": "ignored", "provider": self.code}

    def health_check(self):
        self.validate_credentials()
        return {"ok": True, "provider": self.code, "checkedAt": timezone.now().isoformat()}


class StripeProvider(PaymentProvider):
    code = "stripe"


class CheckoutProvider(PaymentProvider):
    code = "checkout"


class PayMeProvider(PaymentProvider):
    code = "payme"


class AdyenProvider(PaymentProvider):
    code = "adyen"


class WorldpayProvider(PaymentProvider):
    code = "worldpay"


class SumUpProvider(PaymentProvider):
    code = "sumup"


class SquareProvider(PaymentProvider):
    code = "square"


PROVIDER_CLASSES = {
    "stripe": StripeProvider,
    "checkout": CheckoutProvider,
    "payme": PayMeProvider,
    "adyen": AdyenProvider,
    "worldpay": WorldpayProvider,
    "sumup": SumUpProvider,
    "square": SquareProvider,
}


def get_provider(provider: str, gateway=None) -> PaymentProvider:
    code = (provider or "").strip().lower()
    cls = PROVIDER_CLASSES.get(code)
    if not cls:
        raise ValidationError(f"Unsupported payment provider: {provider}")
    return cls(gateway)

