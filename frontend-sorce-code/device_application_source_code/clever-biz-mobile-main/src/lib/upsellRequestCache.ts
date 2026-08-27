type UpsellSignalParams = {
  category_views?: string;
  category_declines?: string;
  removed_categories?: string;
};

// Cart prefetches are exact to the session, table, cart, exclusions, signals,
// and known configuration version. Keep them reusable for the same bounded
// lifetime as the in-memory result instead of discarding a completed request
// after only 30 seconds and starting another LLM round trip.
export const UPSELL_LIVE_PREFETCH_MAX_AGE_MS = 2 * 60_000;

type UpsellRequestKeyInput = {
  triggerPoint: string;
  limit: number;
  sourceItemId: number;
  restaurantId: number;
  cartItemIds?: number[];
  excludeItemIds?: number[];
  stage?: string;
  configVersion: number;
  sessionId: string;
  tableNumber: string;
  signals: UpsellSignalParams;
};

const sortedPositiveIds = (values?: number[]) =>
  Array.from(
    new Set(
      (values || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((left, right) => left - right);

export const buildUpsellRequestKey = (input: UpsellRequestKeyInput): string =>
  JSON.stringify({
    triggerPoint: input.triggerPoint,
    limit: input.limit,
    // Only the immediate after-add surface is anchored to one source item.
    // Cart and payment surfaces evaluate the complete order, so normalizing
    // their source prevents duplicate requests for the same business context.
    sourceItemId: input.triggerPoint === "add_to_cart" ? input.sourceItemId : 0,
    restaurantId: input.restaurantId,
    cartItemIds: sortedPositiveIds(input.cartItemIds),
    excludeItemIds: sortedPositiveIds(input.excludeItemIds),
    stage: input.stage || "",
    configVersion: input.configVersion,
    sessionId: input.sessionId,
    tableNumber: input.tableNumber,
    signals: {
      category_views: input.signals.category_views || "",
      category_declines: input.signals.category_declines || "",
      removed_categories: input.signals.removed_categories || "",
    },
  });

export const isRecentUpsellRequest = (
  createdAt: number,
  expiresAt: number,
  now: number,
  maxAgeMs: number,
): boolean =>
  expiresAt > now
  && createdAt <= now
  && now - createdAt <= maxAgeMs;
