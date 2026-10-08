"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAccounts } from "@/hooks/use-accounts";
import { type BroadcastJob, type BroadcastLog, type BroadcastCycleDetail } from "@/hooks/use-broadcast";
import { cn, formatDate } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton-cards";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

  // Fetch all cycle logs for the selected job (limit 500, polled if running)
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

  // Each log in allLogs represents one cycle directly
  const cycleSummaries: CycleSummary[] = useMemo(() => {
    if (!allLogs || allLogs.length === 0) return [];
    return allLogs
      .map((log) => ({
        cycleNumber: log.cycle_number,
        totalCount: log.total_groups,
        successCount: log.sent_count,
        errorCount: log.fail_count,
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

  // Filter detail items for the currently expanded cycle
  const logsForCycle = useMemo<BroadcastCycleDetail[]>(() => {
    if (!allLogs || expandedCycle === null) return [];
    const targetCycle = allLogs.find((l) => l.cycle_number === expandedCycle);
    if (!targetCycle || !targetCycle.details) return [];
    let list = targetCycle.details;
    if (statusFilter) {
      list = list.filter((l) => l.status === statusFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      list = list.filter((l) =>
        (l.group_identifier || "").toLowerCase().includes(q)
      );
    }
    return list;
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
        <Select
          value={selectedJobId || "_none"}
          onValueChange={(val) => setSelectedJobId(val === "_none" ? "" : val)}
        >
          <SelectTrigger className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[250px] h-10">
            <SelectValue placeholder={_("broadcastLogs.selectJob")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">{_("broadcastLogs.selectJob")}</SelectItem>
            {(jobs || []).map((job) => (
              <SelectItem key={job.id} value={job.id}>
                [{job.status.toUpperCase()}] {formatDate(job.created_at)} —{" "}
                {job.sent_count}/{job.total_groups} sent
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedJobId && selectedJob && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Badge
              variant={
                selectedJob.status === "completed" ? "success" :
                selectedJob.status === "running" ? "info" : "destructive"
              }
              className="uppercase"
            >
              {selectedJob.status}
            </Badge>
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
                id="broadcast-logs-search"
                name="search"
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={_("broadcastLogs.searchGroup")}
                aria-label={_("broadcastLogs.searchGroup")}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <Select
              value={statusFilter || "all"}
              onValueChange={(val) => setStatusFilter(val === "all" ? "" : val)}
            >
              <SelectTrigger className="w-[170px] h-10 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <SelectValue placeholder={_("broadcastLogs.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{_("broadcastLogs.allStatuses")}</SelectItem>
                <SelectItem value="success">{_("broadcastLogs.success")}</SelectItem>
                <SelectItem value="error">{_("broadcastLogs.error")}</SelectItem>
              </SelectContent>
            </Select>
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
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 border-b border-border hover:bg-muted/50">
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colCycle")}</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colGroup")}</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">Account</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colStatus")}</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colErrorType")}</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colMessage")}</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colSentText")}</TableHead>
                          <TableHead className="px-4 py-3 font-medium text-muted-foreground">{_("broadcastLogs.colTime")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border/60">
                        {logs.map((log, idx) => {
                          const accountName = log.account_name || (log.account_id_used
                            ? accountMap.get(log.account_id_used) || "Deleted Account"
                            : "—");
                          return (
                            <TableRow key={`${expandedCycle}-${idx}-${log.group_identifier}`} className="hover:bg-muted/40 transition">
                              <TableCell className="px-4 py-3 whitespace-normal">
                                <Badge variant="secondary" className="gap-1 bg-indigo-50 text-indigo-800 border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60 font-semibold font-mono">
                                  <Layers className="h-3 w-3" />
                                  C{expandedCycle}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-4 py-3 font-medium text-foreground max-w-[150px] truncate">
                                {log.group_identifier}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-muted-foreground max-w-[150px] truncate" title={accountName}>
                                {accountName}
                              </TableCell>
                              <TableCell className="px-4 py-3 whitespace-normal">
                                {log.status === "success" ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                    <CheckCircle className="h-3.5 w-3.5" /> {_("broadcastLogs.success")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-medium">
                                    <XCircle className="h-3.5 w-3.5" /> {_("broadcastLogs.error")}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="px-4 py-3 whitespace-normal">
                                {log.error_type ? (
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-xs font-medium border",
                                      log.error_type === "flood" && "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/50",
                                      log.error_type === "banned" && "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50",
                                      log.error_type === "admin_only" && "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50",
                                      log.error_type === "slowmode" && "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/50",
                                      log.error_type === "invalid_username" && "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/50",
                                      log.error_type === "invalid_link" && "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/50",
                                      !log.error_type && "bg-muted text-muted-foreground border-border"
                                    )}
                                  >
                                    {log.error_type || "—"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/60">—</span>
                                )}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                                {log.error_message || "—"}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                                {log.sent_text || "—"}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                                {formatDate(log.sent_at)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
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
