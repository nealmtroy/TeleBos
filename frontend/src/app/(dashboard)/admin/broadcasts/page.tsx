"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminBroadcasts,
  useAdminBroadcastStats,
  useAdminPauseBroadcast,
  useAdminResumeBroadcast,
  useAdminStopBroadcast,
  useAdminDeleteBroadcast,
  useAdminBulkBroadcastAction,
  AdminBroadcastJob,
} from "@/hooks/use-admin";
import {
  Radio,
  Play,
  Pause,
  Square,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Repeat,
  Send,
  User as UserIcon,
  Info,
  ExternalLink,
  ChevronDown,
  Activity,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Smartphone,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const STATUS_BADGES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  running: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Running", dot: "bg-emerald-500", label: "Running" },
  paused: { bg: "bg-amber-50 text-amber-700 border-amber-200", text: "Paused", dot: "bg-amber-500", label: "Paused" },
  completed: { bg: "bg-blue-50 text-blue-700 border-blue-200", text: "Completed", dot: "bg-blue-500", label: "Completed" },
  failed: { bg: "bg-rose-50 text-rose-700 border-rose-200", text: "Failed", dot: "bg-rose-500", label: "Failed" },
  cancelled: { bg: "bg-slate-100 text-slate-700 border-slate-200", text: "Stopped", dot: "bg-slate-400", label: "Stopped" },
  pending: { bg: "bg-slate-100 text-slate-700 border-slate-200", text: "Pending", dot: "bg-slate-400", label: "Pending" },
};

export default function AdminBroadcastsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-20">
        <Shield className="h-16 w-16 mx-auto mb-4 text-slate-300" />
        <h3 className="font-semibold text-slate-900 mb-1">Access Denied</h3>
        <p className="text-sm text-slate-500">Only system owners can manage platform broadcasts.</p>
      </div>
    );
  }

  return <BroadcastManagementContent />;
}

function BroadcastManagementContent() {
  const _ = useT();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loopFilter, setLoopFilter] = useState<string>("all");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Selected job for detail modal
  const [selectedJob, setSelectedJob] = useState<AdminBroadcastJob | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "danger" | "warning" | "info";
    confirmText: string;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: "",
    message: "",
    variant: "danger",
    confirmText: "Confirm",
    onConfirm: async () => {},
  });

  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Query stats & list (manual refresh only)
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdminBroadcastStats();
  const {
    data: listData,
    isLoading: listLoading,
    isRefetching,
    refetch: refetchList,
  } = useAdminBroadcasts({
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    loop_enabled: loopFilter === "all" ? undefined : loopFilter === "loop",
    duplicates_only: duplicatesOnly || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    page,
    limit: PAGE_SIZE,
  });

  // Mutations
  const pauseMutation = useAdminPauseBroadcast();
  const resumeMutation = useAdminResumeBroadcast();
  const stopMutation = useAdminStopBroadcast();
  const deleteMutation = useAdminDeleteBroadcast();
  const bulkActionMutation = useAdminBulkBroadcastAction();

  const totalPages = listData ? Math.ceil(listData.total / PAGE_SIZE) : 1;

  // Auto clear action feedback message
  useEffect(() => {
    if (actionFeedback) {
      const timer = setTimeout(() => setActionFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionFeedback]);

  const handleRefreshAll = () => {
    refetchStats();
    refetchList();
  };

  const handleToggleSentSort = () => {
    if (sortBy === "sent_count") {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy("sent_count");
      setSortOrder("desc");
    }
    setPage(1);
  };

  // ── Action Handlers ──────────────────────────────────────────────────────────

  const handlePause = (job: AdminBroadcastJob) => {
    setConfirmDialog({
      open: true,
      title: _("admin.pauseJob"),
      message: _("admin.pauseConfirm"),
      variant: "warning",
      confirmText: _("admin.pauseJob"),
      onConfirm: async () => {
        try {
          await pauseMutation.mutateAsync(job.id);
          setActionFeedback({ type: "success", text: `Job ${job.id.slice(0, 8)} paused` });
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Failed to pause job",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleResume = (job: AdminBroadcastJob) => {
    setConfirmDialog({
      open: true,
      title: _("admin.resumeJob"),
      message: _("admin.resumeConfirm"),
      variant: "info",
      confirmText: _("admin.resumeJob"),
      onConfirm: async () => {
        try {
          await resumeMutation.mutateAsync(job.id);
          setActionFeedback({ type: "success", text: `Job ${job.id.slice(0, 8)} resumed` });
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Failed to resume job",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleStop = (job: AdminBroadcastJob) => {
    setConfirmDialog({
      open: true,
      title: _("admin.stopJob"),
      message: _("admin.stopConfirm"),
      variant: "danger",
      confirmText: _("admin.stopJob"),
      onConfirm: async () => {
        try {
          await stopMutation.mutateAsync(job.id);
          setActionFeedback({ type: "success", text: `Job ${job.id.slice(0, 8)} stopped` });
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Failed to stop job",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleDelete = (job: AdminBroadcastJob) => {
    setConfirmDialog({
      open: true,
      title: _("admin.deleteJob"),
      message: _("admin.deleteJobConfirm"),
      variant: "danger",
      confirmText: _("admin.deleteJob"),
      onConfirm: async () => {
        try {
          await deleteMutation.mutateAsync(job.id);
          setActionFeedback({ type: "success", text: `Job ${job.id.slice(0, 8)} deleted` });
          if (selectedJob?.id === job.id) setSelectedJob(null);
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Failed to delete job",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  // ── Bulk Actions ─────────────────────────────────────────────────────────────

  const handleBulkPause = () => {
    setConfirmDialog({
      open: true,
      title: _("admin.pauseAllRunning"),
      message: _("admin.bulkPauseConfirm"),
      variant: "warning",
      confirmText: _("admin.pauseAllRunning"),
      onConfirm: async () => {
        try {
          const res = await bulkActionMutation.mutateAsync({ action: "pause_all_running" });
          setActionFeedback({ type: "success", text: res.message || "All running jobs paused" });
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Bulk pause failed",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleBulkStop = () => {
    setConfirmDialog({
      open: true,
      title: _("admin.stopAllRunning"),
      message: _("admin.bulkStopConfirm"),
      variant: "danger",
      confirmText: _("admin.stopAllRunning"),
      onConfirm: async () => {
        try {
          const res = await bulkActionMutation.mutateAsync({ action: "stop_all_running" });
          setActionFeedback({ type: "success", text: res.message || "All active jobs stopped" });
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Bulk stop failed",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleBulkClear = () => {
    setConfirmDialog({
      open: true,
      title: _("admin.clearFinished"),
      message: _("admin.bulkClearConfirm"),
      variant: "danger",
      confirmText: _("admin.clearFinished"),
      onConfirm: async () => {
        try {
          const res = await bulkActionMutation.mutateAsync({
            action: "delete_completed_failed",
          });
          setActionFeedback({ type: "success", text: res.message || "Finished jobs deleted" });
        } catch (err: any) {
          setActionFeedback({
            type: "error",
            text: err?.response?.data?.detail || "Bulk cleanup failed",
          });
        } finally {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const isMutating =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    stopMutation.isPending ||
    deleteMutation.isPending ||
    bulkActionMutation.isPending;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl border border-blue-500/20">
              <Radio className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {_("admin.manageBroadcasts")}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{_("admin.broadcastsDesc")}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={listLoading || isRefetching}
            className="border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1.5", (listLoading || isRefetching) && "animate-spin")}
            />
            {_("actions.refresh")}
          </Button>
        </div>
      </div>

      {/* ── Action Notification ─────────────────────────────────────────────── */}
      {actionFeedback && (
        <div
          className={cn(
            "p-3.5 rounded-xl border flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 text-sm font-medium",
            actionFeedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          )}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs hover:underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Overview Metrics Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Jobs</span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {statsLoading ? "—" : (stats?.total_jobs ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">All time created</div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Running</span>
            <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {statsLoading ? "—" : (stats?.running_jobs ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-0.5">Active tasks in RAM</div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Paused</span>
            <Pause className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {statsLoading ? "—" : (stats?.paused_jobs ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-amber-700 font-medium mt-0.5">Temporarily stopped</div>
        </div>

        {/* Duplicate Conflict Metric Card */}
        <div
          onClick={() => {
            setDuplicatesOnly((prev) => !prev);
            setPage(1);
          }}
          className={cn(
            "rounded-xl p-3.5 border shadow-sm cursor-pointer transition-all",
            duplicatesOnly
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-400"
              : (stats?.duplicate_conflict_jobs ?? 0) > 0
              ? "bg-amber-50/70 border-amber-300 hover:border-amber-400"
              : "bg-white border-slate-200 hover:border-slate-300"
          )}
        >
          <div className="flex items-center justify-between text-slate-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Duplicates</span>
            <AlertTriangle
              className={cn(
                "h-4 w-4",
                (stats?.duplicate_conflict_jobs ?? 0) > 0 ? "text-amber-600" : "text-slate-400"
              )}
            />
          </div>
          <div
            className={cn(
              "text-xl font-bold",
              (stats?.duplicate_conflict_jobs ?? 0) > 0 ? "text-rose-600" : "text-slate-900"
            )}
          >
            {statsLoading ? "—" : (stats?.duplicate_conflict_jobs ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center justify-between">
            <span>Shared acct jobs</span>
            {duplicatesOnly && <span className="text-xs font-bold text-rose-600">Active Filter</span>}
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Loop</span>
            <Repeat className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {statsLoading ? "—" : (stats?.active_looping_jobs ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Running 24/7 loops</div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Sent</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {statsLoading ? "—" : (stats?.total_sent ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Delivered msgs</div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Failed</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {statsLoading ? "—" : (stats?.total_failed ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Errors & flood waits</div>
        </div>
      </div>

      {/* ── Quick Bulk Control Toolbar ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Activity className="h-4 w-4 text-blue-600" />
          <span>Quick System Actions:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkPause}
            disabled={isMutating || (stats?.running_jobs ?? 0) === 0}
            className="border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-amber-800"
          >
            <Pause className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
            {_("admin.pauseAllRunning")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkStop}
            disabled={isMutating || ((stats?.running_jobs ?? 0) + (stats?.paused_jobs ?? 0)) === 0}
            className="border-rose-200 bg-rose-50/50 hover:bg-rose-100/70 text-rose-800"
          >
            <Square className="h-3.5 w-3.5 mr-1.5 text-rose-600" />
            {_("admin.stopAllRunning")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkClear}
            disabled={
              isMutating ||
              ((stats?.completed_jobs ?? 0) +
                (stats?.failed_jobs ?? 0) +
                (stats?.cancelled_jobs ?? 0)) ===
                0
            }
            className="border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            {_("admin.clearFinished")}
          </Button>
        </div>
      </div>

      {/* ── Search & Filter Controls ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by User Email, Full Name, or Job ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Duplicate Conflict Filter Toggle */}
          <button
            type="button"
            onClick={() => {
              setDuplicatesOnly((prev) => !prev);
              setPage(1);
            }}
            className={cn(
              "px-3 py-2 text-sm font-semibold rounded-xl border flex items-center gap-1.5 transition-all",
              duplicatesOnly
                ? "bg-rose-500 text-white border-rose-600 shadow-sm"
                : (stats?.duplicate_conflict_jobs ?? 0) > 0
                ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            )}
          >
            <AlertTriangle className={cn("h-4 w-4", duplicatesOnly ? "text-white" : "text-amber-600")} />
            <span>⚠️ Duplikat Only</span>
            {(stats?.duplicate_conflict_jobs ?? 0) > 0 && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-bold",
                  duplicatesOnly ? "bg-white text-rose-600" : "bg-amber-200 text-amber-900"
                )}
              >
                {stats?.duplicate_conflict_jobs}
              </span>
            )}
          </button>

          {/* Status Select */}
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[150px] text-xs font-medium bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Stopped (Cancelled)</SelectItem>
            </SelectContent>
          </Select>

          {/* Loop Select */}
          <Select
            value={loopFilter}
            onValueChange={(val) => {
              setLoopFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[150px] text-xs font-medium bg-slate-50 border-slate-200">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="loop">Looping Only</SelectItem>
              <SelectItem value="single">Single Run Only</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Select */}
          <Select
            value={`${sortBy}:${sortOrder}`}
            onValueChange={(val) => {
              const [sb, so] = val.split(":");
              setSortBy(sb);
              setSortOrder(so as "asc" | "desc");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[190px] text-xs font-semibold bg-slate-50 border-slate-200">
              <SelectValue placeholder="Latest Updated" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at:desc">Latest Updated</SelectItem>
              <SelectItem value="sent_count:desc">Sent: Terbanyak (High to Low)</SelectItem>
              <SelectItem value="sent_count:asc">Sent: Terdikit (Low to High)</SelectItem>
              <SelectItem value="fail_count:desc">Failed: Terbanyak</SelectItem>
              <SelectItem value="created_at:desc">Newest Created</SelectItem>
              <SelectItem value="created_at:asc">Oldest Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Broadcast Jobs Data Table ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse text-sm">
            <TableHeader>
              <TableRow className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider hover:bg-slate-50/80">
                <TableHead className="py-3.5 px-4 text-slate-600">User</TableHead>
                <TableHead className="py-3.5 px-4 text-slate-600">Job Info / Target</TableHead>
                <TableHead className="py-3.5 px-4 text-slate-600">Accounts</TableHead>
                {/* Clickable Progress/Sent sort header */}
                <TableHead
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group text-slate-600"
                  onClick={handleToggleSentSort}
                  title="Click to sort by sent count"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Progress / Sent</span>
                    {sortBy === "sent_count" ? (
                      <span className="inline-flex items-center text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {sortOrder === "desc" ? "▼ Terbanyak" : "▲ Terdikit"}
                      </span>
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="py-3.5 px-4 text-center text-slate-600">Mode & Loop</TableHead>
                <TableHead className="py-3.5 px-4 text-slate-600">Status</TableHead>
                <TableHead className="py-3.5 px-4 text-slate-600">Timestamps</TableHead>
                <TableHead className="py-3.5 px-4 text-right text-slate-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {listLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-slate-400 whitespace-normal">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-sm">Loading broadcast jobs...</p>
                  </TableCell>
                </TableRow>
              ) : !listData?.jobs || listData.jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-slate-400 whitespace-normal">
                    <Radio className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-600">No broadcast jobs found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try changing your search keywords or status filters.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                listData.jobs.map((job) => {
                  const statusInfo = STATUS_BADGES[job.status] || STATUS_BADGES.cancelled;
                  const total = job.total_groups || 1;
                  const progressPct = Math.min(100, Math.max(0, job.progress || 0));

                  return (
                    <TableRow
                      key={job.id}
                      className={cn(
                        "hover:bg-slate-50/60 transition-colors cursor-pointer group",
                        job.has_duplicate_accounts && "bg-amber-500/[0.03] border-l-4 border-l-amber-500"
                      )}
                      onClick={() => setSelectedJob(job)}
                    >
                      {/* User Column */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs shrink-0">
                            {(job.user_email || "U")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate max-w-[180px]">
                              {job.user_email || "Unknown User"}
                            </div>
                            {job.user_full_name && (
                              <div className="text-xs text-slate-500 truncate max-w-[180px]">
                                {job.user_full_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Job Info / Target */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <div className="font-medium text-slate-800 truncate max-w-[200px]">
                          {job.group_list_name || "Custom Target List"}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{job.total_groups} target groups</span>
                          <span>•</span>
                          <span className="font-mono text-xs text-slate-400">
                            ID: {job.id.slice(0, 8)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Accounts Column: Display User ID, Account Name, and Duplicate Badge */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <div className="space-y-1.5 max-w-[220px]">
                          {/* Duplicate Badge */}
                          {job.has_duplicate_accounts && (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                              <span>DUPLICATE ({job.duplicate_account_count} akun bentrok)</span>
                            </div>
                          )}

                          {job.accounts && job.accounts.length > 0 ? (
                            <div className="space-y-1">
                              {job.accounts.slice(0, 2).map((acc) => (
                                <div
                                  key={acc.id}
                                  className={cn(
                                    "flex items-center gap-1.5 text-xs p-1 rounded-lg transition-colors",
                                    acc.is_duplicate ? "bg-amber-100/60 border border-amber-200" : ""
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                                      acc.is_duplicate
                                        ? "bg-amber-500 text-white"
                                        : "bg-blue-50 border border-blue-200 text-blue-700"
                                    )}
                                  >
                                    {(acc.name || "A")[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0 truncate">
                                    <span className="font-semibold text-slate-800 truncate block text-xs leading-tight flex items-center gap-1">
                                      <span>{acc.name || acc.phone}</span>
                                      {acc.is_duplicate && (
                                        <span className="text-xs font-bold text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded">
                                          DUPLIKAT
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono block leading-tight">
                                      ID: {acc.telegram_id ? acc.telegram_id.toLocaleString() : "-"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {job.accounts.length > 2 && (
                                <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                  +{job.accounts.length - 2} more accounts
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {job.account_count} {job.account_count === 1 ? "acct" : "accts"}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Progress / Sent Column */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <div className="w-36 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-emerald-600">
                              ✅ {job.sent_count.toLocaleString()}
                            </span>
                            <span className="font-semibold text-rose-500">
                              ❌ {job.fail_count.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      {/* Mode & Loop Column */}
                      <TableCell className="py-3.5 px-4 text-center whitespace-normal">
                        {job.loop_enabled ? (
                          <Badge variant="outline" className="gap-1 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
                            <Repeat className="h-3 w-3" />
                            Looping ({job.delay_after_all}s)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-slate-500 bg-slate-50 border-slate-200">
                            Single Run
                          </Badge>
                        )}
                      </TableCell>

                      {/* Status Column */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <Badge
                          variant="outline"
                          className={cn(
                            "gap-1.5 text-xs font-medium border",
                            statusInfo.bg
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusInfo.dot)} />
                          {statusInfo.label}
                        </Badge>
                      </TableCell>

                      {/* Timestamps Column */}
                      <TableCell className="py-3.5 px-4 text-xs text-slate-500 whitespace-normal">
                        <div>
                          {new Date(job.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-slate-400">
                          Updated:{" "}
                          {new Date(job.updated_at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                      </TableCell>

                      {/* Actions Column */}
                      <TableCell
                        className="py-3.5 px-4 text-right whitespace-normal"
                        onClick={(e) => e.stopPropagation()} // Prevent opening details drawer on action click
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {job.status === "running" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Pause Job"
                              onClick={() => handlePause(job)}
                              disabled={isMutating}
                              className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}

                          {job.status === "paused" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Resume Job"
                              onClick={() => handleResume(job)}
                              disabled={isMutating}
                              className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}

                          {(job.status === "running" || job.status === "paused") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Stop Job"
                              onClick={() => handleStop(job)}
                              disabled={isMutating}
                              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Square className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete Job"
                            onClick={() => handleDelete(job)}
                            disabled={isMutating}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination Footer ──────────────────────────────────────────────── */}
        <div className="px-4 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {listData?.total ? (page - 1) * PAGE_SIZE + 1 : 0}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-slate-700">
              {Math.min((page - 1) * PAGE_SIZE + PAGE_SIZE, listData?.total || 0)}
            </span>{" "}
            of <span className="font-semibold text-slate-700">{listData?.total || 0}</span>{" "}
            broadcasts
          </div>

          <DataPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            disabled={listLoading}
            compact
          />
        </div>
      </div>

      {/* ── Job Details Modal ──────────────────────────────────────────────── */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        {selectedJob && (
          <DialogContent className="max-w-xl p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <DialogHeader className="pr-6">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold text-slate-900">Broadcast Job Details</DialogTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-medium border",
                    (STATUS_BADGES[selectedJob.status] || STATUS_BADGES.cancelled).bg
                  )}
                >
                  {selectedJob.status.toUpperCase()}
                </Badge>
              </div>
              <DialogDescription className="text-xs font-mono text-slate-400 mt-1">
                {selectedJob.id}
              </DialogDescription>
            </DialogHeader>

            {/* Duplicate Conflict Warning Box in Modal */}
            {selectedJob.has_duplicate_accounts && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Peringatan Konflik Akun Duplikat!</span>
                </div>
                <p className="text-slate-700">
                  Job ini menggunakan akun pengirim yang juga sedang aktif dipakai di job broadcast lain.
                  Menjalankan akun yang sama di beberapa job secara bersamaan dapat menyebabkan <b>FloodWait / Session Crash</b>.
                </p>
                {selectedJob.duplicate_job_ids && selectedJob.duplicate_job_ids.length > 0 && (
                  <div className="pt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-600 font-medium">Job Lain yang Bentrok:</span>
                    {selectedJob.duplicate_job_ids.map((jid) => (
                      <span
                        key={jid}
                        className="font-mono text-xs bg-white text-amber-800 px-2 py-0.5 rounded border border-amber-200"
                      >
                        #{jid.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">User</span>
                <span className="font-semibold text-slate-800 block truncate">
                  {selectedJob.user_email || "Unknown"}
                </span>
                <span className="text-slate-500 text-xs">{selectedJob.user_full_name || ""}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">Group List</span>
                <span className="font-semibold text-slate-800 block truncate">
                  {selectedJob.group_list_name || "Custom Target List"}
                </span>
                <span className="text-slate-500 text-xs">
                  {selectedJob.total_groups} target groups
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">Accounts Count</span>
                <span className="font-semibold text-slate-800">
                  {selectedJob.account_count} telegram accounts
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">Delays & Loop</span>
                <span className="font-semibold text-slate-800 block">
                  {selectedJob.delay_per_group}s delay / group
                </span>
                <span className="text-slate-500 text-xs">
                  {selectedJob.loop_enabled
                    ? `Looping enabled (${selectedJob.delay_after_all}s cycle delay)`
                    : "Single execution"}
                </span>
              </div>
            </div>

            {/* Account List in Details Modal */}
            {selectedJob.accounts && selectedJob.accounts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Connected Telegram Accounts ({selectedJob.accounts.length}):</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {selectedJob.accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className={cn(
                        "p-2.5 rounded-xl border flex items-center justify-between text-xs",
                        acc.is_duplicate
                          ? "bg-amber-50 border-amber-300"
                          : "bg-slate-50 border-slate-100"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "h-7 w-7 rounded-full font-bold flex items-center justify-center text-xs shrink-0",
                            acc.is_duplicate
                              ? "bg-amber-500 text-white"
                              : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {(acc.name || "A")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                            <span>{acc.name || acc.phone}</span>
                            {acc.is_duplicate && (
                              <span className="text-xs font-bold text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded-full border border-amber-300">
                                ⚠️ DUPLIKAT DI JOB LAIN
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            {acc.phone} {acc.username ? `(@${acc.username})` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          User ID: {acc.telegram_id ? acc.telegram_id.toLocaleString() : "N/A"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedJob.custom_text && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-400 block mb-1 font-semibold">Custom Text Content:</span>
                <p className="text-slate-700 whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">
                  {selectedJob.custom_text}
                </p>
              </div>
            )}

            {selectedJob.log_destination && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-400 block mb-1 font-semibold">Log Destination:</span>
                <span className="font-mono text-blue-600">{selectedJob.log_destination}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(selectedJob)}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete Job
              </Button>

              <div className="flex items-center gap-2">
                {selectedJob.status === "running" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePause(selectedJob)}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    <Pause className="h-4 w-4 mr-1.5" />
                    Pause
                  </Button>
                )}

                {selectedJob.status === "paused" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResume(selectedJob)}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  >
                    <Play className="h-4 w-4 mr-1.5" />
                    Resume
                  </Button>
                )}

                {(selectedJob.status === "running" || selectedJob.status === "paused") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStop(selectedJob)}
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    <Square className="h-3.5 w-3.5 mr-1.5" />
                    Stop
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setSelectedJob(null)}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Confirmation Modal ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
        onConfirm={confirmDialog.onConfirm}
        loading={isMutating}
      />
    </div>
  );
}
