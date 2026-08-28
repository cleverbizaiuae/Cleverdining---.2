export type UpsellEventAction = "shown" | "accepted" | "dismissed" | "declined";

export const isRevenueUpsellEvent = (action: UpsellEventAction): boolean =>
  action === "accepted";

export const shouldRetryRevenueUpsellEvent = (
  action: UpsellEventAction,
  attempt: number,
  status: number,
): boolean =>
  isRevenueUpsellEvent(action) &&
  attempt === 0 &&
  (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500);
