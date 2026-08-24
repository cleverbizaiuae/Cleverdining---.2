export type BrandVisualSurface = "splash" | "menu" | "success";

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
  hasMeaningfulBranding: boolean,
): boolean {
  return brandingEnabled || hasMeaningfulBranding;
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
