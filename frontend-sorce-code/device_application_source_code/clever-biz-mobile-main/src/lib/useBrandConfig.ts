import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "./axios";

export type ThemePreset = "classic_clean" | "luxury_dark" | "warm_casual";
export type FontPreset = "modern" | "elegant" | "bold";

export interface BrandConfig {
  restaurantName: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
  themePreset: ThemePreset;
  fontPreset: FontPreset;
  tagline: string | null;
  brandingEnabled: boolean;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  wifiName: string | null;
  wifiPassword: string | null;
  googleReviewUrl: string | null;
}

type BrandingSnapshot = {
  brandingEnabled?: boolean;
  restaurantName?: string;
  logoDataUrl?: string;
  coverImageDataUrl?: string;
};

const BRAND_CACHE_KEY = "cb_brand_config_cache";
const BRAND_BRIDGE_KEY = "customer_branding";
const BRAND_REMOTE_REFRESH_MS = 60_000;

export const DEFAULT_BRAND: BrandConfig = {
  restaurantName: "My Restaurant",
  logoUrl: null,
  coverImageUrl: null,
  primaryColor: "#0055FE",
  secondaryColor: null,
  accentColor: null,
  themePreset: "classic_clean",
  fontPreset: "modern",
  tagline: null,
  brandingEnabled: false,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  twitterUrl: null,
  websiteUrl: null,
  wifiName: null,
  wifiPassword: null,
  googleReviewUrl: null,
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeThemePreset(value: unknown): ThemePreset {
  if (value === "luxury_dark" || value === "warm_casual") return value;
  return "classic_clean";
}

function normalizeFontPreset(value: unknown): FontPreset {
  if (value === "elegant" || value === "bold") return value;
  return "modern";
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

function mapBrandConfig(payload: unknown): BrandConfig {
  const src = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    restaurantName: cleanText(src.restaurantName) || DEFAULT_BRAND.restaurantName,
    logoUrl: cleanText(src.logoUrl),
    coverImageUrl: cleanText(src.coverImageUrl),
    primaryColor: normalizeHexColor(src.primaryColor, DEFAULT_BRAND.primaryColor),
    secondaryColor: cleanText(src.secondaryColor),
    accentColor: cleanText(src.accentColor),
    themePreset: normalizeThemePreset(src.themePreset),
    fontPreset: normalizeFontPreset(src.fontPreset),
    tagline: cleanText(src.tagline),
    brandingEnabled: Boolean(src.brandingEnabled),
    instagramUrl: cleanText(src.instagramUrl),
    facebookUrl: cleanText(src.facebookUrl),
    tiktokUrl: cleanText(src.tiktokUrl),
    twitterUrl: cleanText(src.twitterUrl),
    websiteUrl: cleanText(src.websiteUrl),
    wifiName: cleanText(src.wifiName),
    wifiPassword: cleanText(src.wifiPassword),
    googleReviewUrl: cleanText(src.googleReviewUrl),
  };
}

function readBridgeSnapshot(): BrandingSnapshot {
  try {
    const raw = localStorage.getItem(BRAND_BRIDGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as BrandingSnapshot;
  } catch {
    return {};
  }
}

function readCachedConfig(): Partial<BrandConfig> {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return {};
    return mapBrandConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeCachedConfig(config: BrandConfig): void {
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Best effort.
  }
}

function getLocalFallback(): Partial<BrandConfig> {
  const bridge = readBridgeSnapshot();
  return {
    brandingEnabled: Boolean(bridge.brandingEnabled),
    restaurantName: bridge.restaurantName?.trim() || DEFAULT_BRAND.restaurantName,
    logoUrl: bridge.logoDataUrl?.trim() || null,
    coverImageUrl: bridge.coverImageDataUrl?.trim() || null,
  };
}

export function useBrandConfig(restaurantId?: string | number | null) {
  const [brand, setBrand] = useState<BrandConfig>(() => ({
    ...DEFAULT_BRAND,
    ...readCachedConfig(),
    ...getLocalFallback(),
  }));

  const normalizedRestaurantId = useMemo(() => {
    if (restaurantId === null || restaurantId === undefined) return null;
    const value = String(restaurantId).trim();
    return value || null;
  }, [restaurantId]);

  const syncFromCache = useCallback(() => {
    setBrand((prev) => ({
      ...prev,
      ...readCachedConfig(),
      ...getLocalFallback(),
    }));
  }, []);

  useEffect(() => {
    if (!normalizedRestaurantId) {
      syncFromCache();
      return;
    }

    let isMounted = true;

    const fetchRemote = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}api/brand-config/?restaurant_id=${encodeURIComponent(normalizedRestaurantId)}`,
          { headers: { "Content-Type": "application/json" } }
        );
        if (!response.ok) return;
        const mapped = mapBrandConfig(await response.json());
        if (!isMounted) return;
        setBrand(mapped);
        writeCachedConfig(mapped);
      } catch {
        // Silent fallback.
      }
    };

    fetchRemote();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchRemote();
      }
    }, BRAND_REMOTE_REFRESH_MS);

    const refreshFromLocalAndRemote = () => {
      syncFromCache();
      fetchRemote();
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        refreshFromLocalAndRemote();
      }
    };

    window.addEventListener("storage", refreshFromLocalAndRemote);
    window.addEventListener("branding-updated", refreshFromLocalAndRemote as EventListener);
    window.addEventListener("focus", refreshFromLocalAndRemote);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("storage", refreshFromLocalAndRemote);
      window.removeEventListener("branding-updated", refreshFromLocalAndRemote as EventListener);
      window.removeEventListener("focus", refreshFromLocalAndRemote);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [normalizedRestaurantId, syncFromCache]);

  return brand;
}
