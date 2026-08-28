import assert from "node:assert/strict";
import {
  isRevenueUpsellEvent,
  shouldRetryRevenueUpsellEvent,
} from "../../src/lib/upsellEventDelivery.ts";

assert.equal(isRevenueUpsellEvent("accepted"), true);
assert.equal(isRevenueUpsellEvent("shown"), false);
assert.equal(shouldRetryRevenueUpsellEvent("accepted", 0, 0), true);
assert.equal(shouldRetryRevenueUpsellEvent("accepted", 0, 503), true);
assert.equal(shouldRetryRevenueUpsellEvent("accepted", 0, 400), false);
assert.equal(shouldRetryRevenueUpsellEvent("accepted", 1, 503), false);
assert.equal(shouldRetryRevenueUpsellEvent("shown", 0, 503), false);

console.log("upsell revenue event delivery checks passed");
