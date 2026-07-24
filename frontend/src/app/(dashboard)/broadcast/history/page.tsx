"use client";

import { useRouter } from "next/navigation";
import {
  useBroadcastJobs,
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
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useState, useCallback } from "react";
import { useAccounts } from "@/hooks/use-accounts";

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
  const actionMutation = useBroadcastAction();
  const deleteMutation = useDeleteBroadcastJob();
  const retryMutation = useRetryBroadcastJob();

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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.date")}</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.setup")}</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.accounts")}</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.status")}</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.progress")}</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.sentFailed")}</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 uppercase tracking-wider">{_("broadcastHistory.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job: BroadcastJob) => (
                  <tr key={job.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {job.account_ids.map((accId) => {
                          const acc = accounts?.find((a) => a.id === accId);
                          return (
                            <span
                              key={accId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-100 whitespace-nowrap"
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
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                          statusColors[job.status] || "bg-gray-100 text-gray-600"
                        )}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className={cn(
                              "h-2 rounded-full",
                              job.status === "completed"
                                ? "bg-green-500"
                                : job.status === "failed"
                                ? "bg-red-500"
                                : "bg-primary-600"
                            )}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-gray-500 text-xs w-8">
                          {job.progress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-green-700 font-medium">
                          {job.sent_count}
                        </span>
                        <span className="text-gray-300">/</span>
                        <span className="text-red-700 font-medium">
                          {job.fail_count}
                        </span>
                        <span className="text-gray-400">
                          ({_("broadcastHistory.of")} {job.total_groups})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* Running controls */}
                        {job.status === "running" && (
                          <>
                            <button
                              onClick={() =>
                                actionMutation.mutate({
                                  jobId: job.id,
                                  action: "pause",
                                })
                              }
                              className="p-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition"
                              title={_("broadcastHistory.pause")}
                            >
                              <Pause className="h-4 w-4" />
                            </button>
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
                              title={_("broadcastHistory.stop")}
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        {/* Paused controls */}
                        {job.status === "paused" && (
                          <>
                            <button
                              onClick={() =>
                                actionMutation.mutate({
                                  jobId: job.id,
                                  action: "resume",
                                })
                              }
                              className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
                              title={_("broadcastHistory.resume")}
                            >
                              <Play className="h-4 w-4" />
                            </button>
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
                              title={_("broadcastHistory.stop")}
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        {/* Pending — allow stop to cancel before execution */}
                        {job.status === "pending" && (
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
                            title={_("broadcastHistory.cancel")}
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        )}

                        {/* Terminal states — retry + delete */}
                        {["completed", "cancelled", "failed"].includes(
                          job.status
                        ) && (
                          <>
                            <button
                              onClick={() =>
                                retryMutation.mutate(job.id)
                              }
                              disabled={retryMutation.isPending}
                              className="p-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition disabled:opacity-50"
                              title={_("broadcastHistory.retry")}
                            >
                              <RotateCw className="h-4 w-4" />
                            </button>
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
                              title={_("broadcastHistory.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        {/* View Logs — for all non-pending jobs */}
                        {job.status !== "pending" && (
                          <button
                            onClick={() =>
                              router.push(
                                `/broadcast/logs?jobId=${job.id}`
                              )
                            }
                            className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                            title={_("broadcastHistory.viewLogs")}
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
