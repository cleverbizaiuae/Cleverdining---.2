import type { OrderStage } from "./order-types";

export const mapOrderStatusToStage = (
  status: string | undefined,
): OrderStage => {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "preparing" || normalized === "cooking") {
    return "Preparing";
  }

  if (
    normalized === "ready"
    || normalized === "served"
    || normalized === "delivered"
    || normalized === "cancelled"
    || normalized === "completed"
  ) {
    return "Served";
  }

  // A cash request is awaiting staff confirmation; it is not proof that the
  // food has been served. The cash-collection notice communicates payment state.
  return "Pending";
};
