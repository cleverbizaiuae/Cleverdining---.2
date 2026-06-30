from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from .models import PaymentGateway, StripeDetails


logger = logging.getLogger(__name__)


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
