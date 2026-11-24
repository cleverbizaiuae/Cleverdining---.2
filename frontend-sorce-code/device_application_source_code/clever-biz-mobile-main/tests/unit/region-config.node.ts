import assert from "node:assert/strict";
import { getRegionConfig, normalizeRegionCode } from "../../src/config/regionConfig.ts";

// Existing regions are unchanged.
assert.deepEqual(
  [getRegionConfig("UAE").currency, getRegionConfig("UAE").countryAlpha2, getRegionConfig("UAE").payments],
  ["AED", "AE", ["stripe", "checkout", "paytabs", "cash"]],
);
assert.deepEqual(
  [getRegionConfig("UK").currency, getRegionConfig("UK").countryAlpha2, getRegionConfig("UK").payments],
  ["GBP", "GB", ["stripe", "payme", "cash"]],
);

// Ireland and Ghana carry their own currency, country and phone code
// (previously anything that was not "UK" silently became UAE/AED).
assert.deepEqual(
  [getRegionConfig("IE").currency, getRegionConfig("IE").countryAlpha2, getRegionConfig("IE").countryCode],
  ["EUR", "IE", "+353"],
);
assert.deepEqual(
  [getRegionConfig("GH").currency, getRegionConfig("GH").countryAlpha2, getRegionConfig("GH").countryCode],
  ["GHS", "GH", "+233"],
);
assert.equal(getRegionConfig("IE").timezone, "Europe/Dublin");
assert.equal(getRegionConfig("GH").timezone, "Africa/Accra");
assert.ok(!getRegionConfig("IE").payments.includes("payme"));

assert.equal(normalizeRegionCode("ie"), "IE");
assert.equal(normalizeRegionCode("Ghana"), "GH");
assert.equal(normalizeRegionCode(undefined), "UAE");
assert.equal(normalizeRegionCode("unknown"), "UAE");

console.log("guest region config checks passed");
