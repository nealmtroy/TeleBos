"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useInviteJobs,
  useInviteAction,
  useDeleteInviteJob,
  useRetryInviteJob,
  type InviteJob,
} from "@/hooks/use-invite";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  UserPlus,
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  ClipboardList,
  Shield,
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

export default function InviteHistoryPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: jobs, isLoading } = useInviteJobs();
  const actionMutation = useInviteAction();
  const deleteMutation = useDeleteInviteJob();
  const retryMutation = useRetryInviteJob();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [stopConfirmId, setStopConfirmId] = useState<string | null>(null);

  // Role check: basic users cannot access invite
  if (user?.role === "basic") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">
          Member Invite feature is not available for your plan. Upgrade to Pro or Premium to access this feature.
        </p>
      </div>
    );
  }

  const runningCount = jobs?.filter((j) => j.status === "running").length ?? 0;
  const completedCount = jobs?.filter((j) => j.status === "completed").length ?? 0;
  const failedCount = jobs?.filter((j) => j.status === "failed").length ?? 0;
  const totalInvited = jobs?.reduce((sum, j) => sum + (j.invited_count || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header + Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("invite.inviteHistory")}</h1>
          <p className="text-gray-500 mt-1">Pantau dan kelola seluruh riwayat tugas undangan member Anda.</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          <Link
            href="/invite"
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white/60 transition"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            {_("invite.newInvite")}
          </Link>
          <Link
            href="/invite/history"
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-semibold bg-white text-gray-900 shadow-xs transition"
          >
            <Clock className="h-4 w-4 text-primary-600" />
            {_("invite.inviteHistory")}
          </Link>
          <Link
            href="/invite/logs"
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white/60 transition"
          >
            <ClipboardList className="h-4 w-4 text-gray-400" />
            {_("invite.inviteLogs")}
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Total Tugas</span>
            <Layers className="h-4 w-4 text-gray-400" />
          </div>
          <p className="text-xl font-bold text-gray-900">{jobs?.length ?? 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-blue-600">
            <span>Sedang Berjalan</span>
            <Play className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-blue-600">{runningCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-600">
            <span>Selesai</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-emerald-600">{completedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Total Terundang</span>
            <UserPlus className="h-4 w-4 text-primary-500" />
          </div>
          <p className="text-xl font-bold text-primary-600">{totalInvited.toLocaleString()}</p>
        </div>
      </div>

      {/* Jobs Table */}
      {isLoading ? (
        <CardSkeleton lines={4} />
      ) : !jobs || jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <UserPlus className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium mb-3">{_("invite.noJobs")}</p>
          <Link
            href="/invite"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold transition"
          >
            <Plus className="h-4 w-4" />
            {_("invite.newInvite")}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">{_("invite.date")}</th>
                  <th className="text-left px-4 py-3">{_("invite.destination")}</th>
                  <th className="text-left px-4 py-3">{_("invite.status")}</th>
                  <th className="text-left px-4 py-3">{_("invite.progress")}</th>
                  <th className="text-left px-4 py-3">
                    {_("invite.invited")} / {_("invite.failed")}
                  </th>
                  <th className="text-right px-4 py-3">{_("invite.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job: InviteJob) => (
                  <tr key={job.id} className="hover:bg-gray-50/75 transition-colors">
                    <td className="px-4 py-3.5 text-xs text-gray-700 whitespace-nowrap">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-gray-900 truncate max-w-48">
                      {job.destination_group}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border",
                          job.status === "running" && "bg-blue-50 text-blue-700 border-blue-200",
                          job.status === "paused" && "bg-amber-50 text-amber-700 border-amber-200",
                          job.status === "completed" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                          job.status === "failed" && "bg-rose-50 text-rose-700 border-rose-200",
                          job.status === "cancelled" && "bg-gray-50 text-gray-600 border-gray-200",
                          job.status === "pending" && "bg-purple-50 text-purple-700 border-purple-200"
                        )}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={cn(
                              "h-1.5 rounded-full transition-all",
                              job.status === "failed" ? "bg-rose-500" : "bg-primary-600"
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, job.progress || 0))}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-500">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono">
                      <span className="text-emerald-700 font-bold">{job.invited_count}</span>
                      <span className="text-gray-400"> / </span>
                      <span className="text-rose-700 font-bold">{job.fail_count}</span>
                      {job.skip_count > 0 && (
                        <span className="text-amber-600 text-[11px] ml-1">
                          (+{job.skip_count} skip)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          href={`/invite/logs?job_id=${job.id}`}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition"
                          title="Lihat Log"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Link>
                        {job.status === "running" && (
                          <>
                            <button
                              onClick={() => actionMutation.mutate({ jobId: job.id, action: "pause" })}
                              className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg transition"
                              title={_("invite.pause")}
                            >
                              <Pause className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setStopConfirmId(job.id)}
                              className="p-1.5 text-rose-700 hover:bg-rose-100 rounded-lg transition"
                              title={_("invite.stop")}
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {job.status === "paused" && (
                          <button
                            onClick={() => actionMutation.mutate({ jobId: job.id, action: "resume" })}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg transition"
                            title={_("invite.resume")}
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {["completed", "failed", "cancelled"].includes(job.status) && (
                          <>
                            <button
                              onClick={() => retryMutation.mutate(job.id)}
                              className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg transition"
                              title={_("invite.retry")}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(job.id)}
                              className="p-1.5 text-rose-700 hover:bg-rose-100 rounded-lg transition"
                              title={_("invite.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        onOpenChange={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId);
          setDeleteConfirmId(null);
        }}
        title={_("invite.delete")}
        message={_("invite.deleteConfirm")}
        confirmText={_("invite.delete")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />

      {/* Stop Confirmation */}
      <ConfirmDialog
        open={!!stopConfirmId}
        onOpenChange={() => setStopConfirmId(null)}
        onConfirm={() => {
          if (stopConfirmId) actionMutation.mutate({ jobId: stopConfirmId, action: "stop" });
          setStopConfirmId(null);
        }}
        title={_("invite.stop")}
        message={_("invite.stopConfirm")}
        confirmText={_("invite.stop")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />
    </div>
  );
}
