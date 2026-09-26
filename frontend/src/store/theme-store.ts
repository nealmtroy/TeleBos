import { create } from "zustand";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "telebos_theme";

interface ThemeState {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  isHydrated: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

function applyThemeToDocument(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.style.colorScheme = resolved;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  // Default to "dark" for SSR to align with TeleBos dark-first design
  theme: "dark",
  resolvedTheme: "dark",
  isHydrated: false,

  setTheme: (theme: Theme) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Ignore storage access errors
      }
    }
    const resolved = resolveTheme(theme);
    applyThemeToDocument(resolved);
    set({ theme, resolvedTheme: resolved });
  },

  toggleTheme: () => {
    const currentResolved = get().resolvedTheme;
    const nextTheme: Theme = currentResolved === "dark" ? "light" : "dark";
    get().setTheme(nextTheme);
  },

  hydrate: () => {
    if (typeof window === "undefined") return;
    let savedTheme: Theme = "dark";
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        savedTheme = stored;
      }
    } catch {
      // Ignore storage access errors
    }

    const resolved = resolveTheme(savedTheme);
    applyThemeToDocument(resolved);
    set({
      theme: savedTheme,
      resolvedTheme: resolved,
      isHydrated: true,
    });
  },
}));
