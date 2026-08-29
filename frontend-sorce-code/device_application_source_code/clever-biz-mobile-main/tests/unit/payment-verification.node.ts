import assert from "node:assert/strict";
import {
  classifyPaymentVerificationError,
  PAYMENT_CONFIRMATION_PENDING_MESSAGE,
  PAYMENT_VERIFICATION_RETRY_DELAYS_MS,
} from "../../src/pages/payment-verification.ts";

assert.equal(PAYMENT_VERIFICATION_RETRY_DELAYS_MS[0], 0);
assert.ok(PAYMENT_VERIFICATION_RETRY_DELAYS_MS.length >= 8);
assert.ok(
  PAYMENT_VERIFICATION_RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0) >= 45_000,
);

assert.deepEqual(
  classifyPaymentVerificationError({ response: { status: 500 } }),
  {
    retryable: true,
    message: PAYMENT_CONFIRMATION_PENDING_MESSAGE,
  },
);

assert.deepEqual(
  classifyPaymentVerificationError({ code: "ECONNABORTED", message: "timeout" }),
  {
    retryable: true,
    message: PAYMENT_CONFIRMATION_PENDING_MESSAGE,
  },
);

assert.deepEqual(
  classifyPaymentVerificationError({
    response: { status: 400, data: { error: "card_declined" } },
  }),
  {
    retryable: false,
    message: "The payment was declined. Please check your payment details or try another payment method.",
  },
);

assert.deepEqual(
  classifyPaymentVerificationError({ response: { status: 404 } }),
  {
    retryable: false,
    message: "We could not match this payment to your order. Please return to your orders or ask the restaurant for assistance.",
  },
);

console.log("payment verification retry checks passed");
