import assert from "node:assert/strict";
import { shouldShowReviewOrderModal } from "../../src/pages/cart-review.ts";

assert.equal(shouldShowReviewOrderModal(false, 0), false);
assert.equal(shouldShowReviewOrderModal(false, 4), false);
assert.equal(shouldShowReviewOrderModal(true, 0), false);
assert.equal(shouldShowReviewOrderModal(true, 4), true);

console.log("cart review modal visibility checks passed");
