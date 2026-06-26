export const normalizePaymentStatus = (status: unknown): string =>
  String(status || "unpaid").trim().toLowerCase();

export const isPaymentPaid = (status: unknown): boolean =>
  ["paid", "completed", "succeeded", "success", "fully_paid"].includes(normalizePaymentStatus(status));

export const isFulfillmentComplete = (status: unknown): boolean =>
  ["delivered", "completed"].includes(String(status || "").trim().toLowerCase());

export const shouldRemoveFromActiveOrders = (
  fulfillmentStatus: unknown,
  paymentStatus: unknown,
): boolean => {
  const normalizedFulfillment = String(fulfillmentStatus || "").trim().toLowerCase();
  return normalizedFulfillment === "cancelled" ||
    (isFulfillmentComplete(normalizedFulfillment) && isPaymentPaid(paymentStatus));
};
