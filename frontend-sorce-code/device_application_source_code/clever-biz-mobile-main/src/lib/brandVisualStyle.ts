export type BrandVisualSurface = "splash" | "menu" | "success";

export const DEFAULT_BRAND_VISUAL_STYLE = {
  restaurantName: "My Restaurant",
  logoUrl: null,
  coverImageUrl: null,
  coverPosition: "50% 50%",
  primaryColor: "#0054FF",
  secondaryColor: "#FFFFFF",
  accentColor: "#FFFFFF",
  themePreset: "classic_clean",
  fontPreset: "modern",
  tagline: null,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  twitterUrl: null,
  websiteUrl: null,
} as const;

export function resolveBrandVisualStyle<T extends { brandingEnabled: boolean }>(brand: T): T {
  if (brand.brandingEnabled) return brand;

  return {
    ...brand,
    ...DEFAULT_BRAND_VISUAL_STYLE,
  } as T;
}

const FONT_FAMILIES = {
  modern: "'Inter', system-ui, sans-serif",
  elegant: "'Playfair Display', Georgia, serif",
  bold: "'Plus Jakarta Sans', system-ui, sans-serif",
} as const;

export function getBrandFontFamily(fontPreset: string): string {
  if (fontPreset === "elegant") return FONT_FAMILIES.elegant;
  if (fontPreset === "bold") return FONT_FAMILIES.bold;
  return FONT_FAMILIES.modern;
}

export function shouldApplyBrandVisualStyle(
  brandingEnabled: boolean,
  _hasMeaningfulBranding: boolean,
): boolean {
  return brandingEnabled;
}

export function readableTextHsl(hex: string): string {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return "215 25% 27%";

  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(cleaned.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  const darkForegroundLuminance = 0.052;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / (darkForegroundLuminance + 0.05);

  return darkContrast >= whiteContrast ? "215 25% 27%" : "0 0% 100%";
}

export function getBrandCoverOverlay(
  themePreset: string,
  surface: BrandVisualSurface,
): string {
  if (surface === "success") {
    if (themePreset === "luxury_dark") {
      return "linear-gradient(to bottom, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.60) 56%, rgba(0,0,0,0.78) 100%)";
    }
    if (themePreset === "warm_casual") {
      return "linear-gradient(to bottom, rgba(67,20,7,0.42) 0%, rgba(67,20,7,0.57) 58%, rgba(15,23,42,0.76) 100%)";
    }
    return "linear-gradient(to bottom, rgba(15,23,42,0.38) 0%, rgba(15,23,42,0.52) 58%, rgba(15,23,42,0.76) 100%)";
  }

  if (surface === "splash") {
    if (themePreset === "luxury_dark") {
      return "linear-gradient(to bottom, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.88) 100%)";
    }
    if (themePreset === "warm_casual") {
      return "linear-gradient(to bottom, rgba(92,32,8,0.24) 0%, rgba(92,32,8,0.56) 55%, rgba(31,15,10,0.84) 100%)";
    }
    return "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.82) 100%)";
  }

  if (themePreset === "luxury_dark") {
    return "linear-gradient(to bottom, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.68) 100%)";
  }
  if (themePreset === "warm_casual") {
    return "linear-gradient(to bottom, rgba(92,32,8,0.24) 0%, rgba(92,32,8,0.62) 100%)";
  }
  return "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 100%)";
}
