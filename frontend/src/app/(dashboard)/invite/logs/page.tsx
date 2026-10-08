"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInviteJobs, useInviteLogs, type InviteJob } from "@/hooks/use-invite";
import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
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
import {
  ClipboardList,
  Search,
  Plus,
  Clock,
  Shield,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from "lucide-react";

export default function InviteLogsPage() {
  const user = useAuthStore((s) => s.user);

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

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <InviteLogsContent />
    </Suspense>
  );
}

function InviteLogsContent() {
  const _ = useT();
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("job_id") || "";

  const { data: jobs, isLoading: jobsLoading } = useInviteJobs();
  const { data: accounts } = useAccounts();
  const [selectedJobId, setSelectedJobId] = useState(initialJobId);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Pre-select first job if none selected and jobs exist
  const effectiveJobId = selectedJobId || (jobs && jobs.length > 0 ? jobs[0].id : "");

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (searchQuery) filters.search = searchQuery;

  const { data: logs, isLoading } = useInviteLogs(effectiveJobId, filters);

  const selectedJob = jobs?.find((j) => j.id === effectiveJobId);

  return (
    <div className="space-y-6">
      {/* Header + Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("invite.inviteLogs")}</h1>
          <p className="text-gray-500 mt-1">{_("invite.logsDesc")}</p>
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
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white/60 transition"
          >
            <Clock className="h-4 w-4 text-gray-400" />
            {_("invite.inviteHistory")}
          </Link>
          <Link
            href="/invite/logs"
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-semibold bg-white text-gray-900 shadow-xs transition"
          >
            <ClipboardList className="h-4 w-4 text-primary-600" />
            {_("invite.inviteLogs")}
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div className="flex flex-wrap gap-3">
          <Select
            value={effectiveJobId || "_none"}
            onValueChange={(val) => setSelectedJobId(val === "_none" ? "" : val)}
          >
            <SelectTrigger className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-medium bg-gray-50 text-gray-800 w-full sm:min-w-64 sm:w-auto h-9">
              <SelectValue placeholder={_("invite.selectJob")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{_("invite.selectJob")}</SelectItem>
              {(jobs || []).map((j: InviteJob) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.destination_group} — {new Date(j.created_at).toLocaleDateString()} ({j.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter || "all"}
            onValueChange={(val) => setStatusFilter(val === "all" ? "" : val)}
          >
            <SelectTrigger className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-medium bg-gray-50 text-gray-800 h-9 w-[160px]">
              <SelectValue placeholder={_("invite.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{_("invite.allStatuses")}</SelectItem>
              <SelectItem value="success">{_("invite.success")}</SelectItem>
              <SelectItem value="error">{_("invite.error")}</SelectItem>
              <SelectItem value="skipped">{_("invite.skipped")}</SelectItem>
              <SelectItem value="already_member">{_("invite.alreadyMember")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              id="invite-logs-search"
              name="searchQuery"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={_("invite.searchLogsPlaceholder")}
              aria-label={_("invite.searchLogsPlaceholder")}
              className="w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        </div>

        {selectedJob && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
            <span>
              {_("invite.target")}: <strong className="text-gray-900 font-mono">{selectedJob.destination_group}</strong>
            </span>
            <div className="flex items-center gap-3">
              <span>
                {_("invite.status")}: <strong className="uppercase font-bold text-gray-900">{selectedJob.status}</strong>
              </span>
              <span>
                {_("invite.success")}: <strong className="text-emerald-700">{selectedJob.invited_count}</strong>
              </span>
              <span>
                {_("invite.failed")}: <strong className="text-rose-700">{selectedJob.fail_count}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Logs Table */}
      {!effectiveJobId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
          <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{_("invite.selectJobToView")}</p>
        </div>
      ) : isLoading ? (
        <CardSkeleton lines={4} />
      ) : !logs || logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
          <p className="text-gray-500">{_("invite.noEntries")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <TableRow className="hover:bg-gray-50/75">
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colUser")}</TableHead>
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colUsername")}</TableHead>
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colSource")}</TableHead>
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colAccount")}</TableHead>
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colStatus")}</TableHead>
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colErrorType")}</TableHead>
                  <TableHead className="px-4 py-3 font-semibold text-gray-500">{_("invite.colTime")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const accUsed = accounts?.find((a) => a.id === log.account_id_used);
                  const accName = accUsed
                    ? `${accUsed.first_name || "Unknown"} (${accUsed.phone || ""})`
                    : log.account_id_used
                    ? log.account_id_used.slice(0, 8)
                    : "—";

                  return (
                    <TableRow key={log.id} className="hover:bg-gray-50/75 transition-colors">
                      <TableCell className="px-4 py-3 text-xs font-semibold text-gray-900 whitespace-normal">
                        {log.first_name || "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-normal">
                        {log.username ? `@${log.username}` : "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-gray-500 font-mono truncate max-w-36">
                        {log.source_group || "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-gray-700 whitespace-normal">
                        {accName}
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-normal">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border inline-flex items-center gap-1",
                            log.status === "success" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                            log.status === "error" && "bg-rose-50 text-rose-700 border-rose-200",
                            log.status === "skipped" && "bg-amber-50 text-amber-700 border-amber-200",
                            log.status === "already_member" && "bg-blue-50 text-blue-700 border-blue-200"
                          )}
                        >
                          {log.status === "success" && <CheckCircle2 className="h-3 w-3" />}
                          {log.status === "error" && <XCircle className="h-3 w-3" />}
                          {log.status === "skipped" && <AlertTriangle className="h-3 w-3" />}
                          {log.status === "already_member" && <HelpCircle className="h-3 w-3" />}
                          {log.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-rose-600 font-mono whitespace-normal">
                        {log.error_type || "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.invited_at).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
