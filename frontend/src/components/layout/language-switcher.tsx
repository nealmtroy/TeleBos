"use client";

import { useI18nStore, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/** Simple 20×15 SVG flags — no emoji, no external deps */

function FlagUK({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 45" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="45" fill="#012169" />
      <path d="M0 0l60 45M60 0L0 45" stroke="#fff" strokeWidth="9" />
      <path d="M0 0l60 45M60 0L0 45" stroke="#C8102E" strokeWidth="3.6" />
      <rect y="18" width="60" height="9" fill="#fff" />
      <rect x="25.5" width="9" height="45" fill="#fff" />
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("common.language")}
          className={cn(
            "public-focus flex min-h-10 items-center gap-1.5 rounded-[6px] border px-2 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer",
            variant === "public"
              ? "border-transparent text-[#a1a4a5] hover:border-[#292d30] hover:text-white"
              : "border-transparent text-gray-600 dark:text-slate-400 hover:border-gray-200 dark:hover:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200"
          )}
          title={t("common.language")}
        >
          {locale === "id" ? (
            <FlagID className="h-3.5 w-auto rounded-[1.5px] shadow-xs" />
          ) : (
            <FlagUK className="h-3.5 w-auto rounded-[1.5px] shadow-xs" />
          )}
          <span>{locale === "id" ? "ID" : "EN"}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className={cn(
          "w-36 p-1",
          variant === "public"
            ? "border-[#292d30] bg-black text-white"
            : ""
        )}
      >
        <DropdownMenuItem
          onClick={() => setLocale("en")}
          className={cn(
            "flex items-center gap-2 cursor-pointer",
            locale === "en"
              ? "bg-primary-50 dark:bg-primary-950/40 font-semibold text-primary-600 dark:text-primary-400"
              : "text-gray-700 dark:text-slate-300"
          )}
        >
          <FlagUK className="h-4 w-auto rounded-[2px] shadow-xs" />
          <span>{t("common.english")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setLocale("id")}
          className={cn(
            "flex items-center gap-2 cursor-pointer",
            locale === "id"
              ? "bg-primary-50 dark:bg-primary-950/40 font-semibold text-primary-600 dark:text-primary-400"
              : "text-gray-700 dark:text-slate-300"
          )}
        >
          <FlagID className="h-4 w-auto rounded-[2px] shadow-xs" />
          <span>{t("common.indonesian")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
