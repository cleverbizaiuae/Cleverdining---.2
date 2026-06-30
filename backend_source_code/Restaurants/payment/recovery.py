from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from .models import PaymentGateway, StripeDetails
from .provider_registry import PAYMENT_PROVIDER_CODES


logger = logging.getLogger(__name__)


LEGACY_PROVIDER_ALIASES = {
    "checkout.com": "checkout",
    "checkoutcom": "checkout",
    "checkout": "checkout",
    "stripe": "stripe",
    "paytabs": "paytabs",
    "pay tabs": "paytabs",
    "payme": "payme",
    "pay me": "payme",
    "adyen": "adyen",
    "worldpay": "worldpay",
    "world pay": "worldpay",
    "sumup": "sumup",
    "sum up": "sumup",
    "square": "square",
}


def normalize_payment_provider(value):
    provider = (value or "").strip().lower()
    if not provider:
        return ""
    return LEGACY_PROVIDER_ALIASES.get(provider, provider)


def _selected_provider_for_restaurant(restaurant):
    for field in ("payment_processor", "default_payment_provider"):
        provider = normalize_payment_provider(getattr(restaurant, field, ""))
        if provider:
            return provider
    return ""


@transaction.atomic
def ensure_selected_payment_gateway(restaurant):
    """
    Keep Super Admin's selected processor aligned with provider assignments.

    The restaurant dashboard only renders PaymentGateway rows once any explicit
    assignment exists. If Super Admin sets Processor=Stripe but the restaurant
    only has Checkout/PayTabs rows, Stripe disappears. The selected processor is
    an assignment signal, so materialise it as an enabled gateway without
    touching credentials or removing other providers.
    """
    selected = _selected_provider_for_restaurant(restaurant)
    supported = set(PAYMENT_PROVIDER_CODES) | {"paytabs"}
    if not selected or selected == "cash" or selected not in supported:
        return None

    if selected == "stripe":
        reconcile_legacy_stripe_gateway(restaurant)

    gateway, created = PaymentGateway.objects.get_or_create(
        restaurant=restaurant,
        provider=selected,
        defaults={
            "is_enabled": True,
            "is_active": not PaymentGateway.objects.filter(
                restaurant=restaurant,
                is_active=True,
            ).exists(),
        },
    )
    update_fields = []
    if not gateway.is_enabled:
        gateway.is_enabled = True
        update_fields.append("is_enabled")
    if gateway.connection_status == "disabled":
        gateway.connection_status = "connected" if gateway.has_credentials() else "not_configured"
        gateway.last_error = ""
        update_fields.extend(["connection_status", "last_error"])
    if update_fields and not created:
        gateway.save(update_fields=[*update_fields, "updated_at"])
    return gateway


@transaction.atomic
def reconcile_legacy_stripe_gateway(restaurant, *, force: bool = False):
    """
    Bridge the legacy StripeDetails record into the provider framework.

    The multi-provider rollout replaced the legacy Stripe UI with PaymentGateway
    cards. Existing credentials must therefore be represented by a gateway row
    or Stripe silently disappears whenever another provider is assigned.
    """
    legacy = StripeDetails.objects.filter(restaurant=restaurant).first()
    gateway = PaymentGateway.objects.filter(
        restaurant=restaurant,
        provider="stripe",
    ).first()

    if not legacy:
        return gateway
    if gateway and gateway.has_credentials() and not force:
        return gateway

    created = gateway is None
    if created:
        gateway = PaymentGateway(
            restaurant=restaurant,
            provider="stripe",
            is_enabled=True,
            is_active=not PaymentGateway.objects.filter(
                restaurant=restaurant,
                is_active=True,
            ).exists(),
        )

    try:
        gateway.set_credentials(
            {
                "publishable_key": legacy.get_decrypted_publishable_key(),
                "secret_key": legacy.get_decrypted_secret_key(),
            }
        )
        gateway.connection_status = (
            "connected" if gateway.is_enabled else "disabled"
        )
        gateway.last_validation_at = timezone.now()
        gateway.last_error = ""
    except Exception:
        # Keep the legacy row untouched. A stable FERNET_KEY can then recover it.
        gateway.connection_status = "error"
        gateway.last_error = (
            "Legacy Stripe credentials could not be decrypted. "
            "Verify the deployment FERNET_KEY and reconnect Stripe."
        )
        logger.exception(
            "Failed to reconcile legacy Stripe credentials for restaurant %s",
            restaurant.pk,
        )

    gateway.save()
    return gateway
