"use client";

import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export interface CycleSummary {
  cycleNumber: number;
  totalCount: number;
  successCount: number;
  errorCount: number;
}

interface CycleAccordionProps {
  cycles: CycleSummary[];
  expandedCycle: number | null;
  onToggle: (cycleNumber: number) => void;
  isRunning: boolean;
  loading?: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  children: (cycleNumber: number) => React.ReactNode;
}

export default function CycleAccordion({
  cycles,
  expandedCycle,
  onToggle,
  isRunning,
  loading,
  page,
  totalPages,
  onPageChange,
  children,
}: CycleAccordionProps) {
  const _ = useT();
  const latestCycle =
    cycles.length > 0 ? Math.max(...cycles.map((c) => c.cycleNumber)) : null;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (cycles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {cycles.map((cycle) => {
        const isExpanded = expandedCycle === cycle.cycleNumber;
        const isLatestLive = isRunning && cycle.cycleNumber === latestCycle;

        return (
          <div
            key={cycle.cycleNumber}
            className={cn(
              "rounded-xl border overflow-hidden transition-colors",
              isExpanded
                ? "border-primary-200 bg-white"
                : "border-gray-200 bg-white hover:border-gray-300"
            )}
          >
            {/* Header — clickable button */}
            <button
              type="button"
              onClick={() => onToggle(cycle.cycleNumber)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-3">
                {/* Cycle badge */}
                <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
                  <Layers className="h-3.5 w-3.5" />
                  C{cycle.cycleNumber}
                </span>

                {/* LIVE badge */}
                {isLatestLive && (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    {_("broadcastLogs.live")}
                  </span>
                )}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  {_("broadcastLogs.total")}:{" "}
                  <strong className="text-gray-700">{cycle.totalCount}</strong>
                </span>
                <span className="text-green-600">
                  {_("broadcastLogs.success")}:{" "}
                  <strong>{cycle.successCount}</strong>
                </span>
                <span className="text-red-600">
                  {_("broadcastLogs.error")}:{" "}
                  <strong>{cycle.errorCount}</strong>
                </span>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded body */}
            {isExpanded && (
              <div className="border-t border-gray-200">
                <div className="p-1">{children(cycle.cycleNumber)}</div>
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg border transition",
              page <= 1
                ? "border-gray-100 text-gray-300 cursor-not-allowed"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            )}
          >
            ← Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg border transition",
              page >= totalPages
                ? "border-gray-100 text-gray-300 cursor-not-allowed"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            )}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
