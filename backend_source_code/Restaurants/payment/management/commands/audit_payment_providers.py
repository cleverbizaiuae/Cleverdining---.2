from django.core.management import call_command
from django.core.management.base import BaseCommand

from payment.models import PaymentGateway, StripeDetails
from payment.provider_registry import PAYMENT_PROVIDER_CODES, PROVIDER_CLASSES
from payment.recovery import reconcile_legacy_stripe_gateway
from restaurant.models import Restaurant


class Command(BaseCommand):
    help = "Audit provider registry, restaurant assignments, and legacy Stripe configuration."

    def add_arguments(self, parser):
        parser.add_argument(
            "--repair",
            action="store_true",
            help="Idempotently migrate recoverable legacy Stripe configuration.",
        )

    def handle(self, *args, **options):
        call_command("verify_schema", "--skip-type-check")

        registry_missing = sorted(
            set(PAYMENT_PROVIDER_CODES) - set(PROVIDER_CLASSES)
        )
        if registry_missing:
            self.stdout.write(
                self.style.ERROR(
                    f"Registry adapters missing: {', '.join(registry_missing)}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Registry OK: {', '.join(PAYMENT_PROVIDER_CODES)}"
                )
            )

        issues = 0
        for restaurant in Restaurant.objects.order_by("id"):
            if options["repair"]:
                reconcile_legacy_stripe_gateway(restaurant)

            gateways = list(
                PaymentGateway.objects.filter(restaurant=restaurant).order_by(
                    "provider"
                )
            )
            legacy_stripe = StripeDetails.objects.filter(
                restaurant=restaurant
            ).exists()
            stripe_gateway = next(
                (gateway for gateway in gateways if gateway.provider == "stripe"),
                None,
            )
            if legacy_stripe and not stripe_gateway:
                issues += 1

            summary = ", ".join(
                (
                    f"{gateway.provider}:"
                    f"{'enabled' if gateway.is_enabled else 'disabled'}:"
                    f"{gateway.connection_status}:"
                    f"{'configured' if gateway.has_credentials() else 'missing_credentials'}"
                )
                for gateway in gateways
            ) or "none"
            self.stdout.write(
                f"Restaurant {restaurant.pk} ({restaurant.resturent_name}) | "
                f"legacy_stripe={'yes' if legacy_stripe else 'no'} | "
                f"gateways={summary}"
            )

        if issues:
            self.stdout.write(
                self.style.WARNING(
                    f"{issues} restaurant(s) have legacy Stripe credentials "
                    "without a provider gateway. Run with --repair."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "No orphaned legacy Stripe configurations detected."
                )
            )
