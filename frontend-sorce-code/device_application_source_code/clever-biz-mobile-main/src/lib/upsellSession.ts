const SESSION_KEY = "upsell_session_id";
const SIGNALS_KEY = "upsell_signals";
const DISMISSED_ITEMS_KEY = "upsell_dismissed_items";
const ACCEPTED_ITEMS_KEY = "upsell_accepted_items";
const SHOWN_ITEMS_KEY = "upsell_shown_items";
const AFTER_ADD_COUNT_KEY = "cb_suggest_after_add";
const CART_COUNT_KEY = "cb_suggest_cart";
const PREPAY_COUNT_KEY = "cb_suggest_prepay";
const TOTAL_COUNT_KEY = "cb_suggest_total";
const TOTAL_DECLINE_SCORE_KEY = "cb_suggest_decline_score";

export type UpsellTouchpoint = "add_to_cart" | "cart" | "before_payment";
export type UpsellAggressiveness = "subtle" | "moderate" | "aggressive";

const TOUCHPOINT_COUNTER_KEYS: Record<UpsellTouchpoint, string> = {
  add_to_cart: AFTER_ADD_COUNT_KEY,
  cart: CART_COUNT_KEY,
  // The cart and before-payment placements share the same cart allowance.
  before_payment: CART_COUNT_KEY,
};

type SignalState = {
  categoryDeclines: Record<string, number>;
  categoryViews: Record<string, number>;
  recentlyRemovedCategoryIds: string[];
};

const DEFAULT_SIGNALS: SignalState = {
  categoryDeclines: {},
  categoryViews: {},
  recentlyRemovedCategoryIds: [],
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-blocking
  }
}

export function getUpsellSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const generated = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(SESSION_KEY, generated);
  return generated;
}

export function resetUpsellSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SIGNALS_KEY);
  localStorage.removeItem(DISMISSED_ITEMS_KEY);
  localStorage.removeItem(ACCEPTED_ITEMS_KEY);
  localStorage.removeItem(SHOWN_ITEMS_KEY);
  try {
    Object.values(TOUCHPOINT_COUNTER_KEYS).forEach((key) => {
      sessionStorage.removeItem(key);
    });
    // Clean up counts written by older builds where before-payment had its
    // own allowance.
    sessionStorage.removeItem(PREPAY_COUNT_KEY);
    sessionStorage.removeItem(TOTAL_COUNT_KEY);
    sessionStorage.removeItem(TOTAL_DECLINE_SCORE_KEY);
  } catch {
    // Non-blocking
  }
}

function getSignalState(): SignalState {
  const state = readJson<SignalState>(SIGNALS_KEY, DEFAULT_SIGNALS);
  return {
    categoryDeclines: state.categoryDeclines || {},
    categoryViews: state.categoryViews || {},
    recentlyRemovedCategoryIds: Array.isArray(state.recentlyRemovedCategoryIds) ? state.recentlyRemovedCategoryIds : [],
  };
}

function saveSignalState(next: SignalState): void {
  writeJson(SIGNALS_KEY, next);
}

function toKey(categoryId: number | string): string {
  return String(categoryId);
}

export function trackUpsellCategoryView(categoryId: number | string): void {
  const state = getSignalState();
  const key = toKey(categoryId);
  state.categoryViews[key] = (state.categoryViews[key] || 0) + 1;
  saveSignalState(state);
}

export function trackUpsellCategoryDecline(categoryId: number | string, weight = 1): void {
  const state = getSignalState();
  const key = toKey(categoryId);
  const normalizedWeight = Number.isFinite(Number(weight)) ? Math.max(0, Number(weight)) : 1;
  state.categoryDeclines[key] = Number(((state.categoryDeclines[key] || 0) + normalizedWeight).toFixed(2));
  saveSignalState(state);
  try {
    const current = Number(sessionStorage.getItem(TOTAL_DECLINE_SCORE_KEY) || "0");
    const next = Number.isFinite(current) ? current + normalizedWeight : normalizedWeight;
    sessionStorage.setItem(TOTAL_DECLINE_SCORE_KEY, String(Number(next.toFixed(2))));
  } catch {
    // Non-blocking
  }
}

export function trackUpsellCategoryRemoved(categoryId: number | string): void {
  const state = getSignalState();
  const key = toKey(categoryId);
  const merged = [key, ...state.recentlyRemovedCategoryIds.filter((id) => id !== key)];
  state.recentlyRemovedCategoryIds = merged.slice(0, 12);
  saveSignalState(state);
}

export function getUpsellSignalsQueryParams(): {
  category_views?: string;
  category_declines?: string;
  removed_categories?: string;
} {
  const state = getSignalState();
  const categoryViews = Object.entries(state.categoryViews)
    .filter(([, count]) => Number(count) > 0)
    .map(([id, count]) => `${id}:${Number(count)}`)
    .join(",");

  const categoryDeclines = Object.entries(state.categoryDeclines)
    .filter(([, count]) => Number(count) > 0)
    .map(([id, count]) => `${id}:${Number(count)}`)
    .join(",");

  const removedCategories = state.recentlyRemovedCategoryIds.join(",");

  return {
    category_views: categoryViews || undefined,
    category_declines: categoryDeclines || undefined,
    removed_categories: removedCategories || undefined,
  };
}

export function markUpsellItemDismissed(itemId: number): void {
  const current = readJson<number[]>(DISMISSED_ITEMS_KEY, []);
  if (current.includes(itemId)) return;
  writeJson(DISMISSED_ITEMS_KEY, [...current, itemId]);
}

export function isUpsellItemDismissed(itemId: number): boolean {
  const current = readJson<number[]>(DISMISSED_ITEMS_KEY, []);
  return current.includes(itemId);
}

export function markUpsellItemAccepted(itemId: number): void {
  const current = readJson<number[]>(ACCEPTED_ITEMS_KEY, []);
  if (current.includes(itemId)) return;
  writeJson(ACCEPTED_ITEMS_KEY, [...current, itemId]);
}

export function isUpsellItemAccepted(itemId: number): boolean {
  const current = readJson<number[]>(ACCEPTED_ITEMS_KEY, []);
  return current.includes(itemId);
}

export function markUpsellItemsShown(itemIds: number[]): void {
  const current = readJson<number[]>(SHOWN_ITEMS_KEY, []);
  const merged = new Set(current);
  itemIds.forEach((itemId) => {
    if (Number.isInteger(itemId) && itemId > 0) merged.add(itemId);
  });
  writeJson(SHOWN_ITEMS_KEY, Array.from(merged).slice(-40));
}

export function getUpsellExcludedItemIds(): number[] {
  const values = [
    ...readJson<number[]>(DISMISSED_ITEMS_KEY, []),
    ...readJson<number[]>(ACCEPTED_ITEMS_KEY, []),
  ];
  return Array.from(
    new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))
  );
}

export function canShowAfterAddUpsell(limit = 2): boolean {
  return canShowUpsellTouchpoint("add_to_cart", limit);
}

export function getUpsellSessionCap(aggressiveness: UpsellAggressiveness = "moderate"): number {
  if (aggressiveness === "subtle") return 2;
  if (aggressiveness === "aggressive") return 6;
  return 4;
}

export function canShowUpsellSession(
  aggressiveness: UpsellAggressiveness = "moderate",
): boolean {
  try {
    const perSurfaceLimit = getUpsellTriggerLimit("add_to_cart", aggressiveness);
    return getNormalizedUpsellSessionCount(perSurfaceLimit) < getUpsellSessionCap(aggressiveness);
  } catch {
    return true;
  }
}

export function getEffectiveUpsellAggressiveness(aggressiveness: UpsellAggressiveness = "moderate"): UpsellAggressiveness {
  try {
    const declineScore = Number(sessionStorage.getItem(TOTAL_DECLINE_SCORE_KEY) || "0");
    if (declineScore < 3) return aggressiveness;
  } catch {
    return aggressiveness;
  }
  if (aggressiveness === "aggressive") return "moderate";
  if (aggressiveness === "moderate") return "subtle";
  return "subtle";
}

export function getUpsellTriggerLimit(triggerPoint: UpsellTouchpoint, aggressiveness: UpsellAggressiveness = "moderate"): number {
  void triggerPoint;
  if (aggressiveness === "subtle") return 1;
  if (aggressiveness === "aggressive") return 3;
  return 2;
}

function getUpsellTouchpointCount(triggerPoint: UpsellTouchpoint): number {
  const storageKey = TOUCHPOINT_COUNTER_KEYS[triggerPoint];
  const current = Number(sessionStorage.getItem(storageKey) || "0");
  const legacyBeforePayment =
    triggerPoint === "cart" || triggerPoint === "before_payment"
      ? Number(sessionStorage.getItem(PREPAY_COUNT_KEY) || "0")
      : 0;
  return (Number.isFinite(current) ? current : 0)
    + (Number.isFinite(legacyBeforePayment) ? legacyBeforePayment : 0);
}

function getNormalizedUpsellSessionCount(perSurfaceLimit: number): number {
  const normalizedLimit = Math.max(1, Math.floor(Number(perSurfaceLimit) || 1));
  const menuCount = getUpsellTouchpointCount("add_to_cart");
  const cartCount = getUpsellTouchpointCount("cart");
  return Math.min(menuCount, normalizedLimit) + Math.min(cartCount, normalizedLimit);
}

export function getRemainingUpsellAllowance(
  triggerPoint: UpsellTouchpoint,
  aggressiveness: UpsellAggressiveness = "moderate",
): number {
  try {
    const triggerLimit = getUpsellTriggerLimit(triggerPoint, aggressiveness);
    const sessionLimit = getUpsellSessionCap(aggressiveness);
    const current = getUpsellTouchpointCount(triggerPoint);
    const normalizedTotal = getNormalizedUpsellSessionCount(triggerLimit);
    return Math.max(
      0,
      Math.min(triggerLimit - current, sessionLimit - normalizedTotal),
    );
  } catch {
    return getUpsellTriggerLimit(triggerPoint, aggressiveness);
  }
}

export function canShowUpsellTouchpoint(
  triggerPoint: UpsellTouchpoint,
  limit = 1,
  sessionLimit = Number.POSITIVE_INFINITY,
): boolean {
  try {
    const current = getUpsellTouchpointCount(triggerPoint);
    const normalizedSessionLimit = Math.max(1, sessionLimit);
    const perSurfaceLimit = Number.isFinite(normalizedSessionLimit)
      ? Math.max(1, Math.floor(normalizedSessionLimit / 2))
      : Math.max(1, limit);
    const normalizedTotal = getNormalizedUpsellSessionCount(perSurfaceLimit);
    return current < Math.max(1, limit) && normalizedTotal < normalizedSessionLimit;
  } catch {
    return true;
  }
}

export function incrementAfterAddUpsellCount(): number {
  return incrementUpsellTouchpointCount("add_to_cart");
}

export function incrementUpsellTouchpointCount(
  triggerPoint: UpsellTouchpoint,
  amount = 1,
): number {
  try {
    const incrementBy = Math.max(1, Math.floor(Number(amount) || 1));
    const storageKey = TOUCHPOINT_COUNTER_KEYS[triggerPoint];
    const current = Number(sessionStorage.getItem(storageKey) || "0");
    const next = Number.isFinite(current) ? current + incrementBy : incrementBy;
    sessionStorage.setItem(storageKey, String(next));
    const total = Number(sessionStorage.getItem(TOTAL_COUNT_KEY) || "0");
    const nextTotal = Number.isFinite(total) ? total + incrementBy : incrementBy;
    sessionStorage.setItem(TOTAL_COUNT_KEY, String(nextTotal));
    return next;
  } catch {
    return 0;
  }
}

export function getUpsellTableNumber(): string {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return (
      parsed?.user?.restaurants?.[0]?.table_name ||
      parsed?.table_name ||
      ""
    );
  } catch {
    return "";
  }
}
