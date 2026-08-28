import assert from "node:assert/strict";
import {
  getBrandCoverOverlay,
  getBrandFontFamily,
  readableTextHsl,
  shouldApplyBrandVisualStyle,
} from "../../src/lib/brandVisualStyle.ts";

assert.match(getBrandFontFamily("elegant"), /Playfair Display/);
assert.match(getBrandFontFamily("bold"), /Plus Jakarta Sans/);
assert.match(getBrandFontFamily("modern"), /Inter/);

assert.equal(shouldApplyBrandVisualStyle(false, true), true);
assert.equal(shouldApplyBrandVisualStyle(false, false), false);
assert.equal(shouldApplyBrandVisualStyle(true, false), true);

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
