from __future__ import annotations

import logging

import requests

DIALOG_360_WEBHOOK_URL = "https://waba-v2.360dialog.io/v1/configs/webhook"
logger = logging.getLogger(__name__)


class Dialog360ConfigurationError(Exception):
    pass


def configure_360dialog_webhook(api_key: str, callback_url: str) -> None:
    if not api_key:
        raise Dialog360ConfigurationError("A 360dialog API key is required.")
    if not callback_url.startswith("https://"):
        raise Dialog360ConfigurationError("The 360dialog webhook must use HTTPS.")

    try:
        response = requests.post(
            DIALOG_360_WEBHOOK_URL,
            json={"url": callback_url},
            headers={"D360-API-KEY": api_key, "Content-Type": "application/json"},
            timeout=8,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("360dialog webhook registration failed: %s", exc)
        raise Dialog360ConfigurationError(
            "360dialog rejected the webhook setup. Confirm the channel is active and the API key is valid."
        ) from exc
