import { create } from "zustand";
import api, { setTokens, clearTokens } from "@/lib/api";

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
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    if (!token) {
      set({ isLoading: false });
      return;
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
