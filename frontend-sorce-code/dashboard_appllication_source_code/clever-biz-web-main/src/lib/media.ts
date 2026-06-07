import axiosInstance from "./axios";

const PLACEHOLDER_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' fill='%23f1f5f9'/%3E%3Cpath d='M26 64l14-18 10 12 7-9 13 15H26z' fill='%23cbd5e1'/%3E%3Ccircle cx='35' cy='34' r='7' fill='%23cbd5e1'/%3E%3C/svg%3E";

export const resolveMediaUrl = (url?: string | null, fallback = PLACEHOLDER_IMAGE_URL) => {
  if (!url) return fallback;
  const trimmed = String(url).trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;

  const normalized = trimmed.replace(/^http:\/\//i, "https://");
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const baseUrl = String(axiosInstance.defaults.baseURL || "").replace(/\/+$/, "");
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${baseUrl}${path}`;
};

export { PLACEHOLDER_IMAGE_URL };
