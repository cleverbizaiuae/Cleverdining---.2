import assert from "node:assert/strict";
import {
  buildUpsellRequestKey,
  isRecentUpsellRequest,
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

assert.equal(isRecentUpsellRequest(1_000, 121_000, 20_000, 30_000), true);
assert.equal(isRecentUpsellRequest(1_000, 121_000, 32_000, 30_000), false);
assert.equal(isRecentUpsellRequest(1_000, 10_000, 11_000, 30_000), false);

console.log("upsell request cache checks passed");
