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

// ── Refresh lock: prevents concurrent 401s from racing each other ──
// When the access token expires and multiple API calls fire simultaneously,
// they all hit 401.  Without this lock each one calls /auth/refresh independently.
// The first succeeds (blacklisting the old token), and the rest fail because the
// token is already consumed — forcing a spurious logout.
let refreshPromise: Promise<{
  access_token: string;
  refresh_token: string;
}> | null = null;

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

    // Only attempt refresh on 401, and only once per request
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    try {
      // If a refresh is already in-flight, piggyback on it —
      // all queued requests share the SAME call so the old token
      // is consumed exactly once.
      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
          .then((res) => res.data);
      }

      const data = await refreshPromise;
      refreshPromise = null;

      setTokens(data.access_token, data.refresh_token);
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      }
      return api(originalRequest);
    } catch {
      refreshPromise = null;
      clearTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      return Promise.reject(error);
    }
  }
);

export default api;
