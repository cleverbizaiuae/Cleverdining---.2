import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "./axios";

export type ThemePreset = "classic_clean" | "luxury_dark" | "warm_casual";

export interface BrandConfig {
  restaurantName: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string;
  themePreset: ThemePreset;
  tagline: string | null;
  brandingEnabled: boolean;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  googleReviewUrl: string | null;
}

type BrandingSnapshot = {
  brandingEnabled?: boolean;
  restaurantName?: string;
  logoDataUrl?: string;
  coverImageDataUrl?: string;
};

export const DEFAULT_BRAND: BrandConfig = {
  restaurantName: "My Restaurant",
  logoUrl: null,
  coverImageUrl: null,
  primaryColor: "#0055FE",
  themePreset: "classic_clean",
  tagline: null,
  brandingEnabled: false,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  twitterUrl: null,
  websiteUrl: null,
  googleReviewUrl: null,
};

function readBrandingSnapshot(): BrandingSnapshot {
  try {
    const raw = localStorage.getItem("customer_branding");
    if (!raw) return {};
    return JSON.parse(raw) as BrandingSnapshot;
  } catch {
    return {};
  }
}

function normalizeThemePreset(value: unknown): ThemePreset {
  if (value === "luxury_dark" || value === "warm_casual") return value;
  return "classic_clean";
}

function normalizeHexColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_BRAND.primaryColor;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return DEFAULT_BRAND.primaryColor;
}

function mapBrandConfig(payload: unknown): BrandConfig {
  const src = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    restaurantName:
      typeof src.restaurantName === "string" && src.restaurantName.trim()
        ? src.restaurantName.trim()
        : DEFAULT_BRAND.restaurantName,
    logoUrl: typeof src.logoUrl === "string" && src.logoUrl.trim() ? src.logoUrl.trim() : null,
    coverImageUrl:
      typeof src.coverImageUrl === "string" && src.coverImageUrl.trim() ? src.coverImageUrl.trim() : null,
    primaryColor: normalizeHexColor(src.primaryColor),
    themePreset: normalizeThemePreset(src.themePreset),
    tagline: typeof src.tagline === "string" && src.tagline.trim() ? src.tagline.trim() : null,
    brandingEnabled: Boolean(src.brandingEnabled),
    instagramUrl:
      typeof src.instagramUrl === "string" && src.instagramUrl.trim() ? src.instagramUrl.trim() : null,
    facebookUrl: typeof src.facebookUrl === "string" && src.facebookUrl.trim() ? src.facebookUrl.trim() : null,
    tiktokUrl: typeof src.tiktokUrl === "string" && src.tiktokUrl.trim() ? src.tiktokUrl.trim() : null,
    twitterUrl: typeof src.twitterUrl === "string" && src.twitterUrl.trim() ? src.twitterUrl.trim() : null,
    websiteUrl: typeof src.websiteUrl === "string" && src.websiteUrl.trim() ? src.websiteUrl.trim() : null,
    googleReviewUrl:
      typeof src.googleReviewUrl === "string" && src.googleReviewUrl.trim() ? src.googleReviewUrl.trim() : null,
  };
}

function getSnapshotFallback(): Partial<BrandConfig> {
  const snapshot = readBrandingSnapshot();
  return {
    brandingEnabled: Boolean(snapshot.brandingEnabled),
    restaurantName: snapshot.restaurantName?.trim() || DEFAULT_BRAND.restaurantName,
    logoUrl: snapshot.logoDataUrl?.trim() || null,
    coverImageUrl: snapshot.coverImageDataUrl?.trim() || null,
  };
}

export function useBrandConfig(restaurantId?: string | number | null) {
  const [brand, setBrand] = useState<BrandConfig>({ ...DEFAULT_BRAND, ...getSnapshotFallback() });

  const normalizedRestaurantId = useMemo(() => {
    if (restaurantId === null || restaurantId === undefined) return null;
    const value = String(restaurantId).trim();
    return value || null;
  }, [restaurantId]);

  useEffect(() => {
    let active = true;

    const fetchBrandConfig = async () => {
      if (!normalizedRestaurantId) {
        setBrand((prev) => ({ ...DEFAULT_BRAND, ...getSnapshotFallback(), ...prev }));
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}api/brand-config/?restaurant_id=${encodeURIComponent(normalizedRestaurantId)}`,
          { headers: { "Content-Type": "application/json" } }
        );
        if (!response.ok) return;
        const payload = await response.json();
        if (!active) return;
        setBrand((prev) => ({ ...prev, ...mapBrandConfig(payload) }));
      } catch {
        // Silent fallback to local snapshot/defaults.
      }
    };

    fetchBrandConfig();
    return () => {
      active = false;
    };
  }, [normalizedRestaurantId]);

  return brand;
}
