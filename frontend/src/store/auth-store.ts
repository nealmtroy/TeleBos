import { create } from "zustand";
import api, { setTokens, clearTokens, getAccessToken } from "@/lib/api";
import axios from "axios";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  balance: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string, rememberMe?: boolean) => {
    const { data } = await api.post("/auth/login", { email, password, remember_me: rememberMe });
    setTokens(data.access_token, data.refresh_token);
    const me = await api.get("/auth/me");
    set({ user: me.data, isAuthenticated: true, isLoading: false });
  },

  register: async (email: string, password: string, fullName?: string) => {
    const { data } = await api.post("/auth/register", {
      email,
      password,
      full_name: fullName,
    });
    // Already authenticated after register? No — user must login.
    set({ isLoading: false });
  },

  logout: async () => {
    try {
      // Refresh token is sent automatically via httpOnly cookie (withCredentials: true)
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout API failed:", err);
    } finally {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },


  fetchMe: async () => {
    // If no in-memory access token, try refreshing from the httpOnly cookie first.
    // This handles page reloads — the refresh cookie persists but the in-memory
    // access token is lost on every page navigation.
    if (!getAccessToken()) {
      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || "/api/v1"}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        setTokens(data.access_token, data.refresh_token);
      } catch {
        // No valid refresh cookie either — user is genuinely unauthenticated.
        clearTokens();
        set({ isLoading: false });
        return;
      }
    }
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ isLoading: false });
    }
  },
}));
