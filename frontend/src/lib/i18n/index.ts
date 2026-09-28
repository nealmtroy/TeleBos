import { useCallback } from "react";
import { create } from "zustand";
import en from "./en";
import id from "./id";
import type { Dict } from "./types";

export type Locale = "en" | "id";
export type LanguagePreference = "system" | "en" | "id";

const dictionaries: Record<Locale, Dict> = { en, id };

export function getSystemLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const browserLang = (navigator.language || "").slice(0, 2).toLowerCase();
  return browserLang === "id" ? "id" : "en";
}

interface I18nState {
  locale: Locale;
  preference: LanguagePreference;
  setLocale: (locale: Locale) => void;
  setPreference: (preference: LanguagePreference) => void;
}

function getInitialLocale(): Locale {
  // Always return "en" during SSR so hydration can match.
  // The actual persisted preference is read from localStorage in LanguageSync
  // inside Providers, which updates the store after first client paint.
  return "en";
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: getInitialLocale(),
  preference: "system",
  setLocale: (locale) => {
    try {
      localStorage.setItem("telebo_locale", locale);
    } catch {}
    set({ locale, preference: locale });
  },
  setPreference: (preference) => {
    try {
      localStorage.setItem("telebo_locale", preference);
    } catch {}
    const resolvedLocale = preference === "system" ? getSystemLocale() : preference;
    set({ preference, locale: resolvedLocale });
  },
}));

/**
 * Translate a dot-separated key into the current locale's dictionary.
 *
 * Examples:
 *   t("nav.dashboard")            → "Dashboard"
 *   t("chats.deleteConfirm", { name: "My Group" })  → Delete "My Group"? ...
 */
export function t(path: string, params?: Record<string, string | number>): string {
  const locale = useI18nStore.getState().locale;
  const dict = dictionaries[locale] || en;

  const keys = path.split(".");
  let value: any = dict;
  for (const key of keys) {
    value = value?.[key];
  }

  if (typeof value !== "string") {
    // Fall back to English
    let fallback: any = en;
    for (const key of keys) {
      fallback = fallback?.[key];
    }
    value = typeof fallback === "string" ? fallback : path;
  }

  if (params) {
    return value.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
      const v = params[key];
      return v !== undefined ? String(v) : `{${key}}`;
    });
  }

  return value;
}

/** Convenience: return the current dictionary object for direct access. */
export function useDict(): Dict {
  const locale = useI18nStore((s) => s.locale);
  return dictionaries[locale] || en;
}

/**
 * Reactive translation hook — re-renders when locale changes.
 * Use in client components: const _ = useT();
 * Then: _("nav.dashboard") or _.("chats.deleteConfirm", { name: "..." })
 */
export function useT() {
  const locale = useI18nStore((s) => s.locale);
  return useCallback(
    (path: string, params?: Record<string, string | number>) => {
      const dict = dictionaries[locale] || en;
      const keys = path.split(".");
      let value: any = dict;
      for (const key of keys) {
        value = value?.[key];
      }
      if (typeof value !== "string") {
        let fallback: any = en;
        for (const key of keys) {
          fallback = fallback?.[key];
        }
        value = typeof fallback === "string" ? fallback : path;
      }
      if (params) {
        return value.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
          const v = params[key];
          return v !== undefined ? String(v) : `{${key}}`;
        });
      }
      return value;
    },
    [locale]
  );
}
