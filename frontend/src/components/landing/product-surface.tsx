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
  className,
  compact = false,
  variant,
}: {
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
    <PublicTerminal className={cn("relative", className)} label={_("landing.surfaceIllustrative")}>
      <div className={cn("grid", compact ? "gap-4 p-4" : "gap-6 p-5 sm:p-7")}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#292d30] text-[#2AABEE]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{surface.title}</p>
              <p className="public-mono mt-1 text-[10px] text-[#6e727a]">TELEBOS / CONTROL</p>
            </div>
          </div>
          <Radio className="h-4 w-4 shrink-0 text-[#3ad389]" aria-hidden="true" />
        </div>
        <div>{surface.rows.map((row) => <PublicStatusRow key={row.label} {...row} />)}</div>
        {!compact && (
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-[#292d30] bg-[#292d30]">
            {surface.rows.map((row, index) => (
              <div key={`${row.label}-metric`} className="bg-black px-3 py-4">
                <p className="public-mono text-[9px] uppercase text-[#6e727a]">0{index + 1}</p>
                <p className="mt-2 truncate text-xs text-[#f0f0f0]">{row.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PublicTerminal>
  );
}
