"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Shared presentational primitives for the /settings page.
 *
 * Built on top of official shadcn primitives (Card, Badge) while
 * preserving the exact ergonomics expected by settings modules.
 */

export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5 border-border/70", className)}>
      {children}
    </Card>
  );
}

export function SettingsCardHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A labelled read-only row used by the profile card. Renders the value with
 * `font-medium` so it stays legible against the muted label above it.
 */
export function SettingsField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground break-words">{children}</div>
    </div>
  );
}

/**
 * Divider between rows inside a single settings card. Kept as a component so
 * the spacing rhythm stays identical across every card.
 */
export function SettingsDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-px w-full bg-border/60", className)} />;
}

/**
 * Status pill used for the profile "Active" badge and the two-factor state.
 * Composes shadcn Badge with high-contrast variants.
 */
export function SettingsBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "neutral" | "warning";
}) {
  const variant = tone === "neutral" ? "secondary" : tone;

  return (
    <Badge
      variant={variant}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium"
    >
      {children}
    </Badge>
  );
}

/** Small pulsing-free status dot — motion here is a distraction at 60fps. */
export function StatusDot({ tone = "success" }: { tone?: "success" | "neutral" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        tone === "success" ? "bg-emerald-500" : "bg-muted-foreground/40"
      )}
    />
  );
}