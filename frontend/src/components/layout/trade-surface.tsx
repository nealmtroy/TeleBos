"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * High-End Visual Design & Impeccable Trade Surface Primitives.
 *
 * Implements the Double-Bezel (Doppelrand) hardware container pattern,
 * Button-in-Button interactive CTA architecture with kinetic spring hover physics,
 * precision tabular metrics, and accessible status chips with micro-indicators.
 */

export const EASE = "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90 bg-foreground/[0.04] border border-foreground/[0.06]",
        className
      )}
    >
      {children}
    </span>
  );
}

const TONES = {
  positive:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  negative:
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  caution:
    "bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20",
  neutral:
    "bg-muted/80 text-muted-foreground border-border/60",
  accent:
    "bg-primary/10 text-primary dark:text-primary-400 border-primary/20",
} as const;

const DOT_TONES = {
  positive: "bg-emerald-500",
  negative: "bg-rose-500",
  caution: "bg-amber-500",
  neutral: "bg-muted-foreground/60",
  accent: "bg-primary",
} as const;

export type TradeTone = keyof typeof TONES;

/** Small status chip with subtle micro-dot indicator */
export function Chip({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: TradeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap border",
        TONES[tone],
        className
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT_TONES[tone])}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Tabular Price Tag with precision rendering for scannable comparison.
 */
export function PriceTag({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  if (!value && value !== 0) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No price</span>;
  }

  const sizeClasses = {
    sm: "text-xs font-semibold",
    md: "text-sm font-semibold",
    lg: "text-base font-bold",
    xl: "text-xl font-bold sm:text-2xl",
  }[size];

  return (
    <span
      className={cn(
        "tabular-nums text-foreground whitespace-nowrap tracking-tight inline-flex items-baseline gap-1",
        sizeClasses,
        className
      )}
    >
      <span className="text-[0.8em] font-normal text-muted-foreground/80">Rp</span>
      <span>{value.toLocaleString()}</span>
    </span>
  );
}

/**
 * Double-Bezel (Doppelrand) Container Architecture.
 *
 * Simulates physical machined hardware using nested enclosures:
 * Outer Shell: hairline ring, subtle background gradient, generous outer radius.
 * Inner Core: distinct surface, subtle inner highlight, mathematically concentric radius.
 */
export function DoubleBezelShell({
  children,
  className,
  innerClassName,
  hover = false,
  selected = false,
  tone = "default",
  onClick,
  role,
  tabIndex,
  onKeyDown,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  hover?: boolean;
  selected?: boolean;
  tone?: "default" | "primary" | "amber" | "emerald";
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const outerTone = {
    default: "border-border/80 dark:border-white/10 bg-gradient-to-b from-foreground/[0.05] via-foreground/[0.02] to-transparent",
    primary: "border-primary/40 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent",
    amber: "border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent",
    emerald: "border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent",
  }[tone];

  return (
    <div
      role={role}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "relative rounded-2xl p-1 border shadow-xs transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        outerTone,
        selected && "ring-2 ring-primary border-primary/60 shadow-md shadow-primary/10",
        hover && "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
        className
      )}
    >
      <div
        className={cn(
          "relative rounded-[calc(1rem-2px)] sm:rounded-[calc(1rem)] bg-card text-card-foreground p-4 sm:p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]",
          selected && "bg-primary/[0.02]",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Button-in-Button CTA Architecture.
 *
 * Primary interactive button with nested circular icon wrapper,
 * micro-haptic scale physics (`active:scale-[0.98]`), and spring hover translation.
 */
export function ButtonInButton({
  children,
  icon,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  onClick,
  className,
  type = "button",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "primary" | "amber" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: "button" | "submit" | "reset";
}) {
  const variantStyles = {
    primary:
      "bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm shadow-primary/20",
    amber:
      "bg-amber-600 text-white hover:bg-amber-700 shadow-sm shadow-amber-600/20",
    secondary:
      "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline:
      "border border-border bg-background hover:bg-muted text-foreground",
    ghost:
      "hover:bg-muted text-foreground",
  }[variant];

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs gap-2 rounded-lg",
    md: "px-4 py-2 text-sm gap-2.5 rounded-xl",
    lg: "px-5 py-2.5 text-base gap-3 rounded-2xl",
  }[size];

  const iconSizes = {
    sm: "h-5 w-5",
    md: "h-6 w-6",
    lg: "h-7 w-7",
  }[size];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "group relative inline-flex items-center justify-between font-semibold select-none transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variantStyles,
        sizeStyles,
        className
      )}
    >
      <span className="truncate">{children}</span>
      {icon && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-black/10 dark:bg-white/15 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
            iconSizes
          )}
        >
          {icon}
        </span>
      )}
    </button>
  );
}

/**
 * Metric Readout Display Card.
 */
export function MetricReadout({
  label,
  value,
  subtext,
  icon,
  badge,
  className,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs p-3.5 sm:p-4 flex items-start justify-between gap-3 shadow-2xs",
        className
      )}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {badge}
        </div>
        <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground tracking-tight">
          {value}
        </p>
        {subtext && (
          <p className="text-xs text-muted-foreground/80 leading-relaxed truncate">
            {subtext}
          </p>
        )}
      </div>
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] border border-foreground/[0.06] text-muted-foreground">
          {icon}
        </div>
      )}
    </div>
  );
}

/**
 * Country dial code to flag emoji mapping.
 */
const COUNTRY_FLAGS: Record<string, string> = {
  "+62": "🇮🇩",
  "+1": "🇺🇸",
  "+44": "🇬🇧",
  "+7": "🇷🇺",
  "+91": "🇮🇳",
  "+234": "🇳🇬",
  "+55": "🇧🇷",
  "+49": "🇩🇪",
  "+33": "🇫🇷",
  "+84": "🇻🇳",
  "+63": "🇵🇭",
  "+60": "🇲🇾",
  "+65": "🇸🇬",
  "+86": "🇨🇳",
  "+81": "🇯🇵",
  "+82": "🇰🇷",
  "+90": "🇹🇷",
  "+380": "🇺🇦",
  "+20": "🇪🇬",
  "+92": "🇵🇰",
  "+880": "🇧🇩",
  "+971": "🇦🇪",
  "+966": "🇸🇦",
  "+48": "🇵🇱",
  "+39": "🇮🇹",
  "+34": "🇪🇸",
  "+31": "🇳🇱",
  "+52": "🇲🇽",
  "+57": "🇨🇴",
  "+54": "🇦🇷",
  "+27": "🇿🇦",
  "+254": "🇰🇪",
  "+212": "🇲🇦",
  "+213": "🇩🇿",
  "+998": "🇺🇿",
  "+994": "🇦🇿",
};

export const DIAL_TO_ISO: Record<string, string> = {
  "+62": "id",
  "+1": "us",
  "+44": "gb",
  "+7": "ru",
  "+91": "in",
  "+234": "ng",
  "+55": "br",
  "+49": "de",
  "+33": "fr",
  "+84": "vn",
  "+63": "ph",
  "+60": "my",
  "+65": "sg",
  "+86": "cn",
  "+81": "jp",
  "+82": "kr",
  "+90": "tr",
  "+380": "ua",
  "+20": "eg",
  "+92": "pk",
  "+880": "bd",
  "+971": "ae",
  "+966": "sa",
  "+48": "pl",
  "+39": "it",
  "+34": "es",
  "+31": "nl",
  "+52": "mx",
  "+57": "co",
  "+54": "ar",
  "+27": "za",
  "+254": "ke",
  "+212": "ma",
  "+213": "dz",
  "+998": "uz",
  "+994": "az",
  "+61": "au",
};

export function getCountryIso(countryCodeOrDial: string): string {
  const clean = countryCodeOrDial.trim().toLowerCase();
  if (clean.startsWith("+")) {
    return DIAL_TO_ISO[clean] || "un";
  }
  if (clean.length === 2 && /^[a-z]{2}$/.test(clean)) {
    return clean;
  }
  if (DIAL_TO_ISO[`+${clean}`]) {
    return DIAL_TO_ISO[`+${clean}`];
  }
  return "un";
}

/**
 * Universal SVG Flag component.
 * Ensures country flags render identically on Windows desktop (which lacks emoji flags)
 * and mobile devices, without displaying fallback two-letter text like "ID" or "IN".
 */
export function CountryFlag({
  countryCode,
  className,
  size = "md",
}: {
  countryCode: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const iso = getCountryIso(countryCode);
  const sizeClasses = {
    sm: "w-4 h-3 rounded-[2px]",
    md: "w-5 h-3.5 rounded-[3px]",
    lg: "w-6 h-4 rounded-[4px]",
  }[size];

  if (iso === "un" || !iso) {
    return <span className={cn("text-base select-none", className)}>🌐</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-black/15 dark:border-white/15 bg-muted/40 shadow-2xs select-none",
        sizeClasses,
        className
      )}
    >
      <img
        src={`https://flagcdn.com/${iso}.svg`}
        alt={`${iso.toUpperCase()} flag`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </span>
  );
}

export function getCountryFlag(countryCode: string): string {
  const cleanCode = countryCode.trim();
  const withPlus = cleanCode.startsWith("+") ? cleanCode : `+${cleanCode}`;
  return COUNTRY_FLAGS[withPlus] || "🌐";
}
