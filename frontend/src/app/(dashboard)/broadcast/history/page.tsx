"use client";

import { useRouter } from "next/navigation";
import {
  useBroadcastJobs,
  useBroadcastSummary,
  useBroadcastAction,
  useDeleteBroadcastJob,
  useRetryBroadcastJob,
  useGroupLists,
  useTextLists,
  type BroadcastJob,
} from "@/hooks/use-broadcast";
import { cn, formatDate } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton-cards";
import {
  Play,
  Pause,
  Square,
  RotateCw,
  Trash2,
  FileText,
  Loader2,
  Clock,
  Folder,
  User,
  Users,
  Radio,
  CheckCircle2,
  Send,
  Smartphone,
  Layers,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { DataPagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAvatarInitial, getTelegramAvatarColor } from "@/lib/avatar";

function CopyableItem({
  value,
  label,
  className,
}: {
  value: string | null;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="font-mono text-muted-foreground/60">—</span>;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Tersalin!" : `Salin ${label || value}`}
      className={cn(
        "inline-flex items-center gap-1 font-mono hover:text-primary transition-colors cursor-pointer group text-left",
        className
      )}
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
      )}
    </button>
  );
}

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-800",
  paused: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-800",
};

export default function BroadcastHistoryPage() {
  const router = useRouter();
  const _ = useT();
  const { data: jobs, isLoading } = useBroadcastJobs({ limit: 100 });
  const { data: summary } = useBroadcastSummary();
  const actionMutation = useBroadcastAction();
  const deleteMutation = useDeleteBroadcastJob();
  const retryMutation = useRetryBroadcastJob();

  // Compute metrics with fallback
  const runningCount = summary?.running_jobs ?? jobs?.filter((j) => j.status === "running").length ?? 0;
  const accountsInUse = summary?.active_accounts_count ?? (() => {
    const accs = new Set<string>();
    jobs?.filter((j) => j.status === "running").forEach((j) => j.account_ids?.forEach((id) => accs.add(id)));
    return accs.size;
  })();
  const totalAccountsUsed = summary?.total_accounts_used ?? (() => {
    const accs = new Set<string>();
    jobs?.forEach((j) => j.account_ids?.forEach((id) => accs.add(id)));
    return accs.size;
  })();
  const completedCount = summary?.completed_jobs ?? jobs?.filter((j) => j.status === "completed").length ?? 0;
  const failedCount = summary?.failed_jobs ?? jobs?.filter((j) => j.status === "failed").length ?? 0;
  const totalSent = summary?.total_sent ?? jobs?.reduce((sum, j) => sum + (j.sent_count || 0), 0) ?? 0;
  const totalFailed = summary?.total_failed ?? jobs?.reduce((sum, j) => sum + (j.fail_count || 0), 0) ?? 0;

  // Fetch setups & accounts for details display
  const { data: accounts } = useAccounts();
  const { data: groupLists } = useGroupLists();
  const { data: textLists } = useTextLists();

  const getGroupListName = useCallback(
    (glId: string | null) => {
      if (!glId) return "—";
      const gl = groupLists?.find((g) => g.id === glId);
      return gl ? gl.name : "Unknown Group List";
    },
    [groupLists]
  );

  const getTextListName = useCallback(
    (tlId: string | null) => {
      if (!tlId) return "—";
      const tl = textLists?.find((t) => t.id === tlId);
      return tl ? tl.name : "Unknown Text List";
    },
    [textLists]
  );

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const openConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      setConfirmConfig({ title, message, onConfirm });
      setConfirmOpen(true);
    },
    []
  );

  // ── Client-side pagination ──────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const totalItems = jobs?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedJobs = useMemo(
    () => (jobs ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [jobs, page]
  );

  // ── Account details & expansion state ──────────────────────────────────
  const [selectedJobForAccounts, setSelectedJobForAccounts] = useState<BroadcastJob | null>(null);
  const [expandedMobileJobs, setExpandedMobileJobs] = useState<Record<string, boolean>>({});

  const toggleMobileJobExpand = useCallback((jobId: string) => {
    setExpandedMobileJobs((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  }, []);

  const getAccountData = useCallback(
    (accId: string) => {
      const acc = accounts?.find((a) => a.id === accId);
      if (!acc) {
        return {
          id: accId,
          name: "Unknown Account",
          phone: "—",
          telegramId: null,
          username: null,
          isActive: false,
          initials: "?",
          color: "#6C61DF",
        };
      }
      const fullName = [acc.first_name, acc.last_name].filter(Boolean).join(" ").trim();
      const name = fullName || acc.username || acc.phone || "Account";
      const initials = getAvatarInitial(acc.first_name, acc.phone);
      const color = getTelegramAvatarColor(acc.telegram_id || acc.id, acc.color_id);
      return {
        id: acc.id,
        name,
        phone: acc.phone || "—",
        telegramId: acc.telegram_id,
        username: acc.username,
        isActive: acc.is_active,
        initials,
        color,
      };
    },
    [accounts]
  );

  // ── Shared display helpers (desktop table & mobile cards) ───────────────
  const statusVariant = (status: string): BadgeProps["variant"] =>
    status === "completed"
      ? "success"
      : status === "running"
      ? "info"
      : status === "failed"
      ? "destructive"
      : status === "paused"
      ? "warning"
      : "secondary";

  const progressColor = (status: string) =>
    status === "completed"
      ? "bg-emerald-500"
      : status === "failed"
      ? "bg-rose-500"
      : "bg-primary";

  const accountName = (accId: string) => {
    const acc = accounts?.find((a) => a.id === accId);
    return acc ? acc.first_name || acc.phone : "Unknown";
  };

  const accountLabel = (accId: string) => {
    const acc = accounts?.find((a) => a.id === accId);
    return acc ? `${acc.first_name || ""} (${acc.phone})` : accId;
  };

  // ── Shared row actions (used by both desktop table & mobile cards) ───────
  const renderJobActions = (job: BroadcastJob) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Running controls */}
      {job.status === "running" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() =>
                  actionMutation.mutate({ jobId: job.id, action: "pause" })
                }
                className="p-1.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-400 dark:hover:bg-yellow-900/70 rounded-lg hover:bg-yellow-200 transition"
              >
                <Pause className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{_("broadcastHistory.pause")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() =>
                  openConfirm(
                    _("broadcastHistory.stop"),
                    _("broadcastHistory.stopConfirm"),
                    () => actionMutation.mutate({ jobId: job.id, action: "stop" })
                  )
                }
                className="p-1.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/70 rounded-lg hover:bg-red-200 transition"
              >
                <Square className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{_("broadcastHistory.stop")}</TooltipContent>
          </Tooltip>
        </>
      )}

      {/* Paused controls */}
      {job.status === "paused" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() =>
                  actionMutation.mutate({ jobId: job.id, action: "resume" })
                }
                className="p-1.5 bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400 dark:hover:bg-green-900/70 rounded-lg hover:bg-green-200 transition"
              >
                <Play className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{_("broadcastHistory.resume")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() =>
                  openConfirm(
                    _("broadcastHistory.stop"),
                    _("broadcastHistory.stopConfirm"),
                    () => actionMutation.mutate({ jobId: job.id, action: "stop" })
                  )
                }
                className="p-1.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/70 rounded-lg hover:bg-red-200 transition"
              >
                <Square className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{_("broadcastHistory.stop")}</TooltipContent>
          </Tooltip>
        </>
      )}

      {/* Pending — allow stop to cancel before execution */}
      {job.status === "pending" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() =>
                openConfirm(
                  _("broadcastHistory.cancel"),
                  _("broadcastHistory.cancelConfirm"),
                  () => actionMutation.mutate({ jobId: job.id, action: "stop" })
                )
              }
              className="p-1.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/70 rounded-lg hover:bg-red-200 transition"
            >
              <Square className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{_("broadcastHistory.cancel")}</TooltipContent>
        </Tooltip>
      )}

      {/* Terminal states — retry + delete */}
      {["completed", "cancelled", "failed"].includes(job.status) && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => retryMutation.mutate(job.id)}
                disabled={retryMutation.isPending}
                className="p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-900/70 rounded-lg hover:bg-blue-200 transition disabled:opacity-50"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{_("broadcastHistory.retry")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() =>
                  openConfirm(
                    _("broadcastHistory.delete"),
                    _("broadcastHistory.deleteConfirm"),
                    () => deleteMutation.mutate(job.id)
                  )
                }
                disabled={deleteMutation.isPending}
                className="p-1.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/70 rounded-lg hover:bg-red-200 transition disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{_("broadcastHistory.delete")}</TooltipContent>
          </Tooltip>
        </>
      )}

      {/* View Logs — for all non-pending jobs */}
      {job.status !== "pending" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => router.push(`/broadcast/logs?jobId=${job.id}`)}
              className="p-1.5 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-lg transition"
            >
              <FileText className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{_("broadcastHistory.viewLogs")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{_("broadcastHistory.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {_("broadcastHistory.desc")}
        </p>
      </div>

      {/* Broadcast Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Running Broadcasts */}
        <div className="bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {_("broadcastHistory.summaryRunning") || "Running Broadcasts"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground">{runningCount}</span>
              {runningCount > 0 ? (
                <Badge variant="success" className="gap-1 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground/70">Idle</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {summary?.paused_jobs ? `${summary.paused_jobs} paused` : "In execution"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60">
            <Radio className="h-5 w-5" />
          </div>
        </div>

        {/* Accounts In Use */}
        <div className="bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {_("broadcastHistory.summaryAccountsInUse") || "Accounts In Use"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground">{accountsInUse}</span>
              <span className="text-xs font-medium text-muted-foreground">active</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {totalAccountsUsed} total accounts configured
            </p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900/60">
            <Smartphone className="h-5 w-5" />
          </div>
        </div>

        {/* Completed Broadcasts */}
        <div className="bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {_("broadcastHistory.summaryCompleted") || "Completed"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground">{completedCount}</span>
              <span className="text-xs font-medium text-muted-foreground">jobs</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {failedCount > 0 ? `${failedCount} failed jobs` : "All runs completed"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Total Sent */}
        <div className="bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {_("broadcastHistory.summaryTotalSent") || "Messages Delivered"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground">
                {totalSent.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {totalFailed > 0 ? `${totalFailed.toLocaleString()} failed` : "Delivered without failure"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-900/60">
            <Send className="h-5 w-5" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : !jobs || jobs.length === 0 ? (
        <div className="text-center py-16 bg-card text-muted-foreground rounded-xl border border-border">
          <Clock className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-muted-foreground">{_("broadcastHistory.noJobs")}</p>
          <button
            onClick={() => router.push("/broadcast/new")}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            {_("broadcastHistory.startBroadcast")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Desktop table ─────────────────────────────────────────── */}
          <div className="hidden lg:block bg-card text-card-foreground rounded-xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-muted/50 border-b border-border hover:bg-muted/50 text-xs">
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.date")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.setup")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.accounts")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.status")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.progress")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.sentFailed")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-muted-foreground uppercase tracking-wider">{_("broadcastHistory.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {pagedJobs.map((job: BroadcastJob) => (
                  <TableRow key={job.id}>
                    <TableCell className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {formatDate(job.created_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      <div className="space-y-1.5 text-xs max-w-[260px]">
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground font-normal">{_("broadcastHistory.groupList")}:</span>
                          <span className="truncate max-w-[150px] block" title={getGroupListName(job.group_list_id)}>
                            {getGroupListName(job.group_list_id)}
                          </span>
                        </div>
                        <div className="flex items-start gap-1.5 text-foreground font-medium">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="text-muted-foreground font-normal">{_("broadcastHistory.textList")}:</span>
                          <span className="truncate max-w-[150px] block" title={job.mode === "single_text" ? job.custom_text || "" : getTextListName(job.text_list_id)}>
                            {job.mode === "single_text" ? (
                              <span className="italic text-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border text-[10px]">
                                {job.custom_text ? `"${job.custom_text.slice(0, 20)}${job.custom_text.length > 20 ? '...' : ''}"` : _("broadcastHistory.customText")}
                              </span>
                            ) : (
                              getTextListName(job.text_list_id)
                            )}
                          </span>
                        </div>
                        {/* Delay per group & cycle delay */}
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>
                            {_("broadcastHistory.delayPerGroup")}: <strong className="text-foreground">{job.delay_per_group}s</strong>
                            {job.delay_randomized ? ` (${_("broadcastHistory.delayRandomized")})` : ""}
                            {" · "}
                            {_("broadcastHistory.cycleDelay")}: <strong className="text-foreground">{job.delay_after_all}s</strong>
                          </span>
                        </div>
                        {/* Telegram cycle log destination if enabled */}
                        {job.log_destination && job.log_destination !== "web_only" && (
                          <div
                            className="inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-200/80 dark:border-sky-800/60 font-mono truncate max-w-[240px]"
                            title={`${_("broadcastHistory.telegramLog")}: ${job.log_destination}`}
                          >
                            <Radio className="h-3 w-3 text-sky-500 shrink-0" />
                            <span className="truncate">{_("broadcastHistory.telegramLog")}: {job.log_destination}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      {job.account_ids.length === 0 ? (
                        <span className="text-xs text-muted-foreground/60 italic">—</span>
                      ) : job.account_ids.length === 1 ? (
                        (() => {
                          const acc = getAccountData(job.account_ids[0]);
                          return (
                            <div
                              onClick={() => setSelectedJobForAccounts(job)}
                              className="space-y-1 text-xs max-w-[220px] p-2 rounded-lg bg-muted/30 hover:bg-muted/60 border border-border/50 transition cursor-pointer group"
                              title={_("broadcastHistory.viewDetails")}
                            >
                              <div className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                                <div
                                  className="h-5 w-5 rounded-full font-bold text-white flex items-center justify-center text-[9px] shrink-0"
                                  style={{ backgroundColor: acc.color }}
                                >
                                  {acc.initials}
                                </div>
                                <span className="truncate group-hover:text-primary transition-colors">{acc.name}</span>
                                {acc.username && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate">@{acc.username}</span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono space-y-0.5 pl-6.5">
                                <div className="truncate">ID: {acc.telegramId ?? "—"}</div>
                                <div className="truncate">{acc.phone}</div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        (() => {
                          const firstAcc = getAccountData(job.account_ids[0]);
                          return (
                            <div className="space-y-1.5 text-xs max-w-[220px]">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 text-[11px] font-semibold border border-blue-200/80 dark:border-blue-800/60">
                                  <Users className="h-3 w-3" />
                                  {job.account_ids.length} {_("broadcastHistory.accounts")}
                                </span>
                              </div>
                              {/* First account quick preview */}
                              <div
                                onClick={() => setSelectedJobForAccounts(job)}
                                className="p-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 border border-border/50 text-[11px] cursor-pointer group transition"
                                title={_("broadcastHistory.viewDetails")}
                              >
                                <div className="font-semibold text-foreground truncate flex items-center gap-1">
                                  <div
                                    className="h-4 w-4 rounded-full font-bold text-white flex items-center justify-center text-[8px] shrink-0"
                                    style={{ backgroundColor: firstAcc.color }}
                                  >
                                    {firstAcc.initials}
                                  </div>
                                  <span className="truncate group-hover:text-primary transition-colors">{firstAcc.name}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono pl-5 truncate">
                                  ID: {firstAcc.telegramId ?? "—"} · {firstAcc.phone}
                                </div>
                              </div>
                              {/* Trigger button for dialog */}
                              <button
                                type="button"
                                onClick={() => setSelectedJobForAccounts(job)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 hover:underline cursor-pointer"
                              >
                                <span>+{job.account_ids.length - 1} {_("broadcastHistory.showMoreAccounts")}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })()
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "success"
                              : job.status === "running"
                              ? "info"
                              : job.status === "failed"
                              ? "destructive"
                              : job.status === "paused"
                              ? "warning"
                              : "secondary"
                          }
                          className="capitalize font-semibold text-xs"
                        >
                          {job.schedule_paused ? "Paused (Jadwal)" : job.status}
                        </Badge>
                        {job.schedule_enabled && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                            <Clock className="h-3 w-3 text-primary/70 shrink-0" />
                            {job.schedule_start_time} - {job.schedule_end_time} WIB
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-2 overflow-hidden border border-border/40">
                          <div
                            className={cn(
                              "h-2 rounded-full",
                              job.status === "completed"
                                ? "bg-emerald-500"
                                : job.status === "failed"
                                ? "bg-rose-500"
                                : "bg-primary"
                            )}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground font-mono text-xs w-8">
                          {job.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      <div className="flex items-center gap-2 text-sm font-mono">
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                          {job.sent_count}
                        </span>
                        <span className="text-muted-foreground/60">/</span>
                        <span className="text-rose-700 dark:text-rose-400 font-bold">
                          {job.fail_count}
                        </span>
                        <span className="text-muted-foreground text-xs font-sans">
                          ({_("broadcastHistory.of")} {job.total_groups})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      {renderJobActions(job)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>

          {/* ── Mobile card deck ──────────────────────────────────────── */}
          <div className="lg:hidden space-y-3">
            {pagedJobs.map((job: BroadcastJob) => (
              <div
                key={job.id}
                className="bg-card text-card-foreground rounded-xl border border-border p-4 space-y-3 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant={statusVariant(job.status)}
                      className="capitalize font-semibold text-xs shrink-0"
                    >
                      {job.schedule_paused ? "Paused (Jadwal)" : job.status}
                    </Badge>
                    {job.schedule_enabled && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3 text-primary/70 shrink-0" />
                        {job.schedule_start_time} - {job.schedule_end_time} WIB
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground truncate">
                      {formatDate(job.created_at)}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    {job.progress}%
                  </span>
                </div>

                {/* Setup */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground shrink-0">
                      {_("broadcastHistory.groupList")}:
                    </span>
                    <span className="text-foreground font-medium truncate">
                      {getGroupListName(job.group_list_id)}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground shrink-0">
                      {_("broadcastHistory.textList")}:
                    </span>
                    <span className="text-foreground font-medium truncate">
                      {job.mode === "single_text"
                        ? job.custom_text
                          ? `"${job.custom_text.slice(0, 24)}${
                              job.custom_text.length > 24 ? "..." : ""
                            }"`
                          : _("broadcastHistory.customText")
                        : getTextListName(job.text_list_id)}
                    </span>
                  </div>
                  {/* Delay details */}
                  <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground text-[11px]">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {_("broadcastHistory.delayPerGroup")}: <strong className="text-foreground">{job.delay_per_group}s</strong>
                      {job.delay_randomized ? ` (${_("broadcastHistory.delayRandomized")})` : ""}
                      {" · "}
                      {_("broadcastHistory.cycleDelay")}: <strong className="text-foreground">{job.delay_after_all}s</strong>
                    </span>
                  </div>
                  {/* Telegram cycle log destination if enabled */}
                  {job.log_destination && job.log_destination !== "web_only" && (
                    <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-sky-700 dark:text-sky-400">
                      <Radio className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                      <span className="truncate">
                        {_("broadcastHistory.telegramLog")}: <strong className="font-mono">{job.log_destination}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Accounts */}
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      {_("broadcastHistory.accounts")} ({job.account_ids.length})
                    </span>
                    {job.account_ids.length > 2 && (
                      <button
                        type="button"
                        onClick={() => toggleMobileJobExpand(job.id)}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        {expandedMobileJobs[job.id] ? (
                          <>
                            {_("broadcastHistory.showLessAccounts")} <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            {_("broadcastHistory.showAllAccounts")} ({job.account_ids.length}) <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {job.account_ids.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60 italic">—</span>
                  ) : (
                    <div className="space-y-1.5">
                      {(expandedMobileJobs[job.id] ? job.account_ids : job.account_ids.slice(0, 2)).map((accId) => {
                        const acc = getAccountData(accId);
                        return (
                          <div
                            key={accId}
                            className="p-2 rounded-lg bg-muted/40 hover:bg-muted/60 border border-border/60 flex items-center justify-between gap-2 text-xs transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="h-7 w-7 rounded-full font-bold text-white flex items-center justify-center text-[10px] shrink-0"
                                style={{ backgroundColor: acc.color }}
                              >
                                {acc.initials}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                                  <span className="truncate">{acc.name}</span>
                                  {acc.username && (
                                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                      @{acc.username}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 truncate">
                                  <span>ID: {acc.telegramId ?? "—"}</span>
                                  <span className="text-muted-foreground/40">•</span>
                                  <span>{acc.phone}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedJobForAccounts(job)}
                              title={_("broadcastHistory.viewDetails")}
                              className="p-1 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {!expandedMobileJobs[job.id] && job.account_ids.length > 2 && (
                        <button
                          type="button"
                          onClick={() => toggleMobileJobExpand(job.id)}
                          className="w-full py-1 text-center text-[11px] font-medium text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 rounded-md border border-primary/20 transition cursor-pointer"
                        >
                          + {job.account_ids.length - 2} {_("broadcastHistory.showMoreAccounts")}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/40">
                  <div
                    className={cn("h-2 rounded-full", progressColor(job.status))}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>

                {/* Footer: counts + actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                      {job.sent_count}
                    </span>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="text-rose-700 dark:text-rose-400 font-bold">
                      {job.fail_count}
                    </span>
                    <span className="text-muted-foreground text-xs font-sans">
                      ({_("broadcastHistory.of")} {job.total_groups})
                    </span>
                  </div>
                  {renderJobActions(job)}
                </div>
              </div>
            ))}
          </div>

          {/* ── Pagination ────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:px-6 shadow-2xs">
              <p className="text-xs text-muted-foreground text-center sm:text-left">
                {_("broadcastHistory.showing")}{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {(page - 1) * PAGE_SIZE + 1}
                </span>
                {" – "}
                <span className="font-bold text-foreground tabular-nums">
                  {Math.min(page * PAGE_SIZE, totalItems)}
                </span>{" "}
                {_("broadcastHistory.of")}{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {totalItems}
                </span>{" "}
                {_("broadcastHistory.jobsLabel")}
              </p>
              <DataPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                labels={{
                  prev: _("broadcastHistory.prev"),
                  next: _("broadcastHistory.next"),
                }}
                className="w-auto mx-0"
              />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          confirmConfig?.onConfirm();
          setConfirmOpen(false);
          setConfirmConfig(null);
        }}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText={_("broadcastHistory.stop")}
        cancelText={_("navbar.cancel")}
        variant="warning"
      />

      {/* Account Details Modal */}
      <Dialog
        open={!!selectedJobForAccounts}
        onOpenChange={(open) => !open && setSelectedJobForAccounts(null)}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {_("broadcastHistory.accountsModalTitle")}
            </DialogTitle>
            <DialogDescription>
              {_("broadcastHistory.accountsModalDesc")} (
              {selectedJobForAccounts?.account_ids.length ?? 0} {_("broadcastHistory.accounts")})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {selectedJobForAccounts?.account_ids.map((accId) => {
              const acc = getAccountData(accId);
              return (
                <div
                  key={accId}
                  className="p-3 rounded-xl border border-border bg-card/60 hover:bg-muted/40 transition flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="h-10 w-10 rounded-full font-bold text-white flex items-center justify-center text-sm shrink-0 shadow-xs"
                      style={{ backgroundColor: acc.color }}
                    >
                      {acc.initials}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm truncate" title={acc.name}>
                          {acc.name}
                        </span>
                        {acc.username && (
                          <span className="text-xs text-muted-foreground font-mono">
                            @{acc.username}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="font-medium text-[11px] uppercase tracking-wider">ID:</span>
                          <CopyableItem value={acc.telegramId ? String(acc.telegramId) : null} label="User ID" />
                        </div>

                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Smartphone className="h-3 w-3 shrink-0" />
                          <CopyableItem value={acc.phone !== "—" ? acc.phone : null} label="Nomor HP" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    {acc.isActive ? (
                      <Badge variant="success" className="text-[10px] px-1.5 py-0.5 font-medium">
                        {_("broadcastHistory.active")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-medium">
                        {_("broadcastHistory.inactive")}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setSelectedJobForAccounts(null)}>
              {_("navbar.cancel") || "Tutup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
