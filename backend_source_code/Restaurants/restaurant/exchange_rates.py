"""
Display exchange rates for Super Admin amounts.

Rates are used only to *display* platform figures (plan fees, CRM spend) in a
currency chosen by the Super Admin. They are never used for charging customers.

The currency list is derived from REGION_CONFIG, so adding a region adds its
currency here automatically.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Dict

import requests
from django.conf import settings
from django.core.cache import cache

from restaurant.region_config import REGION_CONFIG, SUPPORTED_REGIONS

logger = logging.getLogger(__name__)

BASE_CURRENCY = "AED"
CACHE_KEY = "platform-exchange-rates:v1:AED"
CACHE_SECONDS = 60 * 60 * 12
FAILURE_CACHE_SECONDS = 60 * 10
DEFAULT_RATES_URL = "https://open.er-api.com/v6/latest/{base}"

# Approximate units of each currency per 1 AED, used only when the live
# source cannot be reached. AED is pegged to USD (1 USD = 3.6725 AED).
FALLBACK_RATES_PER_AED: Dict[str, Decimal] = {
    "AED": Decimal("1"),
    "GBP": Decimal("0.21"),
    "EUR": Decimal("0.24"),
    "GHS": Decimal("3.0"),
}


def platform_currencies() -> list[str]:
    """Every currency a restaurant can use, in region order, AED first."""
    seen: list[str] = []
    for code in SUPPORTED_REGIONS:
        currency = REGION_CONFIG[code]["currency"]
        if currency not in seen:
            seen.append(currency)
    return seen


def _fetch_live_rates() -> dict:
    url = getattr(settings, "EXCHANGE_RATES_URL", "") or DEFAULT_RATES_URL
    response = requests.get(url.format(base=BASE_CURRENCY), timeout=5)
    response.raise_for_status()
    payload = response.json()
    if payload.get("result") not in (None, "success"):
        raise ValueError(f"Exchange rate source returned {payload.get('result')}")
    rates = payload.get("rates") or {}
    return {
        "rates": {code: float(rates[code]) for code in platform_currencies() if code in rates},
        "updated_at": payload.get("time_last_update_utc") or "",
    }


def get_platform_exchange_rates() -> dict:
    cached = cache.get(CACHE_KEY)
    if cached:
        return cached

    currencies = platform_currencies()
    live: dict = {"rates": {}, "updated_at": ""}
    try:
        live = _fetch_live_rates()
    except Exception as exc:  # network, JSON or provider errors
        logger.warning("Exchange rates unavailable, using fallback: %s", exc)

    rates: Dict[str, float] = {}
    approximate = []
    for code in currencies:
        if code == BASE_CURRENCY:
            rates[code] = 1.0
        elif live["rates"].get(code):
            rates[code] = live["rates"][code]
        else:
            rates[code] = float(FALLBACK_RATES_PER_AED.get(code, Decimal("1")))
            approximate.append(code)

    result = {
        "base": BASE_CURRENCY,
        "currencies": currencies,
        "rates": rates,
        "approximate": approximate,
        "source": "ExchangeRate-API (exchangerate-api.com)" if live["rates"] else "fallback",
        "updated_at": live["updated_at"] or datetime.now(dt_timezone.utc).isoformat(),
    }
    cache.set(CACHE_KEY, result, CACHE_SECONDS if not approximate else FAILURE_CACHE_SECONDS)
    return result
