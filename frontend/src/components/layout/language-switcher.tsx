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

export function LanguageSwitcher() {
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
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
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
          <div className="absolute right-0 top-full mt-1 z-20 w-36 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
            <button
              onClick={() => { setLocale("en"); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm w-full text-left transition",
                locale === "en" ? "text-primary-600 font-semibold bg-primary-50" : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <FlagUK className="h-4 w-auto rounded-[2px] shadow-sm" />
              {t("common.english")}
            </button>
            <button
              onClick={() => { setLocale("id"); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm w-full text-left transition",
                locale === "id" ? "text-primary-600 font-semibold bg-primary-50" : "text-gray-700 hover:bg-gray-50"
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
