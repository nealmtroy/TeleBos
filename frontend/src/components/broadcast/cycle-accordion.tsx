"use client";

import { Layers } from "lucide-react";
import { DataPagination } from "@/components/ui/pagination";
import { useT } from "@/lib/i18n";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  latestCycleNumber: number | null;
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
  latestCycleNumber,
  children,
}: CycleAccordionProps) {
  const _ = useT();
  const latestCycle =
    latestCycleNumber ??
    (cycles.length > 0 ? Math.max(...cycles.map((c) => c.cycleNumber)) : null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (cycles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Accordion
        type="single"
        collapsible
        value={expandedCycle !== null ? String(expandedCycle) : ""}
        onValueChange={(val) => {
          if (val) {
            onToggle(Number(val));
          }
        }}
        className="space-y-3"
      >
        {cycles.map((cycle) => {
          const isLatestLive = isRunning && cycle.cycleNumber === latestCycle;

          return (
            <AccordionItem
              key={cycle.cycleNumber}
              value={String(cycle.cycleNumber)}
              className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs transition-colors data-[state=open]:border-primary/40 dark:data-[state=open]:border-primary/40"
            >
              <AccordionTrigger className="px-5 py-3.5 hover:no-underline hover:bg-gray-50/50 dark:hover:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  {/* Cycle badge */}
                  <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-full font-semibold border border-indigo-200/50 dark:border-indigo-800/50">
                    <Layers className="h-3.5 w-3.5" />
                    C{cycle.cycleNumber}
                  </span>

                  {/* LIVE badge */}
                  {isLatestLive && (
                    <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full font-semibold border border-emerald-200/50 dark:border-emerald-800/50">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      {_("broadcastLogs.live")}
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-sm ml-auto mr-3">
                  <span className="text-gray-500 dark:text-slate-400">
                    {_("broadcastLogs.total")}:{" "}
                    <strong className="text-gray-700 dark:text-slate-200">
                      {cycle.totalCount}
                    </strong>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {_("broadcastLogs.success")}:{" "}
                    <strong>{cycle.successCount}</strong>
                  </span>
                  <span className="text-rose-600 dark:text-rose-400">
                    {_("broadcastLogs.error")}:{" "}
                    <strong>{cycle.errorCount}</strong>
                  </span>
                </div>
              </AccordionTrigger>

              <AccordionContent className="border-t border-gray-200 dark:border-slate-800 p-1">
                {children(cycle.cycleNumber)}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pt-2">
          <DataPagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            compact
          />
        </div>
      )}
    </div>
  );
}
