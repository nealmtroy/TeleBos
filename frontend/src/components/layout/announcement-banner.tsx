"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, AlertTriangle, CheckCircle, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import api from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type StatusOverall = "up" | "down" | "degraded" | "unknown";

interface MonitorInfo {
  id: number;
  name: string;
  url: string;
  status: string;
  under_maintenance: boolean;
}

interface SystemStatus {
  overall: StatusOverall;
  monitors: MonitorInfo[];
  fetched_at: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AnnouncementBanner() {
  const _ = useT();
  const [dismissed, setDismissed] = useState(false);
  const [persistedOverall, setPersistedOverall] = useState<StatusOverall | null>(null);

  // Poll system status from the globally-cached backend endpoint
  const { data, isFetching, isError } = useQuery<SystemStatus>({
    queryKey: ["system-status"],
    queryFn: async () => {
      const res = await api.get("/system/status");
      return res.data as SystemStatus;
    },
    refetchInterval: 600_000, // 10 minutes (backend cache)
    staleTime: 300_000,       // 5 min before considered stale
    retry: 2,
  });

  // Reset dismissed state when status changes from down/degraded → up
  // and when status changes from up → down/degraded
  const overall = data?.overall ?? null;
  useEffect(() => {
    if (!overall) return;

    if (persistedOverall === null) {
      setPersistedOverall(overall);
      return;
    }

    if (overall !== persistedOverall) {
      setPersistedOverall(overall);
      // Only auto-reveal when things get worse (up → down/degraded)
      const wasFine = persistedOverall === "up" || persistedOverall === "unknown";
      const nowNotFine = overall === "down" || overall === "degraded";
      if (wasFine && nowNotFine) {
        setDismissed(false);
      }
    }
  }, [overall, persistedOverall]);

  // Don't hide when loading/error — preserve the last known state
  // Only hide when we definitively know things are fine
  const knownUp = overall === "up";
  const isBad = overall === "down" || overall === "degraded";
  const isUnknown = overall === "unknown";

  // Hide when things are perfectly fine or unknown with no data
  if (knownUp && !isFetching) return null;
  if (isUnknown && !isFetching && !data?.monitors?.length) return null;
  if (dismissed) return null;

  // Loading state when we have no previous data
  if (isFetching && !data) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-700 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span className="flex-1">{_("announcement.loading")}</span>
      </div>
    );
  }

  // Error / unknown state
  if (isError || isUnknown) {
    return (
      <DismissibleBanner
        variant="muted"
        icon={<HelpCircle className="h-4 w-4 shrink-0" />}
        message={_("announcement.unknown")}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  // Down state
  if (overall === "down") {
    return (
      <DismissibleBanner
        variant="error"
        icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
        message={_("announcement.telegramDown")}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  // Degraded state
  if (overall === "degraded") {
    return (
      <DismissibleBanner
        variant="warning"
        icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
        message={_("announcement.telegramDegraded")}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  // Up but still fetching (show brief "all good" then transition out)
  if (overall === "up") {
    return (
      <DismissibleBanner
        variant="success"
        icon={<CheckCircle className="h-4 w-4 shrink-0" />}
        message={_("announcement.telegramUp")}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  return null;
}

// ── Variant sub-component ─────────────────────────────────────────────────────

interface DismissibleBannerProps {
  variant: "error" | "warning" | "success" | "muted";
  icon: React.ReactNode;
  message: string;
  onDismiss: () => void;
}

function DismissibleBanner({ variant, icon, message, onDismiss }: DismissibleBannerProps) {
  const variants = {
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    success: "bg-green-50 border-green-200 text-green-800",
    muted: "bg-gray-50 border-gray-200 text-gray-600",
  };

  return (
    <div className={cn("border-b px-4 py-2 text-sm flex items-center gap-2", variants[variant])}>
      {icon}
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 transition-colors hover:bg-black/5 active:bg-black/10"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
