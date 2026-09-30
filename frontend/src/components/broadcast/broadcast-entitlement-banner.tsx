"use client";

import { AlertTriangle, Clock, Stamp } from "lucide-react";

import { useBroadcastEntitlement } from "@/hooks/use-broadcast";
import { cn } from "@/lib/utils";

/** Render a second count as `h m`, dropping empty units. */
function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Free-tier broadcast notice.
 *
 * Renders nothing for paid roles. For the free tier it states the remaining
 * daily send budget and, when one is configured, the watermark that will be
 * appended to every message — so the constraint is visible before the user
 * composes a campaign, not after it starts.
 */
export function BroadcastEntitlementBanner({ className }: { className?: string }) {
  const { data } = useBroadcastEntitlement();

  if (!data || data.unlimited) return null;

  const exhausted = data.remaining_seconds <= 0;
  const usedRatio =
    data.daily_limit_seconds > 0
      ? Math.min(1, data.used_seconds / data.daily_limit_seconds)
      : 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        exhausted
          ? "bg-red-50 border-red-200"
          : "bg-amber-50 border-amber-200",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn(
            "h-5 w-5 shrink-0 mt-0.5",
            exhausted ? "text-red-600" : "text-amber-600"
          )}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                exhausted ? "text-red-800" : "text-amber-900"
              )}
            >
              {exhausted
                ? "Daily broadcast time used up"
                : `Free plan: ${formatDuration(data.remaining_seconds)} of broadcast time left today`}
            </p>
            <p
              className={cn(
                "text-xs mt-0.5",
                exhausted ? "text-red-700" : "text-amber-800"
              )}
            >
              {exhausted
                ? "Your allowance resets at 00:00 UTC. Upgrade your plan for unlimited broadcast time."
                : "Resets at 00:00 UTC. Only time actually spent sending counts, so your configured delays are free."}
            </p>
          </div>

          {!exhausted && data.daily_limit_seconds > 0 && (
            <div
              className="h-1.5 w-full bg-amber-200/60 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(usedRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily broadcast time used"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  usedRatio >= 0.85 ? "bg-red-500" : "bg-amber-500"
                )}
                style={{ width: `${Math.max(2, usedRatio * 100)}%` }}
              />
            </div>
          )}

          {data.watermark_enabled && data.watermark_preview && (
            <div className="flex items-start gap-2 pt-1">
              <Stamp className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                Every message you send will be stamped with{" "}
                <span className="font-semibold">{data.watermark_preview}</span>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
