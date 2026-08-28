export type PaymentReturnNotice = {
  tone: "error" | "pending";
  message: string;
};

const PAYMENT_FAILURE_MESSAGES: Record<string, string> = {
  checkout_not_found: "We could not find this payment attempt. Please try again.",
  missing_transaction_reference: "The payment provider did not return a payment reference. Please check your bank before retrying or ask staff for help.",
  payment_cancelled: "The payment was cancelled. You have not completed payment and can try again.",
  payment_declined: "The payment was declined. Please check your payment details or try another method.",
  payment_failed: "The payment was not completed. Please try again or use another payment method.",
  unknown: "We could not confirm the payment. Please check your bank before retrying or ask staff for help.",
};

const PAYMENT_PENDING_MESSAGES: Record<string, string> = {
  payment_pending: "Your payment is still being confirmed. We will update this order automatically.",
  verification_unavailable: "The payment provider has not confirmed the result yet. Please check your bank before retrying; this order will update automatically.",
};

export const getPaymentReturnNotice = (search: string): PaymentReturnNotice | null => {
  const params = new URLSearchParams(search);
  const state = String(params.get("payment") || "").trim().toLowerCase();
  const reason = String(params.get("reason") || "").trim().toLowerCase();

  if (state === "pending") {
    return {
      tone: "pending",
      message: PAYMENT_PENDING_MESSAGES[reason] || PAYMENT_PENDING_MESSAGES.payment_pending,
    };
  }

  if (["failed", "cancelled", "canceled", "declined", "error"].includes(state)) {
    return {
      tone: "error",
      message: PAYMENT_FAILURE_MESSAGES[reason] || PAYMENT_FAILURE_MESSAGES.payment_failed,
    };
  }

  return null;
};

export const clearPaymentReturnParams = (url: URL): string => {
  const cleaned = new URL(url.toString());
  cleaned.searchParams.delete("payment");
  cleaned.searchParams.delete("reason");
  return `${cleaned.pathname}${cleaned.search}${cleaned.hash}`;
};
