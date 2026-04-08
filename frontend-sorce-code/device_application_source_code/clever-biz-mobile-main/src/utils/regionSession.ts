import { getRegionConfig } from "../config/regionConfig";

type RestaurantSessionInfo = {
  region?: string;
  currency?: string;
};

const readRestaurantInfo = (): RestaurantSessionInfo | null => {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const restaurant = parsed?.user?.restaurants?.[0];
    return restaurant ?? null;
  } catch {
    return null;
  }
};

export const getSessionRegion = (): string => {
  const restaurant = readRestaurantInfo();
  return String(restaurant?.region || "UAE").toUpperCase() === "UK" ? "UK" : "UAE";
};

export const getSessionCurrencyCode = (): string => {
  const restaurant = readRestaurantInfo();
  const explicit = String(restaurant?.currency || "").trim().toUpperCase();
  if (explicit) return explicit;
  return getRegionConfig(getSessionRegion()).currency;
};
