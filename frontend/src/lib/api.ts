import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // Send cookies (refresh_token) with requests
});

// ── Token management (access token in-memory only; refresh token in httpOnly cookie) ──

let accessToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

export function setTokens(access: string, _refresh: string) {
  // Store access token in memory + localStorage (short-lived fallback)
  accessToken = access;
  localStorage.setItem("access_token", access);
  // Refresh token is NOT stored in JS-accessible storage — it's in an httpOnly cookie
}

export function getAccessToken() {
  if (!accessToken && typeof window !== "undefined") {
    accessToken = localStorage.getItem("access_token");
  }
  return accessToken;
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem("access_token");
  // Do NOT remove refresh_token — it's an httpOnly cookie, cleared server-side on logout
}


// ── Interceptor ─────────────────────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        // Refresh token is sent automatically via httpOnly cookie (withCredentials: true)
        const { data } = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        setTokens(data.access_token, data.refresh_token);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return api(originalRequest);
      } catch {
        clearTokens();
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
