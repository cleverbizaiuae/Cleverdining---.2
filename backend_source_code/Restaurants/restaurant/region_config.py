"""
Central region configuration and resolver helpers.

Single source of truth for region-specific defaults so the codebase can stay
multi-tenant and avoid hardcoded country values.
"""

from copy import deepcopy
from typing import Dict, List, TypedDict


class RegionSettings(TypedDict):
    currency: str
    timezone: str
    phone_format: str
    country_code: str
    default_payment_provider: str
    payments: List[str]


DEFAULT_REGION = "UAE"
SUPPORTED_REGIONS = ("UAE", "UK")


REGION_CONFIG: Dict[str, RegionSettings] = {
    "UAE": {
        "currency": "AED",
        "timezone": "Asia/Dubai",
        "phone_format": "+971",
        "country_code": "+971",
        # Existing UAE default behavior remains Stripe unless explicitly changed
        "default_payment_provider": "stripe",
        "payments": ["stripe", "checkout", "paytabs", "payme", "adyen", "worldpay", "sumup", "square", "cash"],
    },
    "UK": {
        "currency": "GBP",
        "timezone": "Europe/London",
        "phone_format": "+44",
        "country_code": "+44",
        "default_payment_provider": "stripe",
        "payments": ["stripe", "checkout", "payme", "adyen", "worldpay", "sumup", "square", "cash"],
    },
}


REGION_ALIASES = {
    "UAE": "UAE",
    "AE": "UAE",
    "UNITED ARAB EMIRATES": "UAE",
    "DUBAI": "UAE",
    "ABU DHABI": "UAE",
    "UK": "UK",
    "GB": "UK",
    "UNITED KINGDOM": "UK",
    "GREAT BRITAIN": "UK",
    "ENGLAND": "UK",
    "LONDON": "UK",
}


def normalize_region(region: str | None) -> str:
    if not region:
        return DEFAULT_REGION
    key = str(region).strip().upper()
    normalized = REGION_ALIASES.get(key, key)
    return normalized if normalized in SUPPORTED_REGIONS else DEFAULT_REGION


def infer_region(
    region: str | None = None,
    country: str | None = None,
    currency: str | None = None,
) -> str:
    explicit_region = normalize_region(region)
    if region:
        return explicit_region

    if country:
        country_key = str(country).strip().upper()
        if country_key in REGION_ALIASES:
            return normalize_region(REGION_ALIASES[country_key])

    if currency:
        currency_key = str(currency).strip().upper()
        if currency_key == "GBP":
            return "UK"
        if currency_key == "AED":
            return "UAE"

    return DEFAULT_REGION


def get_region_config(region: str | None = None) -> RegionSettings:
    resolved = normalize_region(region)
    return deepcopy(REGION_CONFIG[resolved])


def resolve_region_defaults(
    region: str | None = None,
    country: str | None = None,
    currency: str | None = None,
) -> Dict[str, str]:
    resolved_region = infer_region(region=region, country=country, currency=currency)
    config = get_region_config(resolved_region)
    return {
        "region": resolved_region,
        "currency": config["currency"],
        "timezone": config["timezone"],
        "country_code": config["country_code"],
        "default_payment_provider": config["default_payment_provider"],
        "phone_format": config["phone_format"],
    }
