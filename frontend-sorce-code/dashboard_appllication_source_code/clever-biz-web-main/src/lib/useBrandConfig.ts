import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ThemePreset = "classic_clean" | "luxury_dark" | "warm_casual";
export type FontPreset = "modern" | "elegant" | "bold";

export interface BrandConfig {
  id?: string;
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

export const THEME_PRESETS = [
  { value: "classic_clean" as ThemePreset, label: "Classic Clean", description: "Light, minimal hero with subtle overlay" },
  { value: "luxury_dark" as ThemePreset, label: "Luxury Dark", description: "Deep dark overlay for premium feel" },
  { value: "warm_casual" as ThemePreset, label: "Warm Casual", description: "Warm-toned gradient for friendly vibes" },
];

export const FONT_PRESETS = [
  { value: "modern" as FontPreset, label: "Modern Clean", family: "'Inter', system-ui, sans-serif" },
  { value: "elegant" as FontPreset, label: "Elegant Dining", family: "'Playfair Display', Georgia, serif" },
  { value: "bold" as FontPreset, label: "Bold Casual", family: "'Plus Jakarta Sans', system-ui, sans-serif" },
];

const BRAND_CACHE_KEY = "cb_brand_config_cache";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

const envApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_BASE_URL = normalizeBaseUrl(
  envApiUrl && envApiUrl !== "/api" ? envApiUrl : "https://cleverdining-2.onrender.com"
);

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("accessToken") || localStorage.getItem("superAdminToken");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function mapConfig(payload: Partial<BrandConfig> | undefined | null): BrandConfig {
  if (!payload || typeof payload !== "object") return DEFAULT_BRAND;
  return {
    ...DEFAULT_BRAND,
    ...payload,
  };
}

function readBrandCache(): Partial<BrandConfig> {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<BrandConfig>;
    return mapConfig(parsed);
  } catch {
    return {};
  }
}

function writeBrandCache(config: BrandConfig): void {
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Best effort cache.
  }
}

// Converts a hex color to HSL string for CSS variables.
export function hexToHsl(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "221 83% 53%";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const lum = (max + min) / 2;

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
      case b:
        hue = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
}

export function useBrandConfig(restaurantId?: string | number | null) {
  const cached = readBrandCache();

  const { data } = useQuery<BrandConfig>({
    queryKey: ["brand-config", restaurantId ?? null],
    queryFn: async () => {
      const url = new URL(`${API_BASE_URL}/api/brand-config/`);
      if (restaurantId) {
        url.searchParams.set("restaurant_id", String(restaurantId));
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });
      if (!response.ok) {
        return mapConfig(cached);
      }

      const payload = await response.json();
      const mapped = mapConfig(payload);
      writeBrandCache(mapped);
      return mapped;
    },
    placeholderData: mapConfig(cached),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return data ?? mapConfig(cached);
}

export function useBrandConfigMutation(restaurantId?: string | number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<BrandConfig>) => {
      const body: Record<string, unknown> = { ...config };
      if (restaurantId) {
        body.restaurant_id = restaurantId;
      }

      const response = await fetch(`${API_BASE_URL}/api/brand-config/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`Save failed (${response.status}): ${errText}`);
      }

      const payload = await response.json();
      const mapped = mapConfig(payload);
      writeBrandCache(mapped);
      return mapped;
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["brand-config"] });
    },
  });
}
