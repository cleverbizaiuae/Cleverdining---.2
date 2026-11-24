import assert from "node:assert/strict";
import { REGION_CODES, getRegionConfig, normalizeRegionCode } from "../../src/config/regionConfig.ts";

// Existing regions are unchanged.
assert.equal(getRegionConfig("UAE").currency, "AED");
assert.equal(getRegionConfig("UAE").locale, "en-AE");
assert.equal(getRegionConfig("UK").currency, "GBP");
assert.equal(getRegionConfig("UK").locale, "en-GB");
assert.equal(getRegionConfig("UK").countryLabel, "United Kingdom");
assert.equal(getRegionConfig().currency, "AED");

// Ireland.
const ie = getRegionConfig("IE");
assert.equal(ie.currency, "EUR");
assert.equal(ie.timezone, "Europe/Dublin");
assert.equal(ie.phoneCode, "+353");
assert.equal(ie.countryLabel, "Ireland");
assert.equal(ie.locale, "en-IE");
assert.ok(!ie.payments.includes("payme"));
assert.ok(!ie.payments.includes("paytabs"));
assert.ok(ie.payments.includes(ie.defaultPaymentProvider));

// Ghana.
const gh = getRegionConfig("gh");
assert.equal(gh.currency, "GHS");
assert.equal(gh.timezone, "Africa/Accra");
assert.equal(gh.phoneCode, "+233");
assert.equal(gh.countryLabel, "Ghana");
assert.deepEqual(gh.payments, ["stripe", "cash"]);

// Normalisation: aliases resolve, unknown values keep the old UAE default.
assert.equal(normalizeRegionCode("Ireland"), "IE");
assert.equal(normalizeRegionCode(" ghana "), "GH");
assert.equal(normalizeRegionCode("United Kingdom"), "UK");
assert.equal(normalizeRegionCode("Northern Ireland"), "UK");
assert.equal(normalizeRegionCode(""), "UAE");
assert.equal(normalizeRegionCode(undefined), "UAE");
assert.equal(normalizeRegionCode("XX"), "UAE");
assert.deepEqual(REGION_CODES, ["UAE", "UK", "IE", "GH"]);

// Distinct flags per region.
assert.equal(new Set(REGION_CODES.map((code) => getRegionConfig(code).flag)).size, REGION_CODES.length);

console.log("dashboard region config checks passed");
