import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axiosInstance from "./axios";
import {
  DEFAULT_DISPLAY_CURRENCY,
  DISPLAY_CURRENCY_EVENT,
  DISPLAY_CURRENCY_STORAGE_KEY,
  PLATFORM_CURRENCIES,
  readStoredDisplayCurrency,
  sumInDisplayCurrency,
  toDisplayAmount,
  type ExchangeRates,
} from "./displayCurrency";

/**
 * Super Admin display currency, shared by the header selector and every Super Admin page.
 * Must be used inside the Super Admin QueryClientProvider.
 */
export function useDisplayCurrency() {
  const [currency, setCurrencyState] = useState<string>(() => readStoredDisplayCurrency());

  useEffect(() => {
    const sync = () => setCurrencyState(readStoredDisplayCurrency());
    window.addEventListener(DISPLAY_CURRENCY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISPLAY_CURRENCY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setCurrency = useCallback((next: string) => {
    try {
      localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the selection still applies to this page.
    }
    setCurrencyState(next);
    window.dispatchEvent(new Event(DISPLAY_CURRENCY_EVENT));
  }, []);

  const { data: rates } = useQuery<ExchangeRates | null>({
    queryKey: ["platform-exchange-rates"],
    queryFn: async () => {
      try {
        const response = await axiosInstance.get("/api/exchange-rates/");
        return response.data as ExchangeRates;
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60 * 60 * 6,
    refetchOnWindowFocus: false,
  });

  const currencies = rates?.currencies?.length ? rates.currencies : PLATFORM_CURRENCIES;

  const display = useCallback(
    (value: number | string | null | undefined, from: string | null | undefined = DEFAULT_DISPLAY_CURRENCY) =>
      toDisplayAmount(value, from, currency, rates),
    [currency, rates]
  );

  const sum = useCallback(
    (entries: Array<{ amount: number | string | null | undefined; currency?: string | null }>) =>
      sumInDisplayCurrency(entries, currency, rates),
    [currency, rates]
  );

  return { currency, setCurrency, currencies, rates: rates ?? null, display, sum };
}
