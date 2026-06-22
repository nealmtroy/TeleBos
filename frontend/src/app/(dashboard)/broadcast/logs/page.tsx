"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAccounts } from "@/hooks/use-accounts";
import { type BroadcastJob, type BroadcastLog } from "@/hooks/use-broadcast";
import { cn, formatDate } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton-cards";
import {
  CheckCircle,
  XCircle,
  FileDown,
  Search,
  Filter,
  Layers,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import CycleAccordion, { type CycleSummary } from "@/components/broadcast/cycle-accordion";

export default function BroadcastLogsPage() {
  const _ = useT();
  const searchParams = useSearchParams();
  const { data: accounts } = useAccounts();
  const { data: jobs } = useQuery<BroadcastJob[]>({
    queryKey: ["broadcast-jobs"],
    queryFn: async () => {
      const { data } = await api.get("/broadcast/history");
      return data;
    },
    refetchInterval: (query: any) =>
      query?.state?.data?.some((j: any) => j.status === "running") ? 3000 : false,
  });
  const [selectedJobId, setSelectedJobId] = useState<string>(() => searchParams.get("jobId") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedCycle, setExpandedCycle] = useState<number | null>(null);
  const [cyclePage, setCyclePage] = useState(1);
  const CYCLES_PER_PAGE = 10;

  // Auto-select running job on load
  useEffect(() => {
    if (jobs && jobs.length > 0 && !selectedJobId && !searchParams.get("jobId")) {
      const runningJob = jobs.find((j) => j.status === "running");
      if (runningJob) {
        setSelectedJobId(runningJob.id);
      } else {
        setSelectedJobId(jobs[0].id);
      }
    }
  }, [jobs, selectedJobId, searchParams]);

  // Reset expanded cycle & page when job changes
  useEffect(() => {
    setExpandedCycle(null);
    setCyclePage(1);
  }, [selectedJobId]);

  // Account Map for easy lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    (accounts || []).forEach((acc) => {
      map.set(acc.id, `${acc.first_name || "Unknown"} (${acc.phone})`);
    });
    return map;
  }, [accounts]);

  const selectedJob: BroadcastJob | undefined = jobs?.find((j) => j.id === selectedJobId);

  // Fetch all logs for the selected job (limit 500, polled if running)
  const {
    data: allLogs,
    isLoading: logsLoading,
    isError,
    refetch,
  } = useQuery<BroadcastLog[]>({
    queryKey: ["broadcast-logs", selectedJobId],
    queryFn: async () => {
      if (!selectedJobId) return [];
      const { data } = await api.get(`/broadcast/${selectedJobId}/logs?limit=500`);
      return data;
    },
    enabled: !!selectedJobId,
    refetchInterval: selectedJob?.status === "running" ? 3000 : false,
  });

  // Group logs by cycle_number to produce cycle summaries
  const cycleSummaries: CycleSummary[] = useMemo(() => {
    if (!allLogs || allLogs.length === 0) return [];
    const map = new Map<number, { total: number; success: number; error: number }>();
    for (const log of allLogs) {
      const key = log.cycle_number;
      if (!map.has(key)) {
        map.set(key, { total: 0, success: 0, error: 0 });
      }
      const entry = map.get(key)!;
      entry.total += 1;
      if (log.status === "success") entry.success += 1;
      else if (log.status === "error") entry.error += 1;
    }
    return Array.from(map.entries())
      .map(([cycleNumber, counts]) => ({
        cycleNumber,
        totalCount: counts.total,
        successCount: counts.success,
        errorCount: counts.error,
      }))
      .sort((a, b) => a.cycleNumber - b.cycleNumber);
  }, [allLogs]);

  // Auto-expand the latest cycle on initial load only
  useEffect(() => {
    if (cycleSummaries.length > 0 && expandedCycle === null) {
      const latest = Math.max(...cycleSummaries.map((c) => c.cycleNumber));
      setExpandedCycle(latest);
    }
  }, [cycleSummaries, expandedCycle]);

  // Track known max cycle so we only auto-expand when a genuinely NEW cycle appears
  // (not every time polling re-creates the cycleSummaries array)
  const knownMaxCycleRef = useRef<number | null>(null);
  useEffect(() => {
    if (cycleSummaries.length === 0) return;
    const latest = Math.max(...cycleSummaries.map((c) => c.cycleNumber));
    if (knownMaxCycleRef.current === null) {
      knownMaxCycleRef.current = latest;
    } else if (latest > knownMaxCycleRef.current) {
      knownMaxCycleRef.current = latest;
      // Auto-navigate to page 1 so live cycle is visible
      if (cyclePage > 1) setCyclePage(1);
      // Only auto-expand if user hasn't explicitly clicked an older cycle
      if (expandedCycle !== null && latest > expandedCycle) {
        setExpandedCycle(latest);
      }
    }
  }, [cycleSummaries, expandedCycle, cyclePage]);

  // Sort cycles descending (newest first) so live cycle is always on page 1
  const sortedCycles = useMemo(() => {
    return [...cycleSummaries].sort((a, b) => b.cycleNumber - a.cycleNumber);
  }, [cycleSummaries]);

  const totalCyclePages = Math.max(1, Math.ceil(sortedCycles.length / CYCLES_PER_PAGE));

  const displayedCycles = useMemo(() => {
    const start = (cyclePage - 1) * CYCLES_PER_PAGE;
    return sortedCycles.slice(start, start + CYCLES_PER_PAGE);
  }, [sortedCycles, cyclePage]);

  const handleToggle = useCallback(
    (cycleNumber: number) => {
      setExpandedCycle((prev) => (prev === cycleNumber ? prev : cycleNumber));
    },
    []
  );

  // Filter logs for the currently expanded cycle
  const logsForCycle = useMemo(() => {
    if (!allLogs || expandedCycle === null) return [];
    let filtered = allLogs.filter((l) => l.cycle_number === expandedCycle);
    if (statusFilter) {
      filtered = filtered.filter((l) => l.status === statusFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter((l) =>
        l.group_identifier.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allLogs, expandedCycle, statusFilter, searchFilter]);

  async function handleExport(format: "csv" | "json") {
    if (!selectedJobId) return;
    const url = `/api/v1/broadcast/${selectedJobId}/logs/export?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `broadcast_logs_${selectedJobId}.${format}`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("broadcastLogs.title")}</h1>
        <p className="text-gray-500 mt-1">{_("broadcastLogs.desc")}</p>
      </div>

      {/* Job selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white min-w-[250px]"
        >
          <option value="">{_("broadcastLogs.selectJob")}</option>
          {(jobs || []).map((job) => (
            <option key={job.id} value={job.id}>
              [{job.status.toUpperCase()}] {formatDate(job.created_at)} —{" "}
              {job.sent_count}/{job.total_groups} sent
            </option>
          ))}
        </select>

        {selectedJobId && selectedJob && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                selectedJob.status === "completed" && "bg-green-100 text-green-800",
                selectedJob.status === "running" && "bg-blue-100 text-blue-800",
                selectedJob.status === "failed" && "bg-red-100 text-red-800"
              )}
            >
              {selectedJob.status}
            </span>
            <span>{_("broadcastLogs.sent")}: {selectedJob.sent_count}</span>
            <span>{_("broadcastLogs.failed")}: {selectedJob.fail_count}</span>
          </div>
        )}
      </div>

      {selectedJobId && (
        <>
          {/* Filters (cycle dropdown removed — replaced by accordion) */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={_("broadcastLogs.searchGroup")}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{_("broadcastLogs.allStatuses")}</option>
              <option value="success">{_("broadcastLogs.success")}</option>
              <option value="error">{_("broadcastLogs.error")}</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={() => handleExport("csv")}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              <FileDown className="h-4 w-4" />
              {_("broadcastLogs.exportCsv")}
            </button>
            <button
              onClick={() => handleExport("json")}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              <FileDown className="h-4 w-4" />
              {_("broadcastLogs.exportJson")}
            </button>
          </div>

          {/* Error state */}
          {isError && (
            <div className="text-center py-12 bg-white rounded-xl border border-red-200 text-red-600">
              <p className="mb-2">{_("broadcastLogs.noEntries")}</p>
              <button
                onClick={() => refetch()}
                className="text-sm underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Cycle accordion */}
          {logsLoading && !allLogs ? (
            <TableSkeleton rows={4} cols={3} />
          ) : !allLogs || allLogs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-500">
              <Filter className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>{_("broadcastLogs.noEntries")}</p>
            </div>
          ) : cycleSummaries.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-500">
              <p>{_("broadcastLogs.noEntries")}</p>
            </div>
          ) : (
            <CycleAccordion
              cycles={displayedCycles}
              expandedCycle={expandedCycle}
              onToggle={handleToggle}
              isRunning={selectedJob?.status === "running"}
              page={cyclePage}
              totalPages={totalCyclePages}
              onPageChange={setCyclePage}
              latestCycleNumber={knownMaxCycleRef.current}
            >
              {(cycleNumber) => {
                const logs = cycleNumber === expandedCycle ? logsForCycle : [];

                if (logs.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      {statusFilter || searchFilter
                        ? _("broadcastLogs.noEntriesMatchFilter")
                        : _("broadcastLogs.noEntriesForCycle")}
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colCycle")}</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colGroup")}</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">Account</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colStatus")}</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colErrorType")}</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colMessage")}</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colSentText")}</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">{_("broadcastLogs.colTime")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {logs.map((log) => {
                          const accountName = log.account_id_used
                            ? accountMap.get(log.account_id_used) || "Deleted Account"
                            : "—";
                          return (
                            <tr key={log.id} className="hover:bg-gray-50 transition">
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                  <Layers className="h-3 w-3" />
                                  C{log.cycle_number}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900 max-w-[150px] truncate">
                                {log.group_identifier}
                              </td>
                              <td className="px-4 py-3 text-gray-700 max-w-[150px] truncate" title={accountName}>
                                {accountName}
                              </td>
                              <td className="px-4 py-3">
                                {log.status === "success" ? (
                                  <span className="inline-flex items-center gap-1 text-green-700">
                                    <CheckCircle className="h-3.5 w-3.5" /> {_("broadcastLogs.success")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-700">
                                    <XCircle className="h-3.5 w-3.5" /> {_("broadcastLogs.error")}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {log.error_type ? (
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-xs font-medium",
                                      log.error_type === "flood" && "bg-orange-100 text-orange-800",
                                      log.error_type === "banned" && "bg-red-100 text-red-800",
                                      log.error_type === "admin_only" && "bg-yellow-100 text-yellow-800",
                                      log.error_type === "slowmode" && "bg-blue-100 text-blue-800",
                                      log.error_type === "invalid_username" && "bg-purple-100 text-purple-800",
                                      log.error_type === "invalid_link" && "bg-purple-100 text-purple-800",
                                      !log.error_type && "bg-gray-100 text-gray-600"
                                    )}
                                  >
                                    {log.error_type || "—"}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                                {log.error_message || "—"}
                              </td>
                              <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                                {log.sent_text || "—"}
                              </td>
                              <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                {formatDate(log.sent_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }}
            </CycleAccordion>
          )}
        </>
      )}

      {!selectedJobId && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Filter className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">{_("broadcastLogs.selectJobToView")}</p>
        </div>
      )}
    </div>
  );
}
