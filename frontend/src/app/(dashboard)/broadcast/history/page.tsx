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
  Radio,
  CheckCircle2,
  Send,
  Smartphone,
  Layers,
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
import { useState, useCallback } from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
  const { data: jobs, isLoading } = useBroadcastJobs();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("broadcastHistory.title")}</h1>
        <p className="text-gray-500 mt-1">
          {_("broadcastHistory.desc")}
        </p>
      </div>

      {/* Broadcast Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Running Broadcasts */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {_("broadcastHistory.summaryRunning") || "Running Broadcasts"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-gray-900">{runningCount}</span>
              {runningCount > 0 ? (
                <Badge variant="success" className="gap-1 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </Badge>
              ) : (
                <span className="text-xs text-gray-400">Idle</span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              {summary?.paused_jobs ? `${summary.paused_jobs} paused` : "In execution"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <Radio className="h-5 w-5" />
          </div>
        </div>

        {/* Accounts In Use */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {_("broadcastHistory.summaryAccountsInUse") || "Accounts In Use"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-gray-900">{accountsInUse}</span>
              <span className="text-xs font-medium text-gray-500">active</span>
            </div>
            <p className="text-[11px] text-gray-500">
              {totalAccountsUsed} total accounts configured
            </p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Smartphone className="h-5 w-5" />
          </div>
        </div>

        {/* Completed Broadcasts */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {_("broadcastHistory.summaryCompleted") || "Completed"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-gray-900">{completedCount}</span>
              <span className="text-xs font-medium text-gray-500">jobs</span>
            </div>
            <p className="text-[11px] text-gray-500">
              {failedCount > 0 ? `${failedCount} failed jobs` : "All runs completed"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Total Sent */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {_("broadcastHistory.summaryTotalSent") || "Messages Delivered"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-gray-900">
                {totalSent.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              {totalFailed > 0 ? `${totalFailed.toLocaleString()} failed` : "Delivered without failure"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Send className="h-5 w-5" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : !jobs || jobs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">{_("broadcastHistory.noJobs")}</p>
          <button
            onClick={() => router.push("/broadcast/new")}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
          >
            {_("broadcastHistory.startBroadcast")}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-gray-50 border-b border-gray-200 hover:bg-gray-50 text-xs">
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.date")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.setup")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.accounts")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.status")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.progress")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.sentFailed")}</TableHead>
                  <TableHead className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100">
                {jobs.map((job: BroadcastJob) => (
                  <TableRow key={job.id} className="hover:bg-gray-50/50 transition">
                    <TableCell className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {formatDate(job.created_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      <div className="space-y-1.5 text-xs max-w-[250px]">
                        <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                          <Folder className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="text-gray-500 font-normal">{_("broadcastHistory.groupList")}:</span>
                          <span className="truncate max-w-[150px] block" title={getGroupListName(job.group_list_id)}>
                            {getGroupListName(job.group_list_id)}
                          </span>
                        </div>
                        <div className="flex items-start gap-1.5 text-gray-700 font-medium">
                          <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                          <span className="text-gray-500 font-normal">{_("broadcastHistory.textList")}:</span>
                          <span className="truncate max-w-[150px] block" title={job.mode === "single_text" ? job.custom_text || "" : getTextListName(job.text_list_id)}>
                            {job.mode === "single_text" ? (
                              <span className="italic text-gray-600 bg-gray-50 px-1 py-0.5 rounded border border-gray-100 text-[10px]">
                                {job.custom_text ? `"${job.custom_text.slice(0, 20)}${job.custom_text.length > 20 ? '...' : ''}"` : _("broadcastHistory.customText")}
                              </span>
                            ) : (
                              getTextListName(job.text_list_id)
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {job.account_ids.map((accId) => {
                          const acc = accounts?.find((a) => a.id === accId);
                          return (
                            <span
                              key={accId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 text-[11px] font-semibold border border-blue-200/80 dark:border-blue-800/60 whitespace-nowrap"
                              title={acc ? `${acc.first_name || ""} (${acc.phone})` : accId}
                            >
                              <User className="h-3 w-3 shrink-0" />
                              <span className="max-w-[100px] truncate">
                                {acc ? acc.first_name || acc.phone : "Unknown"}
                              </span>
                            </span>
                          );
                        })}
                        {job.account_ids.length === 0 && (
                          <span className="text-xs text-muted-foreground/60 italic">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
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
                        {job.status}
                      </Badge>
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
                      <div className="flex items-center gap-1.5">
                        {/* Running controls */}
                        {job.status === "running" && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() =>
                                    actionMutation.mutate({
                                      jobId: job.id,
                                      action: "pause",
                                    })
                                  }
                                  className="p-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition"
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
                                      () =>
                                        actionMutation.mutate({
                                          jobId: job.id,
                                          action: "stop",
                                        })
                                    )
                                  }
                                  className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
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
                                    actionMutation.mutate({
                                      jobId: job.id,
                                      action: "resume",
                                    })
                                  }
                                  className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
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
                                      () =>
                                        actionMutation.mutate({
                                          jobId: job.id,
                                          action: "stop",
                                        })
                                    )
                                  }
                                  className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
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
                                    () =>
                                      actionMutation.mutate({
                                        jobId: job.id,
                                        action: "stop",
                                      })
                                  )
                                }
                                className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                              >
                                <Square className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{_("broadcastHistory.cancel")}</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Terminal states — retry + delete */}
                        {["completed", "cancelled", "failed"].includes(
                          job.status
                        ) && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() =>
                                    retryMutation.mutate(job.id)
                                  }
                                  disabled={retryMutation.isPending}
                                  className="p-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition disabled:opacity-50"
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
                                  className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition disabled:opacity-50"
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
                                onClick={() =>
                                  router.push(
                                    `/broadcast/logs?jobId=${job.id}`
                                  )
                                }
                                className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{_("broadcastHistory.viewLogs")}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
    </div>
  );
}
