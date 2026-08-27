import axiosInstance from "./axios";
import { cachedGet } from "./requestCache";
import {
  getUpsellSessionId,
  getUpsellSignalsQueryParams,
  getUpsellTableNumber,
} from "./upsellSession";
import { getEffectiveItemPrice } from "../utils/pricing";
import {
  buildUpsellRequestKey,
  isRecentUpsellRequest,
  UPSELL_LIVE_PREFETCH_MAX_AGE_MS,
} from "./upsellRequestCache";

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
  discount_percentage?: number | string;
  final_price?: number | string;
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
  session_cap?: number;
  menu_version?: number;
  config_version?: number;
};

const UPSELL_TRIGGER_SETTING: Record<
  UpsellTriggerPoint,
  keyof Pick<
    UpsellSettingsSnapshot,
    "show_after_add_to_cart" | "show_in_cart" | "show_before_payment"
  >
> = {
  add_to_cart: "show_after_add_to_cart",
  cart: "show_in_cart",
  before_payment: "show_before_payment",
};

export function isUpsellTriggerEnabled(
  settings: UpsellSettingsSnapshot | null | undefined,
  triggerPoint: UpsellTriggerPoint,
  defaultWhenUnknown = true,
): boolean {
  if (!settings) return defaultWhenUnknown;
  return settings.enabled && Boolean(settings[UPSELL_TRIGGER_SETTING[triggerPoint]]);
}

type CartLikeItem = {
  id: number;
  quantity?: number;
  category?: number;
  sub_category?: number;
  item_name?: string;
  price?: number | string;
  discount_percentage?: number | string;
  final_price?: number | string;
  description?: string;
  category_name?: string;
};

const safeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const UPSELL_REQUEST_TIMEOUT_MS = 7_000;
const UPSELL_RESOLUTION_TIMEOUT_MS = 12_000;
const UPSELL_RETRY_DELAY_MS = 250;
const UPSELL_RESULT_CACHE_MS = 2 * 60_000;
const UPSELL_PERSISTED_RESULT_CACHE_MS = 15 * 60_000;
const UPSELL_PERSISTED_RESULT_PREFIX = "cb:upsell_result:v1:";
const UPSELL_CONFIG_VERSION_KEY = "cb:upsell_config_version";
const upsellResultRequests = new Map<
  string,
  { createdAt: number; expiresAt: number; request: Promise<UpsellSuggestion[]> }
>();

const clearPersistedUpsellResults = () => {
  upsellResultRequests.clear();
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(UPSELL_PERSISTED_RESULT_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Persistent caching is an optimization only.
  }
};

const getKnownUpsellConfigVersion = (): number => {
  try {
    const version = Number(localStorage.getItem(UPSELL_CONFIG_VERSION_KEY) || 0);
    return Number.isInteger(version) && version > 0 ? version : 0;
  } catch {
    return 0;
  }
};

const syncUpsellConfigVersion = (value: unknown) => {
  const version = Number(value || 0);
  if (!Number.isInteger(version) || version <= 0) return;
  const previous = getKnownUpsellConfigVersion();
  if (previous !== version) {
    clearPersistedUpsellResults();
    try {
      localStorage.setItem(UPSELL_CONFIG_VERSION_KEY, String(version));
    } catch {
      // In-memory invalidation above is still sufficient for this page load.
    }
  }
};

const UPSELL_LOG_DISABLED_UNTIL_KEY = "cb:upsell_log_disabled_until";
const recentLogKeys = new Map<string, number>();

const getLogDisabledUntil = () => {
  try {
    return Number(sessionStorage.getItem(UPSELL_LOG_DISABLED_UNTIL_KEY) || 0);
  } catch {
    return 0;
  }
};

const disableUpsellLoggingTemporarily = () => {
  try {
    sessionStorage.setItem(UPSELL_LOG_DISABLED_UNTIL_KEY, String(Date.now() + 5 * 60_000));
  } catch {
    // Logging is non-critical.
  }
};

const shouldSendUpsellLog = (key: string, ttlMs = 20_000) => {
  const now = Date.now();
  if (getLogDisabledUntil() > now) return false;

  const previous = recentLogKeys.get(key) || 0;
  if (now - previous < ttlMs) return false;

  recentLogKeys.set(key, now);
  if (recentLogKeys.size > 150) {
    for (const [entryKey, entryTime] of recentLogKeys.entries()) {
      if (now - entryTime > 120_000) recentLogKeys.delete(entryKey);
    }
  }
  return true;
};

const handleUpsellLogFailure = (error: unknown) => {
  const maybeError = error as { response?: { status?: number }; code?: string };
  const status = Number(maybeError?.response?.status || 0);
  // Temporary connectivity or validation failures must not silence every
  // later analytics event in the customer session.
  if (status === 404 || status === 405) {
    disableUpsellLoggingTemporarily();
  }
};

const compactMetadata = (metadata?: Record<string, unknown>) => {
  if (!metadata) return "";
  const source = metadata.source_item_id ?? metadata.source_category_id ?? "";
  const surface = metadata.surface ?? "";
  return `${surface}:${source}`;
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

export function summarizeCart(items: CartLikeItem[]) {
  const cartValue = items.reduce((sum, item) => sum + getEffectiveItemPrice(item) * Math.max(1, Number(item.quantity || 1)), 0);
  const cartItemCount = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
  return {
    cartValueAtTime: Number(cartValue.toFixed(2)),
    cartItemCount,
  };
}

export type UpsellSuggestionRequest = {
  triggerPoint: UpsellTriggerPoint;
  limit?: number;
  sourceItemId?: number;
  restaurantId?: number;
  cartItemIds?: number[];
  excludeItemIds?: number[];
  stage?: string;
};

const getUpsellFetchLimit = (triggerPoint: UpsellTriggerPoint) =>
  triggerPoint === "add_to_cart" ? 6 : 2;

const getUpsellRequestKey = (params: UpsellSuggestionRequest) => {
  const restaurantId = Number(params.restaurantId || getSessionRestaurantId() || 0);
  return buildUpsellRequestKey({
    triggerPoint: params.triggerPoint,
    limit: getUpsellFetchLimit(params.triggerPoint),
    sourceItemId: Number(params.sourceItemId || 0),
    restaurantId,
    cartItemIds: params.cartItemIds,
    excludeItemIds: params.excludeItemIds,
    stage: params.stage || "",
    configVersion: getKnownUpsellConfigVersion(),
    sessionId: getUpsellSessionId(),
    tableNumber: getUpsellTableNumber(),
    signals: getUpsellSignalsQueryParams(),
  });
};

const shortCacheHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getPersistedResultKey = (requestKey: string) =>
  `${UPSELL_PERSISTED_RESULT_PREFIX}${shortCacheHash(requestKey)}`;

const writePersistedUpsellResult = (
  requestKey: string,
  suggestions: UpsellSuggestion[]
) => {
  if (!suggestions.length) return;
  try {
    localStorage.setItem(
      getPersistedResultKey(requestKey),
      JSON.stringify({
        requestKey,
        expiresAt: Date.now() + UPSELL_PERSISTED_RESULT_CACHE_MS,
        suggestions,
      })
    );
  } catch {
    // Persistent caching is an optimization only.
  }
};

const readPersistedUpsellResult = (
  requestKey: string
): UpsellSuggestion[] | null => {
  try {
    const storageKey = getPersistedResultKey(requestKey);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      requestKey?: string;
      expiresAt?: number;
      suggestions?: unknown[];
    };
    if (parsed.requestKey !== requestKey || Number(parsed.expiresAt || 0) <= Date.now()) {
      localStorage.removeItem(storageKey);
      return null;
    }
    const disabledItems = getDisabledUpsellItems();
    const suggestions = (parsed.suggestions || [])
      .map(normalizeUpsellSuggestion)
      .filter((item): item is UpsellSuggestion => Boolean(item))
      .filter((item) => item.availability !== false && !disabledItems.has(item.id));
    if (!suggestions.length) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return suggestions;
  } catch {
    return null;
  }
};

const waitForUpsellRetry = (delayMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));

const isTransientUpsellError = (error: unknown) => {
  const candidate = error as {
    code?: string;
    response?: { status?: number };
  };
  const status = Number(candidate?.response?.status || 0);
  return (
    !candidate?.response ||
    candidate?.code === "ECONNABORTED" ||
    candidate?.code === "ERR_NETWORK" ||
    [408, 425, 429, 500, 502, 503, 504].includes(status)
  );
};

const fetchUpsellSuggestionsRemote = async (
  params: UpsellSuggestionRequest
): Promise<UpsellSuggestion[]> => {
  const signalParams = getUpsellSignalsQueryParams();
  const sessionToken = localStorage.getItem("guest_session_token");
  const cartItemIds = toCsv(params.cartItemIds);
  const excludeItemIds = toCsv(params.excludeItemIds);
  const restaurantId = Number(params.restaurantId || getSessionRestaurantId());
  const sourceItemId = params.triggerPoint === "add_to_cart"
    ? params.sourceItemId
    : undefined;
  const commonParams = {
    trigger_point: params.triggerPoint,
    triggerPoint: params.triggerPoint,
    limit: getUpsellFetchLimit(params.triggerPoint),
    restaurant_id: Number.isInteger(restaurantId) && restaurantId > 0 ? restaurantId : undefined,
    restaurantId: Number.isInteger(restaurantId) && restaurantId > 0 ? restaurantId : undefined,
    source_item_id: sourceItemId,
    sourceItemId,
    cart_item_ids: cartItemIds,
    cartItemIds,
    exclude_item_ids: excludeItemIds,
    excludeItemIds,
    guest_session_token: sessionToken || undefined,
    session_id: getUpsellSessionId(),
    sessionId: getUpsellSessionId(),
    ...signalParams,
  };

  const headers = sessionToken ? { "X-Guest-Session-Token": sessionToken } : undefined;
  const startedAt = Date.now();
  let attempt = 0;
  let response: { data: unknown; status: number };
  while (true) {
    const remainingMs = UPSELL_RESOLUTION_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw new Error("Upsell recommendation timed out.");
    }
    try {
      response = await axiosInstance.get("/api/upsell/smart-suggestions", {
        params: {
          ...commonParams,
          async_llm: attempt > 0 ? "1" : undefined,
        },
        timeout: Math.max(1_200, Math.min(UPSELL_REQUEST_TIMEOUT_MS, remainingMs)),
        headers,
      });
      const payload = response.data && typeof response.data === "object"
        ? response.data as Record<string, unknown>
        : {};
      const knowledgeBase = payload.knowledge_base && typeof payload.knowledge_base === "object"
        ? payload.knowledge_base as Record<string, unknown>
        : {};
      syncUpsellConfigVersion(knowledgeBase.config_version);
      if (response.status !== 202 && payload.pending !== true) break;

      const retryAfterMs = Math.max(
        150,
        Math.min(Number(payload.retry_after_ms || UPSELL_RETRY_DELAY_MS), 600)
      );
      attempt += 1;
      await waitForUpsellRetry(retryAfterMs);
    } catch (error) {
      if (!isTransientUpsellError(error) || attempt >= 2) throw error;
      attempt += 1;
      await waitForUpsellRetry(UPSELL_RETRY_DELAY_MS * attempt);
    }
  }

  const rawSuggestions = extractSuggestionArray(response.data);

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
  return merged.filter((item: UpsellSuggestion) => {
    if (!item || !Number.isInteger(item.id)) return false;
    if (item.decision_source !== "llm") return false;
    if (item.availability === false) return false;
    if (excludedItems.has(item.id)) return false;
    if (disabledItems.has(item.id)) return false;
    return true;
  }).slice(0, getUpsellFetchLimit(params.triggerPoint)) as UpsellSuggestion[];
};

export function fetchUpsellSuggestions(
  params: UpsellSuggestionRequest,
  options: { force?: boolean; preferRecent?: boolean } = {},
): Promise<UpsellSuggestion[]> {
  const key = getUpsellRequestKey(params);
  const now = Date.now();
  const cached = upsellResultRequests.get(key);
  const canReuseCached =
    cached
    && (
      (!options.force && !options.preferRecent && cached.expiresAt > now)
      || (
        options.preferRecent
        && isRecentUpsellRequest(
          cached.createdAt,
          cached.expiresAt,
          now,
          UPSELL_LIVE_PREFETCH_MAX_AGE_MS,
        )
      )
    );
  if (canReuseCached) return cached.request;

  const persisted = options.force || options.preferRecent
    ? null
    : readPersistedUpsellResult(key);
  if (persisted) {
    const request = Promise.resolve(persisted.slice(0, params.limit ?? 2));
    upsellResultRequests.set(key, {
      createdAt: now,
      expiresAt: now + UPSELL_RESULT_CACHE_MS,
      request,
    });
    return request;
  }

  const request = fetchUpsellSuggestionsRemote(params)
    .then((suggestions) => {
      if (suggestions.length) writePersistedUpsellResult(key, suggestions);
      return suggestions;
    })
    .catch((error) => {
      upsellResultRequests.delete(key);
      throw error;
    });
  upsellResultRequests.set(key, {
    createdAt: now,
    expiresAt: now + UPSELL_RESULT_CACHE_MS,
    request,
  });
  if (upsellResultRequests.size > 80) {
    for (const [entryKey, entry] of upsellResultRequests.entries()) {
      if (entry.expiresAt <= now) upsellResultRequests.delete(entryKey);
    }
  }
  return request;
}

export function prefetchUpsellSuggestions(params: UpsellSuggestionRequest): void {
  void fetchUpsellSuggestions(params).catch(() => {
    // Prefetch is an optimization; the add action will retry on failure.
  });
}

export async function fetchUpsellSettings(
  options: { force?: boolean } = {},
): Promise<UpsellSettingsSnapshot> {
  const sessionToken = localStorage.getItem("guest_session_token");
  const response = await cachedGet("/api/upsell/settings", {
    params: sessionToken ? { guest_session_token: sessionToken } : undefined,
    timeout: 3500,
    headers: sessionToken ? { "X-Guest-Session-Token": sessionToken } : undefined,
  }, { ttlMs: 5_000, force: options.force });
  syncUpsellConfigVersion(response.data?.config_version);
  return {
    enabled: Boolean(response.data?.enabled ?? true),
    show_after_add_to_cart: Boolean(response.data?.show_after_add_to_cart ?? true),
    show_in_cart: Boolean(response.data?.show_in_cart ?? true),
    show_before_payment: Boolean(response.data?.show_before_payment ?? true),
    strategy: response.data?.strategy || "balanced",
    aggressiveness: response.data?.aggressiveness || "moderate",
    tone: response.data?.tone || "friendly",
    session_cap: safeNumber(response.data?.session_cap) || undefined,
    menu_version: safeNumber(response.data?.menu_version) || undefined,
    config_version: safeNumber(response.data?.config_version) || undefined,
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
  const logKey = [
    "event",
    getUpsellSessionId(),
    params.triggerPoint,
    params.action,
    params.suggestion.id || "unknown",
    params.cartItemCount,
    compactMetadata(params.metadata),
  ].join(":");
  if (!shouldSendUpsellLog(logKey, params.action === "shown" ? 30_000 : 3_000)) return;

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
        // Match the effective price added to the cart, including discounts.
        upsell_price: getEffectiveItemPrice(params.suggestion),
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
  } catch (error) {
    handleUpsellLogFailure(error);
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
  await Promise.allSettled(
    params.suggestions.slice(0, 3).map((suggestion) =>
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
  const sourceKey = params.sourceItemIds?.length
    ? params.sourceItemIds.join(",")
    : params.sourceItemId || "unknown";
  const logKey = [
    "association",
    getUpsellSessionId(),
    params.triggerPoint,
    params.action,
    sourceKey,
    params.upsellItemId || "unknown",
    compactMetadata(params.metadata),
  ].join(":");
  if (!shouldSendUpsellLog(logKey, params.action === "shown" ? 30_000 : 3_000)) return;

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
  } catch (error) {
    handleUpsellLogFailure(error);
    // Fire-and-forget by design.
  }
}
