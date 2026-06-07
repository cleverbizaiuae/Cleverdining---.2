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

const buildCacheKey = (url: string, config?: AxiosRequestConfig, explicitKey?: string) => {
  if (explicitKey) return explicitKey;
  return `GET:${url}:${stableStringify(config?.params || {})}`;
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
