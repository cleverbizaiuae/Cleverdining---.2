// src/lib/axios.ts
import axios, { type AxiosRequestConfig } from "axios";
import { captureApiFailure } from "../monitoring/sentry";

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");
const isLocalBrowser =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

// Keep deployed dashboard API calls pointed at the backend service. The
// dashboard has mixed root and /api backend routes, so routing everything
// through the Netlify /api proxy changes endpoint paths like /login/.
const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE_URL = normalizeBaseUrl(
  isLocalBrowser
    ? "http://127.0.0.1:8000"
    : envApiUrl && envApiUrl !== "/api"
    ? envApiUrl
    : "https://cleverdining-2.onrender.com"
);

const REFRESH_TOKEN_ENDPOINT = `${API_BASE_URL}/token/refresh/`;

type RetryableRequest = AxiosRequestConfig & {
  _retry?: boolean;
};

let refreshRequest: Promise<string> | null = null;
let authRedirectStarted = false;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken") || localStorage.getItem("superAdminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const redirectToLogin = () => {
  if (authRedirectStarted) return;
  authRedirectStarted = true;

  const isSuperAdmin = Boolean(localStorage.getItem("superAdminAuth"));
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userInfo");

  if (isSuperAdmin) {
    localStorage.removeItem("superAdminAuth");
    localStorage.removeItem("superAdminToken");
    window.location.assign("/superadmin/login");
    return;
  }

  window.location.assign("/login");
};

const refreshAccessToken = (refreshToken: string) => {
  if (!refreshRequest) {
    refreshRequest = axios
      .post(REFRESH_TOKEN_ENDPOINT, { refresh: refreshToken })
      .then((response) => {
        const access = response.data?.access;
        if (!access) throw new Error("Token refresh response did not include an access token");

        localStorage.setItem("accessToken", access);
        // SimpleJWT rotates and blacklists refresh tokens in production.
        // Persist the replacement or the next refresh will log the user out.
        if (response.data?.refresh) {
          localStorage.setItem("refreshToken", response.data.refresh);
        }
        return access as string;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
};

const getRequestAccessToken = (request: RetryableRequest) => {
  const headers = request.headers as
    | (Record<string, unknown> & { get?: (name: string) => unknown })
    | undefined;
  const authorization = headers?.get?.("Authorization") ?? headers?.Authorization;
  const value = String(authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : null;
};

const validateCurrentAccessToken = async (accessToken: string) => {
  try {
    await axios.get(`${API_BASE_URL}/profile/`, {
      timeout: 8000,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return "valid" as const;
  } catch (error: unknown) {
    // Only an explicit authentication rejection proves that the session is
    // invalid. Network, CORS, and server failures must not log mobile users out.
    return axios.isAxiosError(error) && error.response?.status === 401
      ? "invalid" as const
      : "unknown" as const;
  }
};

// Response interceptor to handle token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequest | undefined;

    captureApiFailure(error, {
      feature: "api",
      endpoint: originalRequest?.url,
      method: originalRequest?.method,
      status: error?.response?.status,
    });

    if (error.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const isLoginRequest = /\/(?:login|token\/refresh)\/?$/.test(originalRequest.url || "");
    if (isLoginRequest) {
      return Promise.reject(error);
    }

    // A retried request can still be unauthorized because that endpoint is not
    // permitted for this role. That must not destroy an otherwise valid session.
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    const isSuperAdmin = Boolean(localStorage.getItem("superAdminAuth"));
    const refreshToken = localStorage.getItem("refreshToken");

    if (isSuperAdmin || !refreshToken) {
      redirectToLogin();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const access = await refreshAccessToken(refreshToken);
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${access}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      const requestAccessToken = getRequestAccessToken(originalRequest);
      const currentAccessToken = localStorage.getItem("accessToken");

      // A newer login or refresh may have completed while this request was in
      // flight. Retry with that token instead of clearing the new session.
      if (currentAccessToken && currentAccessToken !== requestAccessToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${currentAccessToken}`;
        return axiosInstance(originalRequest);
      }

      if (currentAccessToken) {
        const accessStatus = await validateCurrentAccessToken(currentAccessToken);
        if (accessStatus !== "invalid") {
          return Promise.reject(refreshError);
        }
      }

      redirectToLogin();
      return Promise.reject(refreshError);
    }
  }
);

export default axiosInstance;
