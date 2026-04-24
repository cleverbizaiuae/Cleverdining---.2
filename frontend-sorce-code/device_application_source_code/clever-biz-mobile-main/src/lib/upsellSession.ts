const SESSION_KEY = "upsell_session_id";
const SIGNALS_KEY = "upsell_signals";
const DISMISSED_ITEMS_KEY = "upsell_dismissed_items";
const ACCEPTED_ITEMS_KEY = "upsell_accepted_items";
const AFTER_ADD_COUNT_KEY = "cb_suggest_after_add";
const CART_COUNT_KEY = "cb_suggest_cart";
const PREPAY_COUNT_KEY = "cb_suggest_prepay";

export type UpsellTouchpoint = "add_to_cart" | "cart" | "before_payment";

const TOUCHPOINT_COUNTER_KEYS: Record<UpsellTouchpoint, string> = {
  add_to_cart: AFTER_ADD_COUNT_KEY,
  cart: CART_COUNT_KEY,
  before_payment: PREPAY_COUNT_KEY,
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
  try {
    Object.values(TOUCHPOINT_COUNTER_KEYS).forEach((key) => {
      sessionStorage.removeItem(key);
    });
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

export function trackUpsellCategoryDecline(categoryId: number | string): void {
  const state = getSignalState();
  const key = toKey(categoryId);
  state.categoryDeclines[key] = (state.categoryDeclines[key] || 0) + 1;
  saveSignalState(state);
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

export function canShowAfterAddUpsell(limit = 2): boolean {
  return canShowUpsellTouchpoint("add_to_cart", limit);
}

export function canShowUpsellTouchpoint(triggerPoint: UpsellTouchpoint, limit = 1): boolean {
  try {
    const storageKey = TOUCHPOINT_COUNTER_KEYS[triggerPoint];
    const current = Number(sessionStorage.getItem(storageKey) || "0");
    return current < Math.max(1, limit);
  } catch {
    return true;
  }
}

export function incrementAfterAddUpsellCount(): number {
  return incrementUpsellTouchpointCount("add_to_cart");
}

export function incrementUpsellTouchpointCount(triggerPoint: UpsellTouchpoint): number {
  try {
    const storageKey = TOUCHPOINT_COUNTER_KEYS[triggerPoint];
    const current = Number(sessionStorage.getItem(storageKey) || "0");
    const next = Number.isFinite(current) ? current + 1 : 1;
    sessionStorage.setItem(storageKey, String(next));
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
