import { create } from "zustand";
import { authClient } from "@/lib/auth-client";
import { setSessionToken } from "@/lib/api";
import { setSocketSessionToken } from "@/lib/socket";

export interface User {
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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

/**
 * Sync the Better Auth session token into the api.ts axios interceptor
 * and the socket.ts WebSocket client.  Both modules need the token but
 * cannot read it from httpOnly cookies directly.
 */
function syncSessionToken(token: string | null) {
  setSessionToken(token);
  setSocketSessionToken(token);
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });
    if (error) throw new Error(error.message || "Login failed");

    // Sync session token for axios and socket interceptors
    try {
      const { data: session } = await authClient.getSession();
      if (session?.session?.token) {
        syncSessionToken(session.session.token);
      }
    } catch {
      // Best-effort — will retry on fetchMe
    }

    // Fetch user profile from backend
    try {
      const { data: session } = await authClient.getSession();
      if (session?.user) {
        const meResponse = await fetch("/api/v1/auth/me", {
          headers: {
            "x-better-auth-token": session.session.token,
          },
        });
        if (meResponse.ok) {
          const me = await meResponse.json();
          set({ user: me, isAuthenticated: true, isLoading: false });
          return;
        }
      }
    } catch {
      // Fallback below
    }

    set({
      isAuthenticated: true,
      isLoading: false,
    });
  },

  register: async (email: string, password: string, name?: string) => {
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name: name || "",
    });
    if (error) throw new Error(error.message || "Registration failed");
    set({ isLoading: false });
  },

  logout: async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      syncSessionToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  fetchMe: async () => {
    try {
      const { data: session } = await authClient.getSession();
      if (!session) {
        syncSessionToken(null);
        set({ isLoading: false });
        return;
      }

      // Sync the token into api.ts and socket.ts
      if (session.session?.token) {
        syncSessionToken(session.session.token);
      }

      // Fetch user details from FastAPI backend
      try {
        const meResponse = await fetch("/api/v1/auth/me", {
          headers: {
            "x-better-auth-token": session.session.token,
          },
        });
        if (meResponse.ok) {
          const me = await meResponse.json();
          set({ user: me, isAuthenticated: true, isLoading: false });
          return;
        }
      } catch {
        // Backend not available, still authenticated with Better Auth
      }

      // Fallback: create basic user from Better Auth session
      const betterAuthUser = session.user;
      set({
        user: {
          id: betterAuthUser.id,
          email: betterAuthUser.email,
          full_name: betterAuthUser.name || null,
          role: "basic",
          is_active: true,
          balance: 0,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      syncSessionToken(null);
      set({ isLoading: false });
    }
  },
}));
