"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useI18nStore } from "@/lib/i18n";
import { ToastProvider } from "@/components/ui/toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

/** Sync the <html lang> attribute with the current locale. */
function LanguageSync() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  // Hydrate: after first client paint, read the persisted locale from
  // localStorage to restore the user's preference.  The store always
  // starts as "en" during SSR to avoid hydration mismatches.
  useEffect(() => {
    const stored = localStorage.getItem("telebo_locale");
    if (stored === "en" || stored === "id") {
      if (stored !== locale) setLocale(stored);
    } else {
      // Fall back to browser language
      const browserLang = navigator.language?.slice(0, 2);
      const detected = browserLang === "id" ? "id" : "en";
      if (detected !== locale) setLocale(detected);
    }
    // Intentionally runs only once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    fetchMe();
    setMounted(true);
  }, [fetchMe]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <LanguageSync />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
