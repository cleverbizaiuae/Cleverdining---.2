type UpsellSignalParams = {
  category_views?: string;
  category_declines?: string;
  removed_categories?: string;
};

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
    sourceItemId: input.sourceItemId,
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
