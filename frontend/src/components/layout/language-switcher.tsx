"use client";

import { useI18nStore, t } from "@/lib/i18n";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/** Simple 20×15 SVG flags — no emoji, no external deps */

function FlagUK({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 45" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Blue base */}
      <rect width="60" height="45" fill="#012169" />
      {/* White diagonal cross */}
      <path d="M0 0l60 45M60 0L0 45" stroke="#fff" strokeWidth="9" />
      {/* Red diagonal cross */}
      <path d="M0 0l60 45M60 0L0 45" stroke="#C8102E" strokeWidth="3.6" />
      {/* White horizontal cross */}
      <rect y="18" width="60" height="9" fill="#fff" />
      <rect x="25.5" width="9" height="45" fill="#fff" />
      {/* Red horizontal cross */}
      <rect y="20.7" width="60" height="3.6" fill="#C8102E" />
      <rect x="28.2" width="3.6" height="45" fill="#C8102E" />
    </svg>
  );
}

function FlagID({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 45" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="22.5" fill="#CE1126" />
      <rect y="22.5" width="60" height="22.5" fill="#fff" />
    </svg>
  );
}

export function LanguageSwitcher({ variant = "default" }: { variant?: "default" | "public" }) {
  const { locale, setLocale } = useI18nStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={t("common.language")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "public-focus flex min-h-10 items-center gap-1.5 rounded-[6px] border px-2 py-1.5 text-xs font-medium transition-colors duration-150",
          variant === "public"
            ? "border-transparent text-[#a1a4a5] hover:border-[#292d30] hover:text-white"
            : "border-transparent text-gray-400 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-600"
        )}
        title={t("common.language")}
      >
        {locale === "id" ? (
          <FlagID className="h-3.5 w-auto rounded-[1.5px] shadow-sm" />
        ) : (
          <FlagUK className="h-3.5 w-auto rounded-[1.5px] shadow-sm" />
        )}
        <span>{locale === "id" ? "ID" : "EN"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className={cn(
            "absolute right-0 top-full z-20 mt-1 w-36 rounded-[6px] border py-1",
            variant === "public" ? "border-[#292d30] bg-black" : "border-gray-200 bg-white shadow-lg"
          )}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === "en"}
              onClick={() => { setLocale("en"); setOpen(false); }}
              className={cn(
                "public-focus flex min-h-10 w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm transition-colors duration-150",
                variant === "public"
                  ? locale === "en" ? "font-semibold text-[#2AABEE]" : "text-[#f0f0f0] hover:bg-[#0b0e14]"
                  : locale === "en" ? "bg-primary-50 font-semibold text-primary-600" : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <FlagUK className="h-4 w-auto rounded-[2px] shadow-sm" />
              {t("common.english")}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === "id"}
              onClick={() => { setLocale("id"); setOpen(false); }}
              className={cn(
                "public-focus flex min-h-10 w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm transition-colors duration-150",
                variant === "public"
                  ? locale === "id" ? "font-semibold text-[#2AABEE]" : "text-[#f0f0f0] hover:bg-[#0b0e14]"
                  : locale === "id" ? "bg-primary-50 font-semibold text-primary-600" : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <FlagID className="h-4 w-auto rounded-[2px] shadow-sm" />
              {t("common.indonesian")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
