// src/lib/axios.ts
import axios from "axios";
const TOKENS = {
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
  USER_INFO: "userInfo",
};

// Use env when provided, but ignore "/api" shorthand in production
// because Netlify has no API proxy configured for this app.
const envApiUrl = import.meta.env.VITE_API_URL?.trim();
const rawApiBase =
  envApiUrl && envApiUrl !== "/api"
    ? envApiUrl
    : "https://cleverdining-2.onrender.com";
export const API_BASE_URL = `${rawApiBase.replace(/\/+$/, "")}/`;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKENS.ACCESS_TOKEN);
  const guestSessionToken = localStorage.getItem("guest_session_token");

  if (token && token !== "guest_token") {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (guestSessionToken) {
    config.headers["X-Guest-Session-Token"] = guestSessionToken;
  }

  return config;
});

// Response interceptor to handle token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem(TOKENS.REFRESH_TOKEN);
        if (refreshToken) {
          const response = await axios.post(
            `${API_BASE_URL}token/refresh/`,
            {
              refresh: refreshToken,
            }
          );

          const { access } = response.data;
          localStorage.setItem("accessToken", access);

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${access}`;
          return axiosInstance(originalRequest);
        } else {
          // No refresh token available (e.g., Guest Session)
          throw new Error("No refresh token available");
        }
      } catch {
        // Refresh token failed or ignored (or none existed)
        // UNCONDITIONALLY clear storage to prevent infinite loops.
        // If the token is invalid (401), the session is dead.
        // Clearing storage forces LayoutDashboard to re-bootstrap a new valid session.
        localStorage.removeItem(TOKENS.ACCESS_TOKEN);
        localStorage.removeItem(TOKENS.REFRESH_TOKEN);
        localStorage.removeItem(TOKENS.USER_INFO);
        localStorage.removeItem("guest_session_token");

        window.location.href = "/";
      }
    } else if (error.response?.status === 401) {
      // Direct 401 fallback
      localStorage.removeItem(TOKENS.ACCESS_TOKEN);
      localStorage.removeItem(TOKENS.REFRESH_TOKEN);
      localStorage.removeItem(TOKENS.USER_INFO);
      localStorage.removeItem("guest_session_token");
      window.location.href = "/";
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
