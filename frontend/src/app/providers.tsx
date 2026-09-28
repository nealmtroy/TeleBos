"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useI18nStore } from "@/lib/i18n";
import { useThemeStore } from "@/store/theme-store";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

/** Sync the <html lang> attribute with the current locale. */
function LanguageSync() {
  const locale = useI18nStore((s) => s.locale);
  const preference = useI18nStore((s) => s.preference);
  const setPreference = useI18nStore((s) => s.setPreference);

  // Hydrate: after first client paint, read preference from localStorage.
  // Defaults to "system" (detect from browser/OS).
  useEffect(() => {
    try {
      const stored = localStorage.getItem("telebo_locale");
      if (stored === "en" || stored === "id" || stored === "system") {
        setPreference(stored);
      } else {
        setPreference("system");
      }
    } catch {
      setPreference("system");
    }
  }, [setPreference]);

  // Listen to OS / browser language changes when preference is "system"
  useEffect(() => {
    if (preference !== "system") return;
    const handleLangChange = () => {
      setPreference("system");
    };
    window.addEventListener("languagechange", handleLangChange);
    return () => window.removeEventListener("languagechange", handleLangChange);
  }, [preference, setPreference]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}

/** Sync the <html> dark class and colorScheme with current theme preference. */
function ThemeSync() {
  const hydrate = useThemeStore((s) => s.hydrate);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Listen to OS theme changes if theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setTheme("system");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme, setTheme]);

  return null;
}

/**
 * Strip layout-property transitions (e.g. transition: height injected by third-party packages)
 * to eliminate layout thrashing warnings and enforce GPU-accelerated motion (transform/opacity).
 */
function LayoutAnimationSanitizer() {
  useEffect(() => {
    const sanitize = () => {
      // 1. Sanitize text in inline <style> elements (e.g. Sonner __insertCSS)
      document.querySelectorAll("style").forEach((styleEl) => {
        if (styleEl.textContent && styleEl.textContent.includes("height")) {
          styleEl.textContent = styleEl.textContent
            .replace(/height\s+[\d.]+s,?\s*/g, "")
            .replace(/,\s*height\s+[\d.]+s/g, "");
        }
      });

      // 2. Sanitize active CSSStyleRules across accessible stylesheets
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (let i = 0; i < sheet.cssRules.length; i++) {
              const rule = sheet.cssRules[i];
              if (rule instanceof CSSStyleRule) {
                if (rule.style.transition && rule.style.transition.includes("height")) {
                  rule.style.transition = rule.style.transition
                    .replace(/height\s+[\d.]+s,?\s*/g, "")
                    .replace(/,\s*height\s+[\d.]+s/g, "");
                }
              }
            }
          } catch {
            // Skip cross-origin sheets if restricted
          }
        }
      } catch {}
    };

    sanitize();

    const observer = new MutationObserver((mutations) => {
      let shouldSanitize = false;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeName === "STYLE") {
            shouldSanitize = true;
            break;
          }
        }
        if (shouldSanitize) break;
      }
      if (shouldSanitize) {
        sanitize();
      }
    });

    observer.observe(document.head, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <LanguageSync />
        <ThemeSync />
        <LayoutAnimationSanitizer />
        {children}
        <Toaster richColors position="top-right" theme={resolvedTheme} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

