"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
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

// ── Constants & Local Storage Cache ──────────────────────────────────────────

const STORAGE_KEY = "telebos:system_status_cache";
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCachedStatus(): SystemStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const age = Date.now() - (parsed._saved_at || 0);
    if (age < CHECK_INTERVAL_MS && parsed.data) {
      return parsed.data as SystemStatus;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function setCachedStatus(data: SystemStatus) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data,
        _saved_at: Date.now(),
      })
    );
  } catch {
    // Ignore storage write errors (e.g. quota)
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AnnouncementBanner() {
  const _ = useT();

  // Background check every 2 hours, persisted in localStorage across refreshes
  const { data } = useQuery<SystemStatus>({
    queryKey: ["system-status"],
    queryFn: async () => {
      // Return cached data if still fresh to avoid network call
      const cached = getCachedStatus();
      if (cached) return cached;

      const res = await api.get("/system/status");
      const statusData = res.data as SystemStatus;
      setCachedStatus(statusData);
      return statusData;
    },
    initialData: () => getCachedStatus() ?? undefined,
    initialDataUpdatedAt: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed._saved_at;
        }
      } catch {}
      return undefined;
    },
    staleTime: CHECK_INTERVAL_MS,
    gcTime: CHECK_INTERVAL_MS * 2,
    refetchInterval: CHECK_INTERVAL_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const overall = data?.overall ?? null;

  // HANYA tampilkan banner jika status down atau degraded.
  // Jika normal ("up"), loading, atau unknown: sembunyikan sepenuhnya (return null).
  if (overall === "down") {
    return (
      <Banner
        id="telegram-status-down"
        variant="rainbow"
        changeLayout={false}
        className="border-b border-red-200 dark:border-red-950 text-red-900 dark:text-red-300 font-semibold"
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
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 animate-pulse" />
          <span>{_("announcement.telegramDown")}</span>
        </div>
      </Banner>
    );
  }

  if (overall === "degraded") {
    return (
      <Banner
        id="telegram-status-degraded"
        variant="rainbow"
        changeLayout={false}
        className="border-b border-amber-200 dark:border-amber-950 text-amber-900 dark:text-amber-300 font-semibold"
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

  return null;
}
