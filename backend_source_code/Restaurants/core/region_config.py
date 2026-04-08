"""
Core region configuration access layer.

This wraps restaurant.region_config so other apps can import from a stable
core module without duplicating any region constants.
"""

from restaurant.region_config import (  # noqa: F401
    DEFAULT_REGION,
    SUPPORTED_REGIONS,
    REGION_CONFIG,
    get_region_config,
    infer_region,
    normalize_region,
    resolve_region_defaults,
)
