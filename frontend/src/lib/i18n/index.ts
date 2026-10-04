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
  // navigator.languages is the full preference list; navigator.language is only
  // the first entry, which reports English on an Indonesian phone when the app
  // language and the browser UI language differ. Scanning the list makes the
  // detection match what the visitor actually chose.
  const candidates =
    typeof navigator.languages?.length === "number" && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language || ""];
  for (const tag of candidates) {
    const lang = (tag || "").slice(0, 2).toLowerCase();
    // "in" is the deprecated ISO 639-1 code for Indonesian, still sent by some
    // Android browsers.
    if (lang === "id" || lang === "in") return "id";
  }
  return "en";
}

/**
 * Read the locale middleware negotiated from Accept-Language.
 *
 * Available only during server rendering; returns null on the client, where
 * getSystemLocale() and the stored preference are the source of truth.
 */
export function getRequestLocale(): Locale | null {
  if (typeof window === "undefined") {
    try {
      // Read by the Next.js headers() API in a server component; imported
      // lazily so this module stays importable from client components.
      const { headers } = require("next/headers") as typeof import("next/headers");
      const v = headers().get("x-telebos-locale");
      return v === "id" || v === "en" ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

interface I18nState {
  locale: Locale;
  preference: LanguagePreference;
  setLocale: (locale: Locale) => void;
  setPreference: (preference: LanguagePreference) => void;
}

function getInitialLocale(): Locale {
  // This runs at module-evaluation time, which is exactly when hydration
  // needs the answer — so both sides must agree, or React throws away the
  // server HTML and re-renders (PYTHON-FASTAPI-1K).
  //
  // Server: middleware negotiated Accept-Language / the telebo_locale cookie
  // into the x-telebos-locale header, and layout.tsx serialised that value
  // into the document before this bundle executes. Reusing it here makes the
  // first client render byte-identical to the server's.
  if (typeof window !== "undefined") {
    const fromServer = (window as any).__TELEBOS_LOCALE__;
    if (fromServer === "id" || fromServer === "en") return fromServer;
  }
  // No server value (static render, or the script did not run): English is
  // the documented default and matches what getRequestLocale() falls back to.
  return getRequestLocale() ?? "en";
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
