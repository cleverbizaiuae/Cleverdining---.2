import { REGION_CODES, REGION_CONFIG } from "../config/regionConfig.ts";

/** Exchange rates as returned by GET /api/exchange-rates/ (units per 1 base currency). */
export type ExchangeRates = {
  base: string;
  currencies: string[];
  rates: Record<string, number>;
  approximate?: string[];
  source?: string;
  updated_at?: string;
};

export const DISPLAY_CURRENCY_STORAGE_KEY = "superAdminDisplayCurrency";
export const DISPLAY_CURRENCY_EVENT = "superadmin-display-currency";
/** Super Admin figures are recorded in AED, so AED stays the default display currency. */
export const DEFAULT_DISPLAY_CURRENCY = "AED";

/** Every currency a restaurant can use, from the region table (AED first). */
export const PLATFORM_CURRENCIES: string[] = Array.from(
  new Set(REGION_CODES.map((code) => REGION_CONFIG[code].currency))
);

const normalize = (code?: string | null) => String(code || "").trim().toUpperCase();

/**
 * Convert an amount between platform currencies.
 * Returns null when a needed rate is missing, so callers can keep the original currency.
 */
export function convertAmount(
  value: number | string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
  rates?: ExchangeRates | null
): number | null {
  const amount = Number(value || 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  const source = normalize(from) || DEFAULT_DISPLAY_CURRENCY;
  const target = normalize(to) || DEFAULT_DISPLAY_CURRENCY;
  if (source === target) return safe;
  if (!rates?.rates) return null;
  const base = normalize(rates.base) || DEFAULT_DISPLAY_CURRENCY;
  const perBaseFrom = source === base ? 1 : Number(rates.rates[source]);
  const perBaseTo = target === base ? 1 : Number(rates.rates[target]);
  if (!(perBaseFrom > 0) || !(perBaseTo > 0)) return null;
  return (safe / perBaseFrom) * perBaseTo;
}

/**
 * Amount and currency to show: converted when possible, otherwise the original
 * amount in its original currency (never a converted-looking wrong figure).
 */
export function toDisplayAmount(
  value: number | string | null | undefined,
  from: string | null | undefined,
  displayCurrency: string,
  rates?: ExchangeRates | null
): { amount: number; currency: string } {
  const converted = convertAmount(value, from, displayCurrency, rates);
  if (converted !== null) return { amount: converted, currency: normalize(displayCurrency) || DEFAULT_DISPLAY_CURRENCY };
  const amount = Number(value || 0);
  return { amount: Number.isFinite(amount) ? amount : 0, currency: normalize(from) || DEFAULT_DISPLAY_CURRENCY };
}

/** Sum amounts recorded in different currencies into one display currency. */
export function sumInDisplayCurrency(
  entries: Array<{ amount: number | string | null | undefined; currency?: string | null }>,
  displayCurrency: string,
  rates?: ExchangeRates | null
): { amount: number; currency: string } {
  const target = normalize(displayCurrency) || DEFAULT_DISPLAY_CURRENCY;
  let total = 0;
  for (const entry of entries) {
    const converted = convertAmount(entry.amount, entry.currency, target, rates);
    if (converted === null) {
      // A rate is missing: fall back to a plain AED total rather than mixing currencies.
      return target === DEFAULT_DISPLAY_CURRENCY
        ? { amount: entries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), currency: DEFAULT_DISPLAY_CURRENCY }
        : sumInDisplayCurrency(entries, DEFAULT_DISPLAY_CURRENCY, rates);
    }
    total += converted;
  }
  return { amount: total, currency: target };
}

export function readStoredDisplayCurrency(): string {
  try {
    const stored = normalize(localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY));
    return PLATFORM_CURRENCIES.includes(stored) ? stored : DEFAULT_DISPLAY_CURRENCY;
  } catch {
    return DEFAULT_DISPLAY_CURRENCY;
  }
}
