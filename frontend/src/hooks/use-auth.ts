"use client";

// Auth hooks re-exported from the Zustand store for convenience.
// The store is the single source of truth; these hooks wrap it for React Query integration.

export { useAuthStore } from "@/store/auth-store";
