import assert from "node:assert/strict";
import { shouldStartCheckoutAfterOrder } from "../../src/pages/cart-payment.ts";

assert.equal(shouldStartCheckoutAfterOrder("awaiting_payment", "card"), true);
assert.equal(shouldStartCheckoutAfterOrder(" AWAITING_PAYMENT ", "card"), true);
assert.equal(shouldStartCheckoutAfterOrder("pending", "card"), false);
assert.equal(shouldStartCheckoutAfterOrder("preparing", "card"), false);
assert.equal(shouldStartCheckoutAfterOrder(undefined, "card"), false);
assert.equal(shouldStartCheckoutAfterOrder("awaiting_payment", "cash"), false);

console.log("post-order checkout guard checks passed");
