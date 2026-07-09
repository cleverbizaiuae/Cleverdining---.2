// src/lib/axios.ts
import axios from "axios";
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

// Response interceptor to handle token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    captureApiFailure(error, {
      feature: "api",
      endpoint: originalRequest?.url,
      method: originalRequest?.method,
      status: error?.response?.status,
    });

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (refreshToken) {
          const response = await axios.post(REFRESH_TOKEN_ENDPOINT, {
            refresh: refreshToken,
          });

          const { access } = response.data;
          localStorage.setItem("accessToken", access);

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${access}`;
          return axiosInstance(originalRequest);
        }
      } catch (refreshError) {
        // Refresh token failed, redirect to login
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("userInfo");

        // Handle Super Admin Logout
        if (localStorage.getItem("superAdminAuth")) {
          localStorage.removeItem("superAdminAuth");
          localStorage.removeItem("superAdminToken");
          window.location.href = "/superadmin/login";
        } else {
          window.location.href = "/login";
        }
      }
    } else if (error.response?.status === 401) {
      // Direct 401 without refresh possibility (e.g. invalid super admin token)
      if (localStorage.getItem("superAdminAuth")) {
        localStorage.removeItem("superAdminAuth");
        localStorage.removeItem("superAdminToken");
        window.location.href = "/superadmin/login";
      } else {
        // Only clear/redirect if we were logged in or trying to be
        localStorage.removeItem("accessToken");
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
