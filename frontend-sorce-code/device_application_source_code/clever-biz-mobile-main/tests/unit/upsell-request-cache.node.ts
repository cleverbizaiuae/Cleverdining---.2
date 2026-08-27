import assert from "node:assert/strict";
import {
  buildUpsellRequestKey,
  isRecentUpsellRequest,
  UPSELL_LIVE_PREFETCH_MAX_AGE_MS,
} from "../../src/lib/upsellRequestCache.ts";

const baseRequest = {
  triggerPoint: "add_to_cart",
  limit: 6,
  sourceItemId: 12,
  restaurantId: 4,
  cartItemIds: [12, 7],
  excludeItemIds: [19, 7],
  stage: "",
  configVersion: 3,
  sessionId: "session-a",
  tableNumber: "T1",
  signals: {
    category_views: "2:1",
    category_declines: "",
    removed_categories: "",
  },
};

assert.equal(
  buildUpsellRequestKey(baseRequest),
  buildUpsellRequestKey({
    ...baseRequest,
    cartItemIds: [7, 12, 7],
    excludeItemIds: [7, 19],
  }),
);
assert.notEqual(
  buildUpsellRequestKey(baseRequest),
  buildUpsellRequestKey({ ...baseRequest, sessionId: "session-b" }),
);
assert.notEqual(
  buildUpsellRequestKey(baseRequest),
  buildUpsellRequestKey({
    ...baseRequest,
    signals: { ...baseRequest.signals, category_views: "2:2" },
  }),
);

const cartRequest = {
  ...baseRequest,
  triggerPoint: "cart",
  sourceItemId: 0,
};
assert.equal(
  buildUpsellRequestKey(cartRequest),
  buildUpsellRequestKey({ ...cartRequest, sourceItemId: 12 }),
  "cart prefetch and cart screen must share one request regardless of source item",
);
assert.notEqual(
  buildUpsellRequestKey(baseRequest),
  buildUpsellRequestKey({ ...baseRequest, sourceItemId: 13 }),
  "after-add requests must remain anchored to their source item",
);

assert.equal(
  isRecentUpsellRequest(1_000, 300_000, 120_999, UPSELL_LIVE_PREFETCH_MAX_AGE_MS),
  true,
  "an exact completed cart prefetch remains reusable during its two-minute memory lifetime",
);
assert.equal(
  isRecentUpsellRequest(1_000, 300_000, 121_001, UPSELL_LIVE_PREFETCH_MAX_AGE_MS),
  false,
  "a prefetch older than the bounded live window must be refreshed",
);
assert.equal(
  isRecentUpsellRequest(1_000, 10_000, 11_000, UPSELL_LIVE_PREFETCH_MAX_AGE_MS),
  false,
  "an expired request is never reused even when it is recent",
);

console.log("upsell request cache checks passed");
