import axiosInstance from "./axios";
import { cachedGet } from "./requestCache";
import {
  getUpsellSessionId,
  getUpsellSignalsQueryParams,
  getUpsellTableNumber,
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
  suggestion_copy?: string;
  upsell_score?: number;
  upsell_stage?: string;
  target_role?: string;
  candidate_roles?: string[];
  cart_roles?: string[];
  venue_type?: string;
  agent_reasoning?: string;
  decision_source?: string;
  association_strength?: number;
  co_order_frequency?: number;
};

export type UpsellTriggerPoint = "add_to_cart" | "cart" | "before_payment";

export type UpsellSettingsSnapshot = {
  enabled: boolean;
  show_after_add_to_cart: boolean;
  show_in_cart: boolean;
  show_before_payment: boolean;
  strategy?: string;
  aggressiveness?: "subtle" | "moderate" | "aggressive";
  tone?: string;
};

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

const normalizeUpsellSuggestion = (raw: unknown): UpsellSuggestion | null => {
  if (!raw || typeof raw !== "object") return null;
  const rawRecord = raw as Record<string, unknown>;
  const nestedItem =
    rawRecord.item && typeof rawRecord.item === "object"
      ? (rawRecord.item as Record<string, unknown>)
      : {};
  const source = { ...rawRecord, ...nestedItem };
  const id = Number(source.id ?? source.item_id);
  const itemName = String(source.item_name ?? source.name ?? "").trim();
  const price = safeNumber(source.price);

  if (!Number.isInteger(id) || id <= 0 || !itemName || !Number.isFinite(price) || price < 0) {
    return null;
  }

  return {
    id,
    item_name: itemName,
    price: String(price),
    description: String(source.description || ""),
    slug: String(source.slug || ""),
    category: Number(source.category ?? source.category_id ?? 0) || 0,
    sub_category: Number(source.sub_category ?? source.sub_category_id ?? 0) || 0,
    restaurant: Number(source.restaurant ?? source.restaurant_id ?? 0) || 0,
    category_name: String(source.category_name || ""),
    image1: String(source.image1 ?? source.image_url ?? ""),
    availability: source.availability !== false,
    video: String(source.video || ""),
    restaurant_name: String(source.restaurant_name || ""),
    upsell_rule: source.upsell_rule ? String(source.upsell_rule) : undefined,
    upsell_message: source.suggestion_copy
      ? String(source.suggestion_copy)
      : source.upsell_message
        ? String(source.upsell_message)
        : undefined,
    suggestion_copy: source.suggestion_copy ? String(source.suggestion_copy) : undefined,
    upsell_score: source.upsell_score === undefined ? undefined : safeNumber(source.upsell_score),
    upsell_stage: source.upsell_stage ? String(source.upsell_stage) : undefined,
    target_role: source.target_role ? String(source.target_role) : undefined,
    candidate_roles: Array.isArray(source.candidate_roles) ? source.candidate_roles.map((role) => String(role)) : undefined,
    cart_roles: Array.isArray(source.cart_roles) ? source.cart_roles.map((role) => String(role)) : undefined,
    venue_type: source.venue_type ? String(source.venue_type) : undefined,
    agent_reasoning: source.agent_reasoning ? String(source.agent_reasoning) : undefined,
    decision_source: source.decision_source ? String(source.decision_source) : undefined,
    association_strength:
      source.association_strength === undefined ? undefined : safeNumber(source.association_strength),
    co_order_frequency:
      source.co_order_frequency === undefined ? undefined : safeNumber(source.co_order_frequency),
  };
};

const extractSuggestionArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.suggestions)) return record.suggestions;
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.data)) return record.data;
  return [];
};

const toCsv = (values?: number[]): string | undefined => {
  const normalized = (values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return normalized.length ? Array.from(new Set(normalized)).join(",") : undefined;
};

const getDisabledUpsellItems = (): Set<number> => {
  try {
    const raw = localStorage.getItem("upsell_disabled_items");
    if (!raw) return new Set<number>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<number>();
    return new Set(
      parsed
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    );
  } catch {
    return new Set<number>();
  }
};

const getSessionRestaurantId = (): number | undefined => {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    const restaurantId = Number(
      parsed?.user?.restaurants?.[0]?.id ??
      parsed?.restaurant_id ??
      parsed?.restaurant
    );
    return Number.isInteger(restaurantId) && restaurantId > 0 ? restaurantId : undefined;
  } catch {
    return undefined;
  }
};

const normalizeText = (value: unknown) => String(value || "").trim().toLowerCase();

const itemHaystack = (item: Partial<UpsellSuggestion> | CartLikeItem) =>
  `${normalizeText((item as Partial<UpsellSuggestion>).item_name)} ${normalizeText((item as Partial<UpsellSuggestion>).description)} ${normalizeText((item as Partial<UpsellSuggestion>).category_name)}`;

const hasAny = (item: Partial<UpsellSuggestion> | CartLikeItem, keywords: string[]) => {
  const haystack = itemHaystack(item);
  return keywords.some((keyword) => haystack.includes(keyword));
};

const scoreFallbackCandidate = (
  candidate: UpsellSuggestion,
  sourceItem?: Partial<UpsellSuggestion> | CartLikeItem,
  cartItems: Array<Partial<UpsellSuggestion> | CartLikeItem> = [],
) => {
  let score = 10;
  const source = sourceItem || cartItems[0];
  const sourceLooksMain = source
    ? hasAny(source, ["main", "burger", "pizza", "pasta", "steak", "chicken", "beef", "rice", "meat"])
    : cartItems.some((item) => hasAny(item, ["main", "burger", "pizza", "pasta", "steak", "chicken", "beef", "rice", "meat"]));
  const sourceLooksDrink = source ? hasAny(source, ["drink", "shake", "juice", "cola", "coffee", "tea", "water"]) : false;
  const candidateIsDrink = hasAny(candidate, ["drink", "shake", "juice", "cola", "coffee", "tea", "water"]);
  const candidateIsDessert = hasAny(candidate, ["dessert", "sweet", "cake", "ice", "chocolate"]);
  const candidateIsSide = hasAny(candidate, ["side", "fries", "salad", "starter", "appetizer"]);
  const candidateLooksMain = hasAny(candidate, ["main", "burger", "pizza", "pasta", "steak", "chicken", "beef", "rice", "meat"]);

  if (sourceLooksMain && candidateIsDrink) score += 80;
  if (sourceLooksMain && candidateIsDessert) score += 65;
  if (sourceLooksMain && candidateIsSide) score += 45;
  if (sourceLooksDrink && candidateLooksMain) score += 55;
  if (!sourceLooksMain && !sourceLooksDrink && (candidateIsDrink || candidateIsDessert || candidateIsSide)) score += 35;
  if (candidate.category && source && candidate.category !== (source as CartLikeItem).category) score += 15;
  score += Math.max(0, 1000 - safeNumber(candidate.price)) / 1000;
  return score;
};

export function rememberMenuUpsellCandidates(candidates: unknown[]) {
  try {
    if (Array.isArray(candidates) && candidates.length) {
      sessionStorage.setItem("cb:menu_items", JSON.stringify(candidates));
    }
  } catch {
    // Non-blocking.
  }
}

const readCachedMenuItems = (): unknown[] => {
  try {
    const raw = sessionStorage.getItem("cb:menu_items");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function buildClientUpsellSuggestions(params: {
  candidates: unknown[];
  triggerPoint: UpsellTriggerPoint;
  sourceItem?: Partial<UpsellSuggestion> | CartLikeItem;
  cartItems?: Array<Partial<UpsellSuggestion> | CartLikeItem>;
  cartItemIds?: number[];
  excludeItemIds?: number[];
  restaurantId?: number;
  limit?: number;
}): UpsellSuggestion[] {
  const disabledItems = getDisabledUpsellItems();
  const excludedItems = new Set(
    [...(params.cartItemIds || []), ...(params.excludeItemIds || [])]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
  const cartItems = params.cartItems || [];
  const sourceRestaurantId = Number(params.restaurantId || (params.sourceItem as UpsellSuggestion | undefined)?.restaurant || getSessionRestaurantId());

  return params.candidates
    .map((candidate) => normalizeUpsellSuggestion(candidate))
    .filter((candidate): candidate is UpsellSuggestion => {
      if (!candidate) return false;
      if (candidate.availability === false) return false;
      if (excludedItems.has(candidate.id)) return false;
      if (disabledItems.has(candidate.id)) return false;
      const candidateRestaurantId = Number(candidate.restaurant || 0);
      if (sourceRestaurantId > 0 && candidateRestaurantId > 0 && candidateRestaurantId !== sourceRestaurantId) return false;
      return true;
    })
    .map((candidate) => ({
      candidate,
      score: scoreFallbackCandidate(candidate, params.sourceItem, cartItems),
    }))
    .sort((a, b) => b.score - a.score || safeNumber(a.candidate.price) - safeNumber(b.candidate.price))
    .map(({ candidate }, index) => ({
      ...candidate,
      upsell_rule: candidate.upsell_rule || (index === 0 ? "Perfect with your order" : "Also worth adding"),
      upsell_message: candidate.upsell_message || "Recommended to complete this order.",
      suggestion_copy: candidate.suggestion_copy || candidate.upsell_message || "Recommended to complete this order.",
      decision_source: candidate.decision_source || "client_fallback",
    }))
    .slice(0, params.limit ?? 2);
}

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
  restaurantId?: number;
  cartItemIds?: number[];
  excludeItemIds?: number[];
  stage?: string;
}) {
  const signalParams = getUpsellSignalsQueryParams();
  const sessionToken = localStorage.getItem("guest_session_token");
  const cartItemIds = toCsv(params.cartItemIds);
  const excludeItemIds = toCsv(params.excludeItemIds);
  const restaurantId = Number(params.restaurantId || getSessionRestaurantId());
  const commonParams = {
    trigger_point: params.triggerPoint,
    triggerPoint: params.triggerPoint,
    limit: params.limit ?? 2,
    restaurant_id: Number.isInteger(restaurantId) && restaurantId > 0 ? restaurantId : undefined,
    restaurantId: Number.isInteger(restaurantId) && restaurantId > 0 ? restaurantId : undefined,
    source_item_id: params.sourceItemId,
    sourceItemId: params.sourceItemId,
    cart_item_ids: cartItemIds,
    cartItemIds,
    exclude_item_ids: excludeItemIds,
    excludeItemIds,
    guest_session_token: sessionToken || undefined,
    session_id: getUpsellSessionId(),
    sessionId: getUpsellSessionId(),
    ...signalParams,
  };

  let rawSuggestions: unknown[] = [];
  try {
    const response = await cachedGet(
      "/api/customer/cart/upsell_suggestions/",
      {
        params: commonParams,
        timeout: 2500,
        headers: sessionToken ? { "X-Guest-Session-Token": sessionToken } : undefined,
      },
      { ttlMs: 2_000 }
    );
    rawSuggestions = extractSuggestionArray(response.data);
  } catch {
    rawSuggestions = [];
  }

  if (rawSuggestions.length === 0 && cartItemIds) {
    try {
      const response = await cachedGet(
        "/api/upsell/smart-suggestions",
        {
          params: commonParams,
          timeout: 2500,
          headers: sessionToken ? { "X-Guest-Session-Token": sessionToken } : undefined,
        },
        { ttlMs: 2_000 }
      );
      rawSuggestions = extractSuggestionArray(response.data);
    } catch {
      rawSuggestions = [];
    }
  }

  const mergedById = new Map<number, UpsellSuggestion>();
  for (const rawItem of rawSuggestions) {
    const item = normalizeUpsellSuggestion(rawItem);
    if (item) mergedById.set(item.id, item);
  }

  const merged = Array.from(mergedById.values());
  const disabledItems = getDisabledUpsellItems();
  const excludedItems = new Set(
    [...(params.cartItemIds || []), ...(params.excludeItemIds || [])]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
  const strongHistorical = merged
    .filter((item) => Number(item.association_strength || 0) >= 0.5 && Number(item.co_order_frequency || 0) >= 10)
    .sort((a, b) => Number(b.association_strength || 0) - Number(a.association_strength || 0));
  if (strongHistorical.length > 0) {
    const topHistorical = strongHistorical[0] as UpsellSuggestion;
    const remaining = merged.filter((item) => item.id !== topHistorical.id);
    merged.splice(0, merged.length, topHistorical, ...remaining);
  }

  return merged.filter((item: UpsellSuggestion) => {
    if (!item || !Number.isInteger(item.id)) return false;
    if (item.availability === false) return false;
    if (excludedItems.has(item.id)) return false;
    if (disabledItems.has(item.id)) return false;
    return true;
  }).slice(0, params.limit ?? 2) as UpsellSuggestion[];
}

export async function fetchClientFallbackUpsellSuggestions(params: {
  triggerPoint: UpsellTriggerPoint;
  sourceItem?: Partial<UpsellSuggestion> | CartLikeItem;
  cartItems?: Array<Partial<UpsellSuggestion> | CartLikeItem>;
  cartItemIds?: number[];
  excludeItemIds?: number[];
  restaurantId?: number;
  limit?: number;
}) {
  const restaurantId = Number(params.restaurantId || (params.sourceItem as UpsellSuggestion | undefined)?.restaurant || getSessionRestaurantId());
  let candidates = readCachedMenuItems();

  if (!candidates.length && Number.isInteger(restaurantId) && restaurantId > 0) {
    try {
      const response = await cachedGet(
        "/api/customer/items/",
        { params: { restaurant_id: restaurantId }, timeout: 2500 },
        { ttlMs: 20_000 }
      );
      candidates = extractSuggestionArray(response.data);
      rememberMenuUpsellCandidates(candidates);
    } catch {
      candidates = readCachedMenuItems();
    }
  }

  return buildClientUpsellSuggestions({
    ...params,
    candidates,
    restaurantId,
  });
}

export async function fetchUpsellSettings(): Promise<UpsellSettingsSnapshot> {
  const sessionToken = localStorage.getItem("guest_session_token");
  const response = await cachedGet("/api/upsell/settings", {
    params: sessionToken ? { guest_session_token: sessionToken } : undefined,
    timeout: 2500,
    headers: sessionToken ? { "X-Guest-Session-Token": sessionToken } : undefined,
  }, { ttlMs: 20_000 });
  return {
    enabled: Boolean(response.data?.enabled ?? true),
    show_after_add_to_cart: Boolean(response.data?.show_after_add_to_cart ?? true),
    show_in_cart: Boolean(response.data?.show_in_cart ?? true),
    show_before_payment: Boolean(response.data?.show_before_payment ?? true),
    strategy: response.data?.strategy || "balanced",
    aggressiveness: response.data?.aggressiveness || "moderate",
    tone: response.data?.tone || "friendly",
  };
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
  sourceItemIds?: number[];
  upsellItemId?: number;
  upsellPrice?: number | string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const sessionToken = localStorage.getItem("guest_session_token");
    await axiosInstance.post(
      "/api/upsell/association-stats",
      {
        session_id: getUpsellSessionId(),
        table_number: getUpsellTableNumber(),
        guest_session_token: sessionToken || undefined,
        trigger_point: params.triggerPoint,
        action: params.action,
        source_item_id: params.sourceItemId || null,
        source_item_ids: params.sourceItemIds?.length ? params.sourceItemIds : undefined,
        upsell_item_id: params.upsellItemId || null,
        upsell_price: params.upsellPrice === undefined ? undefined : safeNumber(params.upsellPrice),
        metadata: params.metadata || {},
      },
      {
        headers: sessionToken ? { "X-Guest-Session-Token": sessionToken } : {},
      }
    );
  } catch {
    // Fire-and-forget by design.
  }
}
