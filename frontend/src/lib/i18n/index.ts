import { create } from "zustand";
import en from "./en";
import id from "./id";
import type { Dict } from "./types";

type Locale = "en" | "id";

const dictionaries: Record<Locale, Dict> = { en, id };

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

function getInitialLocale(): Locale {
  // Always return "en" during SSR so hydration can match.
  // The actual persisted locale is read from localStorage in a
  // useEffect inside the Providers wrapper, which flips the store
  // after the first client paint — no hydration mismatch.
  return "en";
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: getInitialLocale(),
  setLocale: (locale) => {
    localStorage.setItem("telebo_locale", locale);
    set({ locale });
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
  return (path: string, params?: Record<string, string | number>) => {
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
  };
}
