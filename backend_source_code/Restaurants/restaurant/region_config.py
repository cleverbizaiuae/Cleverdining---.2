"""
Central region configuration and resolver helpers.

Single source of truth for region-specific defaults so the codebase can stay
multi-tenant and avoid hardcoded country values.
"""

from copy import deepcopy
from typing import Dict, List, TypedDict


class RegionSettings(TypedDict):
    label: str
    currency: str
    timezone: str
    locale: str
    phone_format: str
    country_code: str
    country_alpha2: str
    default_payment_provider: str
    payments: List[str]


class UnsupportedRegionError(ValueError):
    """Raised when a new or edited restaurant names a region/country we do not support."""


DEFAULT_REGION = "UAE"
SUPPORTED_REGIONS = ("UAE", "UK", "IE", "GH")


REGION_CONFIG: Dict[str, RegionSettings] = {
    "UAE": {
        "label": "UAE",
        "currency": "AED",
        "timezone": "Asia/Dubai",
        "locale": "en-AE",
        "phone_format": "+971",
        "country_code": "+971",
        "country_alpha2": "AE",
        # Existing UAE default behavior remains Stripe unless explicitly changed
        "default_payment_provider": "stripe",
        "payments": ["stripe", "checkout", "paytabs", "cash"],
    },
    "UK": {
        "label": "UK",
        "currency": "GBP",
        "timezone": "Europe/London",
        "locale": "en-GB",
        "phone_format": "+44",
        "country_code": "+44",
        "country_alpha2": "GB",
        "default_payment_provider": "stripe",
        "payments": ["stripe", "checkout", "payme", "cash"],
    },
    "IE": {
        "label": "Ireland",
        "currency": "EUR",
        "timezone": "Europe/Dublin",
        "locale": "en-IE",
        "phone_format": "+353",
        "country_code": "+353",
        "country_alpha2": "IE",
        "default_payment_provider": "stripe",
        # PayMe is GBP-only and PayTabs is a MENA processor, so neither is offered.
        "payments": ["stripe", "checkout", "cash"],
    },
    "GH": {
        "label": "Ghana",
        "currency": "GHS",
        "timezone": "Africa/Accra",
        "locale": "en-GH",
        "phone_format": "+233",
        "country_code": "+233",
        "country_alpha2": "GH",
        "default_payment_provider": "stripe",
        # Stripe accepts GHS card payments. Mobile money (MTN MoMo etc.) is not
        # integrated yet, so cash remains the only other option.
        "payments": ["stripe", "cash"],
    },
}


REGION_ALIASES = {
    "UAE": "UAE",
    "AE": "UAE",
    "ARE": "UAE",
    "UNITED ARAB EMIRATES": "UAE",
    "DUBAI": "UAE",
    "ABU DHABI": "UAE",
    "UK": "UK",
    "GB": "UK",
    "GBR": "UK",
    "UNITED KINGDOM": "UK",
    "GREAT BRITAIN": "UK",
    "ENGLAND": "UK",
    "SCOTLAND": "UK",
    "WALES": "UK",
    "NORTHERN IRELAND": "UK",
    "LONDON": "UK",
    "MANCHESTER": "UK",
    "BELFAST": "UK",
    "IE": "IE",
    "IRL": "IE",
    "IRELAND": "IE",
    "REPUBLIC OF IRELAND": "IE",
    "EIRE": "IE",
    "ÉIRE": "IE",
    "DUBLIN": "IE",
    "CORK": "IE",
    "GALWAY": "IE",
    "LIMERICK": "IE",
    "GH": "GH",
    "GHA": "GH",
    "GHANA": "GH",
    "ACCRA": "GH",
    "KUMASI": "GH",
    "TAMALE": "GH",
}


CURRENCY_TO_REGION = {config["currency"]: code for code, config in REGION_CONFIG.items()}


def _lookup_region(value: str | None) -> str | None:
    """Return the supported region code for a region/country value, or None."""
    if not value:
        return None
    key = str(value).strip().upper()
    if not key:
        return None
    normalized = REGION_ALIASES.get(key, key)
    return normalized if normalized in SUPPORTED_REGIONS else None


def is_supported_region(value: str | None) -> bool:
    return _lookup_region(value) is not None


def normalize_region(region: str | None) -> str:
    # Read paths keep the historical UAE fallback so stored/legacy rows never break.
    # Write paths (registration, Super Admin edits) use require_supported_region().
    return _lookup_region(region) or DEFAULT_REGION


def require_supported_region(region: str | None = None, country: str | None = None) -> str:
    """
    Strict resolver for new or edited restaurants.

    An explicitly named but unsupported region/country raises instead of silently
    becoming UAE/AED. When neither is given, the historical UAE default applies.
    """
    if region and str(region).strip():
        resolved = _lookup_region(region)
        if resolved is None:
            raise UnsupportedRegionError(_unsupported_message(region))
        return resolved
    if country and str(country).strip():
        resolved = _lookup_region(country)
        if resolved is None:
            raise UnsupportedRegionError(_unsupported_message(country))
        return resolved
    return DEFAULT_REGION


def _unsupported_message(value: str) -> str:
    supported = ", ".join(REGION_CONFIG[code]["label"] for code in SUPPORTED_REGIONS)
    return f"'{str(value).strip()}' is not a supported country. Supported: {supported}."


def infer_region(
    region: str | None = None,
    country: str | None = None,
    currency: str | None = None,
) -> str:
    explicit_region = normalize_region(region)
    if region:
        return explicit_region

    country_region = _lookup_region(country)
    if country_region:
        return country_region

    if currency:
        currency_region = CURRENCY_TO_REGION.get(str(currency).strip().upper())
        if currency_region:
            return currency_region

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
        "country_alpha2": config["country_alpha2"],
        "locale": config["locale"],
        "label": config["label"],
    }
