import axiosInstance from "./axios";
import {
  isUpsellItemAccepted,
  getUpsellSessionId,
  getUpsellSignalsQueryParams,
  getUpsellTableNumber,
  isUpsellItemDismissed,
} from "./upsellSession";

export type UpsellSuggestion = {
  id: number;
  item_name: string;
  price: string | number;
  description?: string;
  slug?: string;
  category?: number;
  sub_category?: number;
  restaurant?: number;
  category_name?: string;
  image1?: string;
  availability?: boolean;
  video?: string;
  restaurant_name?: string;
  upsell_rule?: string;
  upsell_message?: string;
  upsell_score?: number;
  upsell_stage?: string;
};

export type UpsellTriggerPoint = "add_to_cart" | "cart" | "before_payment";

type CartLikeItem = {
  id: number;
  quantity?: number;
  category?: number;
  sub_category?: number;
  item_name?: string;
  price?: number | string;
};

const safeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export function summarizeCart(items: CartLikeItem[]) {
  const cartValue = items.reduce((sum, item) => sum + safeNumber(item.price) * Math.max(1, Number(item.quantity || 1)), 0);
  const cartItemCount = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
  return {
    cartValueAtTime: Number(cartValue.toFixed(2)),
    cartItemCount,
  };
}

export async function fetchUpsellSuggestions(params: {
  triggerPoint: UpsellTriggerPoint;
  limit?: number;
  sourceItemId?: number;
}) {
  const signalParams = getUpsellSignalsQueryParams();
  const response = await axiosInstance.get("/api/customer/cart/upsell_suggestions/", {
    params: {
      trigger_point: params.triggerPoint,
      limit: params.limit ?? 2,
      source_item_id: params.sourceItemId,
      ...signalParams,
    },
  });
  const raw = Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
  return raw.filter((item: UpsellSuggestion) => {
    if (!item || !Number.isInteger(item.id)) return false;
    if (item.availability === false) return false;
    if (isUpsellItemDismissed(item.id)) return false;
    if (isUpsellItemAccepted(item.id)) return false;
    return true;
  }) as UpsellSuggestion[];
}

export async function logUpsellEvent(params: {
  triggerPoint: UpsellTriggerPoint;
  action: "shown" | "accepted" | "dismissed" | "declined";
  suggestion: Partial<UpsellSuggestion>;
  cartValueAtTime: number;
  cartItemCount: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    const now = new Date();
    const sessionToken = localStorage.getItem("guest_session_token");
    await axiosInstance.post(
      "/api/upsell/events",
      {
        session_id: getUpsellSessionId(),
        table_number: getUpsellTableNumber(),
        trigger_point: params.triggerPoint,
        action: params.action,
        upsell_item: params.suggestion.id || null,
        upsell_item_name: params.suggestion.item_name || "",
        upsell_category: params.suggestion.category_name || "",
        upsell_price: safeNumber(params.suggestion.price),
        cart_value_at_time: safeNumber(params.cartValueAtTime),
        cart_item_count: params.cartItemCount,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        metadata: params.metadata || {},
      },
      {
        headers: sessionToken ? { "X-Guest-Session-Token": sessionToken } : {},
      }
    );
  } catch {
    // Non-blocking by design.
  }
}

export async function logUpsellShownBatch(params: {
  triggerPoint: UpsellTriggerPoint;
  suggestions: UpsellSuggestion[];
  cartValueAtTime: number;
  cartItemCount: number;
  metadata?: Record<string, unknown>;
}) {
  if (!params.suggestions.length) return;
  await Promise.all(
    params.suggestions.map((suggestion) =>
      logUpsellEvent({
        triggerPoint: params.triggerPoint,
        action: "shown",
        suggestion,
        cartValueAtTime: params.cartValueAtTime,
        cartItemCount: params.cartItemCount,
        metadata: params.metadata,
      })
    )
  );
}

export async function logUpsellAssociationStat(params: {
  triggerPoint: UpsellTriggerPoint;
  action: "shown" | "accepted" | "dismissed";
  sourceItemId?: number;
  upsellItemId?: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    await axiosInstance.post("/api/upsell/association-stats", {
      session_id: getUpsellSessionId(),
      table_number: getUpsellTableNumber(),
      trigger_point: params.triggerPoint,
      action: params.action,
      source_item_id: params.sourceItemId || null,
      upsell_item_id: params.upsellItemId || null,
      metadata: params.metadata || {},
    });
  } catch {
    // Fire-and-forget by design.
  }
}
