import type { AxiosRequestConfig, AxiosResponse } from "axios";
import axiosInstance from "./axios";

type CacheEntry<T = any> = {
  expiresAt: number;
  response: AxiosResponse<T>;
};

type CachedGetOptions = {
  ttlMs?: number;
  force?: boolean;
  cacheKey?: string;
};

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<AxiosResponse>>();
let activeSessionScope = "";

const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const current = (value as Record<string, unknown>)[key];
        if (current !== undefined && current !== null && current !== "") {
          acc[key] = normalizeValue(current);
        }
        return acc;
      }, {});
  }
  return value;
};

const stableStringify = (value: unknown) => JSON.stringify(normalizeValue(value));

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const readStoredUser = (): Record<string, unknown> => {
  if (typeof window === "undefined") return {};

  try {
    const rawUser = window.localStorage.getItem("userInfo");
    const parsedUser = rawUser ? JSON.parse(rawUser) : {};
    return isRecord(parsedUser) ? parsedUser : {};
  } catch {
    return {};
  }
};

const getSessionScope = () => {
  if (typeof window === "undefined") return "server";

  const storedUser = readStoredUser();
  const user = isRecord(storedUser.user)
    ? storedUser.user
    : storedUser;
  const restaurantCandidate = Array.isArray(user.restaurants)
    ? user.restaurants[0]
    : Array.isArray(storedUser.restaurants)
      ? storedUser.restaurants[0]
      : undefined;
  const restaurant = isRecord(restaurantCandidate) ? restaurantCandidate : undefined;
  const userId = user.id ?? storedUser.owner_id ?? "anonymous";
  const restaurantId = window.localStorage.getItem("restaurantId")
    ?? restaurant?.id
    ?? user.restaurants_id
    ?? storedUser.restaurants_id
    ?? "none";
  const role = user.role
    ?? storedUser.role
    ?? window.localStorage.getItem("role")
    ?? "anonymous";
  const accessToken = window.localStorage.getItem("accessToken") ?? "";
  const tokenMarker = accessToken ? accessToken.slice(-12) : "no-token";

  return `${role}:${userId}:${restaurantId}:${tokenMarker}`;
};

const getActiveSessionScope = () => {
  const nextScope = getSessionScope();

  if (activeSessionScope && activeSessionScope !== nextScope) {
    responseCache.clear();
    inFlightRequests.clear();
  }

  activeSessionScope = nextScope;
  return nextScope;
};

const buildCacheKey = (url: string, config?: AxiosRequestConfig, explicitKey?: string) => {
  const requestKey = explicitKey ?? `GET:${url}:${stableStringify(config?.params || {})}`;
  return `${getActiveSessionScope()}:${requestKey}`;
};

export const invalidateApiCache = (matcher?: string | ((key: string) => boolean)) => {
  if (!matcher) {
    responseCache.clear();
    inFlightRequests.clear();
    return;
  }

  const shouldDelete = typeof matcher === "function"
    ? matcher
    : (key: string) => key.includes(matcher);

  for (const key of responseCache.keys()) {
    if (shouldDelete(key)) responseCache.delete(key);
  }

  for (const key of inFlightRequests.keys()) {
    if (shouldDelete(key)) inFlightRequests.delete(key);
  }
};

export async function cachedGet<T = any>(
  url: string,
  config: AxiosRequestConfig = {},
  options: CachedGetOptions = {},
): Promise<AxiosResponse<T>> {
  const ttlMs = Math.max(0, options.ttlMs ?? 15_000);
  const key = buildCacheKey(url, config, options.cacheKey);
  const now = Date.now();

  if (!options.force && ttlMs > 0) {
    const cached = responseCache.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) {
      return cached.response;
    }
  }

  const existing = inFlightRequests.get(key) as Promise<AxiosResponse<T>> | undefined;
  if (!options.force && existing) return existing;

  const request = axiosInstance.get<T>(url, config)
    .then((response) => {
      if (ttlMs > 0) {
        responseCache.set(key, { response, expiresAt: Date.now() + ttlMs });
      }
      return response;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request as Promise<AxiosResponse>);
  return request;
}
