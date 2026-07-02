import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cachedGet } from "./requestCache";

export type ThemePreset = "classic_clean" | "luxury_dark" | "warm_casual";
export type FontPreset = "modern" | "elegant" | "bold";

export interface BrandConfig {
  restaurantName: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  coverPosition: string;
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

const LEGACY_BRAND_CACHE_KEY = "cb_brand_config_cache";
const BRAND_CACHE_PREFIX = "cb_brand_config_cache:";
const BRAND_BRIDGE_KEY = "customer_branding";
const BRAND_REMOTE_REFRESH_MS = 4_000;
const preloadedBrandImages = new Set<string>();

export const DEFAULT_BRAND: BrandConfig = {
  restaurantName: "My Restaurant",
  logoUrl: null,
  coverImageUrl: null,
  coverPosition: "50% 50%",
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

export const FONT_PRESETS = [
  { value: "modern" as FontPreset, label: "Modern Clean", family: "'Inter', system-ui, sans-serif" },
  { value: "elegant" as FontPreset, label: "Elegant Dining", family: "'Playfair Display', Georgia, serif" },
  { value: "bold" as FontPreset, label: "Bold Casual", family: "'Plus Jakarta Sans', system-ui, sans-serif" },
];

export function hexToHsl(hex: string): string {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return "221 100% 50%";
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hue = ((b - r) / d + 2) / 6;
        break;
      default:
        hue = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
}

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
    coverPosition: cleanText(src.coverPosition) || DEFAULT_BRAND.coverPosition,
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

export function hasMeaningfulBrandContent(brand: Pick<BrandConfig, "restaurantName" | "logoUrl" | "coverImageUrl">): boolean {
  const restaurantName = (brand.restaurantName || "").trim();
  return Boolean(
    brand.logoUrl ||
      brand.coverImageUrl ||
      (restaurantName && restaurantName !== DEFAULT_BRAND.restaurantName),
  );
}

export function shouldRenderBrandExperience(brand: BrandConfig): boolean {
  return brand.brandingEnabled || hasMeaningfulBrandContent(brand);
}

function normalizeRestaurantId(restaurantId?: string | number | null): string | null {
  if (restaurantId === null || restaurantId === undefined) return null;
  const value = String(restaurantId).trim();
  return value || null;
}

function resolveStoredRestaurantId(): string | null {
  try {
    const parsed = JSON.parse(localStorage.getItem("userInfo") || "{}");
    return normalizeRestaurantId(
      parsed?.user?.restaurants?.[0]?.id ||
      parsed?.restaurants?.[0]?.id ||
      parsed?.restaurant?.id ||
      parsed?.restaurant_id ||
      parsed?.restaurantId ||
      localStorage.getItem("restaurantId") ||
      localStorage.getItem("selectedRestaurantId") ||
      localStorage.getItem("restaurant_id"),
    );
  } catch {
    return normalizeRestaurantId(localStorage.getItem("restaurant_id"));
  }
}

export function getBrandCacheKey(restaurantId: string | number): string {
  return `${BRAND_CACHE_PREFIX}${String(restaurantId).trim()}`;
}

export function getBrandSplashSessionKey(restaurantId?: string | number | null): string {
  const normalizedRestaurantId = normalizeRestaurantId(restaurantId) || resolveStoredRestaurantId();
  return `cb_splash_seen:${normalizedRestaurantId || "default"}`;
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

function readCachedConfig(restaurantId: string | null): Partial<BrandConfig> {
  if (!restaurantId) return {};
  try {
    const raw = localStorage.getItem(getBrandCacheKey(restaurantId));
    if (!raw) return {};
    return mapBrandConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeCachedConfig(restaurantId: string, config: BrandConfig): void {
  try {
    localStorage.setItem(getBrandCacheKey(restaurantId), JSON.stringify(config));
    localStorage.removeItem(LEGACY_BRAND_CACHE_KEY);
  } catch {
    // Best effort.
  }
}

function preloadBrandImage(url: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const src = String(url || "").trim();
  if (!src || preloadedBrandImages.has(src)) return;
  preloadedBrandImages.add(src);
  const image = new Image();
  image.decoding = "async";
  image.src = src;
}

function getLocalFallback(): Partial<BrandConfig> {
  const bridge = readBridgeSnapshot();
  const fallback: Partial<BrandConfig> = {};
  if (typeof bridge.brandingEnabled === "boolean") fallback.brandingEnabled = bridge.brandingEnabled;
  if (bridge.restaurantName?.trim()) fallback.restaurantName = bridge.restaurantName.trim();
  if (bridge.logoDataUrl?.trim()) fallback.logoUrl = bridge.logoDataUrl.trim();
  if (bridge.coverImageDataUrl?.trim()) fallback.coverImageUrl = bridge.coverImageDataUrl.trim();
  return fallback;
}

function getInitialBrandConfig(explicitRestaurantId?: string | number | null): BrandConfig {
  const restaurantId = normalizeRestaurantId(explicitRestaurantId) || resolveStoredRestaurantId();
  return {
    ...DEFAULT_BRAND,
    ...readCachedConfig(restaurantId),
    ...(restaurantId ? {} : getLocalFallback()),
  };
}

export function cacheBrandConfigForRestaurant(
  restaurantId: string | number | null | undefined,
  payload: unknown,
): BrandConfig | null {
  const normalizedRestaurantId = normalizeRestaurantId(restaurantId);
  if (!normalizedRestaurantId) return null;
  const config = mapBrandConfig(payload);
  writeCachedConfig(normalizedRestaurantId, config);
  preloadBrandImage(config.logoUrl);
  preloadBrandImage(config.coverImageUrl);
  return config;
}

const ActiveBrandContext = createContext<BrandConfig | null>(null);

export function ActiveBrandProvider({ brand, children }: { brand: BrandConfig; children: ReactNode }) {
  return createElement(ActiveBrandContext.Provider, { value: brand }, children);
}

export function useActiveBrandConfig(): BrandConfig {
  return useContext(ActiveBrandContext) || getInitialBrandConfig();
}

export function preloadCachedBrandAssets(): void {
  const initial = getInitialBrandConfig(resolveStoredRestaurantId());
  preloadBrandImage(initial.coverImageUrl);
  preloadBrandImage(initial.logoUrl);
}

export function useBrandConfig(restaurantId?: string | number | null) {
  const normalizedRestaurantId = useMemo(() => {
    return normalizeRestaurantId(restaurantId) || resolveStoredRestaurantId();
  }, [restaurantId]);
  const [brand, setBrand] = useState<BrandConfig>(() => getInitialBrandConfig(normalizedRestaurantId));
  const [brandRestaurantId, setBrandRestaurantId] = useState(normalizedRestaurantId);

  const syncFromCache = useCallback(() => {
    setBrand(getInitialBrandConfig(normalizedRestaurantId));
    setBrandRestaurantId(normalizedRestaurantId);
  }, [normalizedRestaurantId]);

  useEffect(() => {
    preloadBrandImage(brand.logoUrl);
    preloadBrandImage(brand.coverImageUrl);
  }, [brand.coverImageUrl, brand.logoUrl]);

  useEffect(() => {
    syncFromCache();

    if (!normalizedRestaurantId) {
      return;
    }

    let isMounted = true;

    const fetchRemote = async () => {
      try {
        const response = await cachedGet(
          `/api/brand-config/?restaurant_id=${encodeURIComponent(normalizedRestaurantId)}`,
          { headers: { "Content-Type": "application/json" } },
          { ttlMs: 3_500 },
        );
        const mapped = mapBrandConfig(response.data);
        if (!isMounted) return;
        setBrand(mapped);
        setBrandRestaurantId(normalizedRestaurantId);
        writeCachedConfig(normalizedRestaurantId, mapped);
        preloadBrandImage(mapped.logoUrl);
        preloadBrandImage(mapped.coverImageUrl);
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

  return brandRestaurantId === normalizedRestaurantId
    ? brand
    : getInitialBrandConfig(normalizedRestaurantId);
}
