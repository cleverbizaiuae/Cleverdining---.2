import assert from "node:assert/strict";
import {
  clearPaymentReturnParams,
  getPaymentReturnNotice,
} from "../../src/pages/order/payment-return.ts";

assert.deepEqual(
  getPaymentReturnNotice("?payment=failed&reason=payment_declined"),
  {
    tone: "error",
    message: "The payment was declined. Please check your payment details or try another method.",
  },
);

assert.deepEqual(
  getPaymentReturnNotice("?payment=pending&reason=verification_unavailable"),
  {
    tone: "pending",
    message: "The payment provider has not confirmed the result yet. Please check your bank before retrying; this order will update automatically.",
  },
);

assert.equal(getPaymentReturnNotice("?filter=active"), null);
assert.equal(
  clearPaymentReturnParams(new URL("https://customer.example/dashboard/orders/?filter=active&payment=failed&reason=unknown#orders")),
  "/dashboard/orders/?filter=active#orders",
);

console.log("payment return messaging checks passed");
