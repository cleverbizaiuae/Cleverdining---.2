// src/lib/axios.ts
import axios from "axios";

<<<<<<< HEAD
=======
const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

// FIX: Use direct backend URL to bypass Netlify proxy issues
// If VITE_API_URL is "/api" or not set, use direct backend URL
// This ensures requests go directly to Render, avoiding Netlify proxy 500 errors
const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE_URL = normalizeBaseUrl(
  envApiUrl && envApiUrl !== "/api" 
    ? envApiUrl 
    : "https://cleverdining-2.onrender.com"
);

const REFRESH_TOKEN_ENDPOINT = `${API_BASE_URL}/token/refresh/`;

>>>>>>> b6850c7 (FIX: Use direct backend URL to bypass Netlify proxy 500 errors)
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

<<<<<<< HEAD
const REFRESH_TOKEN_ENDPOINT = `${axiosInstance.defaults.baseURL}/token/refresh/`;
=======
console.log("🔥 Axios baseURL at runtime:", axiosInstance.defaults.baseURL);
console.log("🔥 VITE_API_URL from env:", import.meta.env.VITE_API_URL);
console.log("🔥 API_BASE_URL calculated:", API_BASE_URL);
>>>>>>> b6850c7 (FIX: Use direct backend URL to bypass Netlify proxy 500 errors)

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
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
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
