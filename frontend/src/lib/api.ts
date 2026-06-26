import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// ── Session token: set by auth-store.ts after getSession() ────────────────
// We can't read httpOnly cookies from JS, so the auth store writes it here
// after calling authClient.getSession().
let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

// ── Interceptor: Inject Better Auth session token ───────────────────────────

api.interceptors.request.use((config) => {
  if (sessionToken && config.headers) {
    config.headers["x-better-auth-token"] = sessionToken;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Session expired or invalid — redirect to login
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
