export const PAYMENT_VERIFICATION_RETRY_DELAYS_MS = [
  0,
  1_000,
  2_000,
  3_000,
  5_000,
  8_000,
  10_000,
  10_000,
  10_000,
  10_000,
] as const;

export const PAYMENT_CONFIRMATION_PENDING_MESSAGE =
  "Your payment is still being confirmed. Your card may already have been charged, so please retry confirmation before starting another payment.";

type PaymentVerificationError = {
  code?: unknown;
  message?: unknown;
  response?: {
    status?: unknown;
    data?: {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
  };
};

export type PaymentVerificationFailure = {
  message: string;
  retryable: boolean;
};

const normalizedErrorText = (error: PaymentVerificationError): string =>
  String(
    error.response?.data?.message ||
      error.response?.data?.detail ||
      error.response?.data?.error ||
      error.message ||
      "",
  ).toLowerCase();

export const classifyPaymentVerificationError = (
  error: unknown,
): PaymentVerificationFailure => {
  const verificationError = (error || {}) as PaymentVerificationError;
  const status = Number(verificationError.response?.status || 0);
  const errorText = normalizedErrorText(verificationError);

  if (errorText.includes("declin")) {
    return {
      retryable: false,
      message: "The payment was declined. Please check your payment details or try another payment method.",
    };
  }

  if (errorText.includes("insufficient")) {
    return {
      retryable: false,
      message: "The payment could not be completed because there were insufficient funds. Please try another payment method.",
    };
  }

  if (errorText.includes("cancel") || errorText.includes("expired")) {
    return {
      retryable: false,
      message: "The payment session was cancelled or expired. Please return to your orders and try again.",
    };
  }

  if (status === 404) {
    return {
      retryable: false,
      message: "We could not match this payment to your order. Please return to your orders or ask the restaurant for assistance.",
    };
  }

  if (status > 0 && status < 500 && status !== 408 && status !== 409 && status !== 425 && status !== 429) {
    return {
      retryable: false,
      message: "The payment could not be confirmed. Please return to your orders and try again or ask the restaurant for assistance.",
    };
  }

  return {
    retryable: true,
    message: PAYMENT_CONFIRMATION_PENDING_MESSAGE,
  };
};
