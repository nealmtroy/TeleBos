"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import api from "@/lib/api";
import { Banner } from "@/components/ui/banner";

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

  // Reset overall state change tracking
  const overall = data?.overall ?? null;
  useEffect(() => {
    if (!overall) return;

    if (persistedOverall === null) {
      setPersistedOverall(overall);
      return;
    }

    if (overall !== persistedOverall) {
      setPersistedOverall(overall);
    }
  }, [overall, persistedOverall]);

  // Don't hide when loading/error — preserve the last known state
  // Only hide when we definitively know things are fine
  const knownUp = overall === "up";
  const isUnknown = overall === "unknown";

  // Hide when things are perfectly fine or unknown with no data
  if (knownUp && !isFetching) return null;
  if (isUnknown && !isFetching && !data?.monitors?.length) return null;

  // Loading state when we have no previous data
  if (isFetching && !data) {
    return (
      <Banner
        variant="normal"
        changeLayout={false}
        className="bg-blue-50/90 border-b border-blue-200 text-blue-800"
      >
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-blue-600" />
          <span>{_("announcement.loading")}</span>
        </div>
      </Banner>
    );
  }

  // Error / unknown state
  if (isError || isUnknown) {
    return (
      <Banner
        id="telegram-status-unknown"
        variant="normal"
        changeLayout={false}
        className="bg-gray-50/90 border-b border-gray-200 text-gray-700"
      >
        <div className="flex items-center justify-center gap-2">
          <HelpCircle className="h-4 w-4 shrink-0 text-gray-500" />
          <span>{_("announcement.unknown")}</span>
        </div>
      </Banner>
    );
  }

  // Down state - Rainbow warning
  if (overall === "down") {
    return (
      <Banner
        id="telegram-status-down"
        variant="rainbow"
        changeLayout={false}
        className="border-b border-red-200 text-red-900 font-semibold"
        rainbowColors={[
          "rgba(255, 0, 0, 0.15)",
          "rgba(239, 68, 68, 0.25)",
          "transparent",
          "rgba(220, 38, 38, 0.2)",
          "transparent",
          "rgba(239, 68, 68, 0.25)",
          "transparent",
        ]}
      >
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 animate-pulse" />
          <span>{_("announcement.telegramDown")}</span>
        </div>
      </Banner>
    );
  }

  // Degraded state - Rainbow degraded warning
  if (overall === "degraded") {
    return (
      <Banner
        id="telegram-status-degraded"
        variant="rainbow"
        changeLayout={false}
        className="border-b border-amber-200 text-amber-900 font-semibold"
        rainbowColors={[
          "rgba(245, 158, 11, 0.15)",
          "rgba(251, 191, 36, 0.25)",
          "transparent",
          "rgba(217, 119, 6, 0.2)",
          "transparent",
          "rgba(251, 191, 36, 0.25)",
          "transparent",
        ]}
      >
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{_("announcement.telegramDegraded")}</span>
        </div>
      </Banner>
    );
  }

  // Up but still fetching (show brief "all good" then transition out)
  if (overall === "up") {
    return (
      <Banner
        id="telegram-status-up"
        variant="normal"
        changeLayout={false}
        className="bg-green-50/90 border-b border-green-200 text-green-800"
      >
        <div className="flex items-center justify-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
          <span>{_("announcement.telegramUp")}</span>
        </div>
      </Banner>
    );
  }

  return null;
}
