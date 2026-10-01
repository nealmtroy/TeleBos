"use client";

/**
 * Shared surface for the two marketplace trade pages (Buy / Sell Accounts).
 *
 * Both screens answer the same question — what does this cost, and is it worth
 * it — so they read from one visual language: a raised shell, an inset core,
 * and hairline separation instead of stacked shadows. Keeping the primitives
 * here means a change to the surface lands on both pages at once.
 */

import { cn } from "@/lib/utils";

// One easing curve everywhere on these pages. Standard ease-in-out makes the
// pressed state feel like a delay rather than a response.
const EASE = "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]";

/**
 * Raised shell + inset core. The outer ring and padding make the panel read
 * as a physical plate; the inner highlight is what separates the core from
 * the surface it sits on without a drop shadow doing the work.
 */
export function TradeSurface({
  className,
  innerClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & { innerClassName?: string }) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] bg-slate-100/70 dark:bg-white/[0.03] p-1.5 ring-1 ring-slate-900/[0.06] dark:ring-white/[0.06]",
        EASE,
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "rounded-[1.5rem] bg-white dark:bg-slate-900/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Small uppercase label that sits above a heading. */
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
        "inline-flex items-center rounded-full bg-slate-900/[0.04] dark:bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400",
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Primary action. The icon lives in its own inset circle rather than sitting
 * bare beside the label, and the whole pill presses on active.
 */
export function TradeButton({
  className,
  icon,
  children,
  ...props
}: React.ComponentProps<"button"> & { icon?: React.ReactNode }) {
  return (
    <button
      className={cn(
        "group inline-flex items-center gap-2 rounded-full bg-slate-900 dark:bg-white pl-5 pr-1.5 py-1.5",
        "text-sm font-semibold text-white dark:text-slate-900",
        "shadow-[0_1px_2px_rgba(15,23,42,0.16)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]",
        "hover:bg-slate-800 dark:hover:bg-slate-100 active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40",
        EASE,
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {icon ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-active:scale-95">
          {icon}
        </span>
      ) : null}
    </button>
  );
}

/** Quiet secondary action — same geometry, no fill. */
export function TradeGhostButton({
  className,
  icon,
  children,
  ...props
}: React.ComponentProps<"button"> & { icon?: React.ReactNode }) {
  return (
    <button
      className={cn(
        "group inline-flex items-center gap-2 rounded-full bg-slate-900/[0.04] dark:bg-white/[0.06] pl-4 pr-1.5 py-1.5",
        "text-sm font-semibold text-slate-700 dark:text-slate-200",
        "hover:bg-slate-900/[0.07] dark:hover:bg-white/[0.1] active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40",
        EASE,
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {icon ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/[0.05] dark:bg-white/[0.08] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-active:scale-95">
          {icon}
        </span>
      ) : null}
    </button>
  );
}

const TONES = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  negative: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  caution: "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-600/10 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10",
  accent: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20",
} as const;

/** Compact status chip. Ring instead of border keeps it from reading as a box. */
export function Chip({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Section rule inside a panel — hairline, never a box. */
export function Rule({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-px w-full bg-slate-900/[0.06] dark:bg-white/[0.07]",
        className
      )}
    />
  );
}

/**
 * Metric readout. The value is the loud part and the label sits under it, so
 * a column of these scans as a column of numbers.
 */
export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
        {value}
      </p>
      {hint ? (
        <p className={cn("text-xs font-medium", TONES[tone].split(" ")[1])}>{hint}</p>
      ) : null}
    </div>
  );
}

export const TRADE_EASE = EASE;