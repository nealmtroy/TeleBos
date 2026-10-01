"use client";

import { cn } from "@/lib/utils";

/**
 * Primitives shared by the Buy and Sell marketplace screens.
 *
 * These two pages answer the same question — what does this cost, and is it
 * worth it — so they share one vocabulary. The earlier attempts dressed them
 * up as marketing pages: oversized hero blocks and nested shells that made
 * the price harder to find, not easier. Everything here is tuned for scanning
 * a list and comparing numbers, which is what these screens are for.
 */

// Standard, consistent with the rest of the dashboard. Nothing exotic.
const EASE = "transition-colors duration-150";

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
        "text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

const TONES = {
  positive:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  negative: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  caution:
    "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
} as const;

export type TradeTone = keyof typeof TONES;

/** Small status label. Flat fill, no ring — chips stacked in a row get noisy fast. */
export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: TradeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * The price, rendered the same way everywhere.
 *
 * Held at a fixed tabular size so a column of them lines up on the digit and
 * the eye can compare down the column without re-reading each one.
 */
export function PriceTag({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  if (!value) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No price</span>;
  }
  return (
    <span
      className={cn(
        "text-sm font-semibold tabular-nums text-foreground whitespace-nowrap",
        className
      )}
    >
      Rp {value.toLocaleString()}
    </span>
  );
}

export { EASE };
