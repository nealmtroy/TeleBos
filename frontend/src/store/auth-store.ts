import { create } from "zustand";
import { authClient } from "@/lib/auth-client";
import api, { setSessionToken } from "@/lib/api";
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

/**
 * Fetch the user profile from the FastAPI backend via the shared axios
 * client (which already has the x-better-auth-token header set).
 * Falls back to a minimal user derived from the Better Auth session when
 * the backend is unavailable.
 */
async function hydrateUserFromBackend(
  betterAuthUser: { id: string; email: string; name?: string | null },
): Promise<User> {
  try {
    const { data } = await api.get<User>("/auth/me");
    if (data) return data;
  } catch {
    // Backend unavailable — fall through to Better Auth fallback.
  }
  return {
    id: betterAuthUser.id,
    email: betterAuthUser.email,
    full_name: betterAuthUser.name || null,
    role: "basic",
    is_active: true,
    balance: 0,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      const err = new Error(error.message || "Login failed");
      (err as any).code = error.code;
      throw err;
    }

    // Fetch session once — sync token for axios + socket interceptors
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      syncSessionToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
      throw new Error("Login succeeded but no session was created");
    }

    if (session.session?.token) {
      syncSessionToken(session.session.token);
    }

    const user = await hydrateUserFromBackend(session.user);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  register: async (email: string, password: string, name?: string) => {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: name || "",
    });
    if (error) throw new Error(error.message || "Registration failed");

    // Better Auth `autoSignIn: true` means we already have a session after
    // registration — hydrate it so the caller can go straight to /dashboard.
    try {
      const { data: session } = await authClient.getSession();
      if (session?.user) {
        if (session.session?.token) {
          syncSessionToken(session.session.token);
        }
        const user = await hydrateUserFromBackend(session.user);
        set({ user, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch {
      // Fall through — caller will redirect to /login
    }

    set({ isLoading: false });
  },

  logout: async () => {
    // 1. Delete the session row from the PostgreSQL session table via the
    //    FastAPI backend.  This must happen BEFORE signOut() because the
    //    backend needs the token (still injected by the axios interceptor).
    //    We fire-and-forget — if it fails, signOut still runs.
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Backend session deletion failed:", err);
    }

    // 2. Clear Better Auth client-side cookies and state.
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Better Auth sign-out failed:", err);
    }

    // 3. Wipe all in-memory session state regardless of above outcomes.
    syncSessionToken(null);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchMe: async () => {
    try {
      const { data: session } = await authClient.getSession();
      if (!session?.user) {
        syncSessionToken(null);
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (session.session?.token) {
        syncSessionToken(session.session.token);
      }

      const user = await hydrateUserFromBackend(session.user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      syncSessionToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
