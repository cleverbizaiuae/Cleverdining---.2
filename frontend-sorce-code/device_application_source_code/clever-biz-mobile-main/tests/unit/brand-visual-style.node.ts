import assert from "node:assert/strict";
import {
  getBrandCoverOverlay,
  getBrandFontFamily,
  readableTextHsl,
  resolveBrandVisualStyle,
  shouldApplyBrandVisualStyle,
} from "../../src/lib/brandVisualStyle.ts";

assert.match(getBrandFontFamily("elegant"), /Playfair Display/);
assert.match(getBrandFontFamily("bold"), /Plus Jakarta Sans/);
assert.match(getBrandFontFamily("modern"), /Inter/);

assert.equal(shouldApplyBrandVisualStyle(false, true), false);
assert.equal(shouldApplyBrandVisualStyle(false, false), false);
assert.equal(shouldApplyBrandVisualStyle(true, false), true);

const disabledBrand = resolveBrandVisualStyle({
  brandingEnabled: false,
  restaurantName: "Custom Restaurant",
  logoUrl: "custom-logo.png",
  coverImageUrl: "custom-cover.png",
  coverPosition: "center top",
  primaryColor: "#123456",
  secondaryColor: "#654321",
  accentColor: "#ABCDEF",
  themePreset: "luxury_dark",
  fontPreset: "elegant",
  tagline: "Custom tagline",
  instagramUrl: "https://instagram.com/custom",
  facebookUrl: null,
  tiktokUrl: null,
  twitterUrl: null,
  websiteUrl: null,
  payBeforeOrder: true,
});
assert.equal(disabledBrand.primaryColor, "#0054FF");
assert.equal(disabledBrand.secondaryColor, "#FFFFFF");
assert.equal(disabledBrand.accentColor, "#FFFFFF");
assert.equal(disabledBrand.themePreset, "classic_clean");
assert.equal(disabledBrand.fontPreset, "modern");
assert.equal(disabledBrand.logoUrl, null);
assert.equal(disabledBrand.coverImageUrl, null);
assert.equal(disabledBrand.instagramUrl, null);
assert.equal(disabledBrand.payBeforeOrder, true);

const enabledBrand = { ...disabledBrand, brandingEnabled: true, primaryColor: "#123456" };
assert.equal(resolveBrandVisualStyle(enabledBrand), enabledBrand);

assert.equal(readableTextHsl("#111827"), "0 0% 100%");
assert.equal(readableTextHsl("#FDE68A"), "215 25% 27%");
assert.equal(readableTextHsl("#FFFFFF"), "215 25% 27%");
assert.equal(readableTextHsl("not-a-color"), "215 25% 27%");

for (const surface of ["splash", "menu", "success"] as const) {
  const classic = getBrandCoverOverlay("classic_clean", surface);
  const luxury = getBrandCoverOverlay("luxury_dark", surface);
  const warm = getBrandCoverOverlay("warm_casual", surface);
  assert.notEqual(classic, luxury);
  assert.notEqual(classic, warm);
  assert.notEqual(luxury, warm);
}

console.log("brand visual style checks passed");
