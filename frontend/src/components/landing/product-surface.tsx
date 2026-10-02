"use client";

import type { LucideIcon } from "lucide-react";
import { Activity, Bot, MessageSquare, Radio, Send, Smartphone } from "lucide-react";

import { PublicStatusRow, PublicTerminal } from "@/components/public/public-ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ProductSurfaceVariant = "accounts" | "automation" | "broadcast" | "chat" | "monitoring";

type SurfaceRow = {
  label: string;
  tone: "accent" | "danger" | "muted" | "success" | "warning";
  value: string;
};

type SurfaceDefinition = {
  icon: LucideIcon;
  rows: SurfaceRow[];
  title: string;
};

export function ProductSurface({
  borderless = false,
  className,
  compact = false,
  variant,
}: {
  borderless?: boolean;
  className?: string;
  compact?: boolean;
  variant: ProductSurfaceVariant;
}) {
  const _ = useT();
  const surfaces: Record<ProductSurfaceVariant, SurfaceDefinition> = {
    accounts: {
      icon: Smartphone,
      title: _("landing.slabAccountsTitle"),
      rows: [
        { label: `${_("landing.surfaceAccount")} 01`, value: _("landing.surfaceConnected"), tone: "success" },
        { label: `${_("landing.surfaceAccount")} 02`, value: _("landing.surfaceReady"), tone: "accent" },
        { label: `${_("landing.surfaceAccount")} 03`, value: _("landing.surfaceAttention"), tone: "warning" },
      ],
    },
    broadcast: {
      icon: Send,
      title: _("landing.slabBroadcastTitle"),
      rows: [
        { label: _("landing.surfaceTargets"), value: "24", tone: "accent" },
        { label: _("landing.surfaceDelay"), value: "12s", tone: "muted" },
        { label: _("landing.surfaceProgress"), value: "18 / 24", tone: "success" },
      ],
    },
    chat: {
      icon: MessageSquare,
      title: _("landing.slabChatTitle"),
      rows: [
        { label: "@ops_team", value: _("landing.surfaceUnread"), tone: "accent" },
        { label: "@support", value: _("landing.surfaceAssigned"), tone: "success" },
        { label: "@orders", value: _("landing.surfaceReady"), tone: "muted" },
      ],
    },
    automation: {
      icon: Bot,
      title: _("landing.slabAutomationTitle"),
      rows: [
        { label: _("landing.surfaceRule"), value: _("landing.surfaceEnabled"), tone: "success" },
        { label: _("landing.slabVisualTrigger"), value: _("landing.surfaceMatched"), tone: "accent" },
        { label: _("landing.slabVisualAction"), value: _("landing.surfaceQueued"), tone: "muted" },
      ],
    },
    monitoring: {
      icon: Activity,
      title: _("landing.slabMonitorTitle"),
      rows: [
        { label: _("landing.proofBroadcast"), value: _("landing.surfaceRunning"), tone: "accent" },
        { label: _("landing.proofAutomation"), value: _("landing.surfaceComplete"), tone: "success" },
        { label: _("landing.surfaceNextAction"), value: _("landing.surfaceAttention"), tone: "warning" },
      ],
    },
  };
  const surface = surfaces[variant];
  const Icon = surface.icon;

  return (
    <PublicTerminal
      borderless={borderless}
      className={cn("relative", className)}
      label={_("landing.surfaceIllustrative")}
    >
      <div className={cn("grid", compact ? "gap-3 p-4" : "gap-5 p-5 sm:p-6")}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--public-border)] text-[var(--public-accent)]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--public-text)]">{surface.title}</p>
              <p className="public-mono mt-0.5 text-xs text-[var(--public-subtle)]">TELEBOS / CONTROL</p>
            </div>
          </div>
          <Radio className="h-4 w-4 shrink-0 text-[var(--public-success)]" aria-hidden="true" />
        </div>
        <div>{surface.rows.map((row) => <PublicStatusRow key={row.label} {...row} />)}</div>
        {!compact && (
          <div className="grid grid-cols-3 divide-x divide-[var(--public-border)] border-t border-[var(--public-border)] pt-3 text-xs">
            {surface.rows.map((row, index) => (
              <div key={`${row.label}-metric`} className="px-3 first:pl-0 last:pr-0">
                <p className="public-mono text-xs uppercase font-bold text-[var(--public-subtle)]">0{index + 1}</p>
                <p className="mt-1 truncate text-xs font-medium text-[var(--public-body)]">{row.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PublicTerminal>
  );
}
