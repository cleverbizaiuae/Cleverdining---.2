import { API_BASE_URL } from "./axios";

export const PLACEHOLDER_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f1f5f9'/%3E%3Cpath d='M54 134l30-38 22 25 16-20 29 33H54z' fill='%23cbd5e1'/%3E%3Ccircle cx='75' cy='70' r='14' fill='%23cbd5e1'/%3E%3C/svg%3E";

export function resolveMediaUrl(url?: string | null, fallback = PLACEHOLDER_IMAGE_URL): string {
  const value = String(url || "").trim();
  if (!value) return fallback;
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  if (value.startsWith("http://")) return value.replace("http://", "https://");
  if (value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${API_BASE_URL}${value.replace(/^\/+/, "")}`;
  return fallback;
}
