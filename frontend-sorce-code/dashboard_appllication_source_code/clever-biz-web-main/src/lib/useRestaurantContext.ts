import { useMemo } from "react";
import {
  getActiveRestaurantCurrency,
  getActiveRestaurantLocale,
  getActiveRestaurantRegion,
  getActiveRestaurantTimezone,
} from "@/lib/utils";

type RestaurantContext = {
  fmt: (value: string | number | null | undefined) => string;
  fmt0: (value: string | number | null | undefined) => string;
  currency: string;
  currencyLabel: string;
  country: "UAE" | "UK";
  flag: string;
  locale: string;
  region: "UAE" | "UK";
  restaurantId: string | null;
  timezone: string;
};

const parseAmount = (value: string | number | null | undefined) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const getRestaurantId = () => {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return String(
      parsed?.restaurant_id ||
        parsed?.restaurantId ||
        parsed?.restaurants?.[0]?.id ||
        parsed?.user?.restaurant_id ||
        parsed?.user?.restaurantId ||
        parsed?.user?.restaurants?.[0]?.id ||
        ""
    ) || null;
  } catch {
    return null;
  }
};

export function useRestaurantContext(): RestaurantContext {
  return useMemo(() => {
    const region = getActiveRestaurantRegion();
    const currency = getActiveRestaurantCurrency();
    const locale = getActiveRestaurantLocale();
    const timezone = getActiveRestaurantTimezone();
    const flag = region === "UK" ? "\uD83C\uDDEC\uD83C\uDDE7" : "\uD83C\uDDE6\uD83C\uDDEA";

    const format = (value: string | number | null | undefined, fractionDigits: number) => {
      return `${currency} ${parseAmount(value).toLocaleString(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      })}`;
    };

    return {
      fmt: (value) => format(value, 2),
      fmt0: (value) => format(value, 0),
      currency,
      currencyLabel: currency,
      country: region,
      flag,
      locale,
      region,
      restaurantId: getRestaurantId(),
      timezone,
    };
  }, []);
}
