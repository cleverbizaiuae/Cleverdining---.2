export type OrderPaymentMethod = "cash" | "card";

export const shouldStartCheckoutAfterOrder = (
  orderStatus: unknown,
  paymentMethod: OrderPaymentMethod,
): boolean =>
  paymentMethod === "card" &&
  String(orderStatus ?? "").trim().toLowerCase() === "awaiting_payment";
