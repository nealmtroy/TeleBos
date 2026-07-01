"use client";

import { useState, useEffect } from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { useAccountFolders } from "@/hooks/use-account-folders";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { FolderFilterBar } from "@/components/accounts/folder-filter-bar";
import {
  useInviteJobs,
  useStartInvite,
  useInviteAction,
  useDeleteInviteJob,
  useRetryInviteJob,
  useInviteLogs,
} from "@/hooks/use-invite";
import { useInviteSocket } from "@/hooks/use-socket";
import type { Account } from "@/hooks/use-accounts";
import type { InviteJob } from "@/hooks/use-invite";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  UserPlus,
  Play,
  Pause,
  Square,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wifi,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  ClipboardList,
  Users,
  Shield,
  SkipForward,
  Search,
} from "lucide-react";

type Tab = "new" | "history" | "logs";

export default function InvitePage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>("new");

  // Role check: basic users cannot access invite
  if (user?.role === "basic") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Member Invite feature is not available for your plan. Upgrade to Pro or Premium to access this feature.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "new", label: _("invite.newInvite"), icon: Plus },
    { key: "history", label: _("invite.inviteHistory"), icon: Clock },
    { key: "logs", label: _("invite.inviteLogs"), icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("invite.title")}</h1>
        <p className="text-gray-500 mt-1">{_("invite.desc")}</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "new" && <NewInviteTab />}
      {activeTab === "history" && <InviteHistoryTab />}
      {activeTab === "logs" && <InviteLogsTab />}
    </div>
  );
}

// ── New Invite Tab ──────────────────────────────────────────────────────────

function NewInviteTab() {
  const _ = useT();
  const queryClient = useQueryClient();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: folders } = useAccountFolders();
  const startMutation = useStartInvite();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [destGroup, setDestGroup] = useState("");
  const [destType, setDestType] = useState<"username" | "link" | "group_id">("username");
  const [sourceGroups, setSourceGroups] = useState<{ type: string; value: string }[]>([]);
  const [newSourceValue, setNewSourceValue] = useState("");
  const [newSourceType, setNewSourceType] = useState<"username" | "link" | "group_id">("username");
  const [delayPerInvite, setDelayPerInvite] = useState("30");
  const [delayPerBatch, setDelayPerBatch] = useState("60");
  const [batchSize, setBatchSize] = useState("5");
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  // Active job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [wsLogs, setWsLogs] = useState<any[]>([]);
  const actionMutation = useInviteAction();

  // WebSocket for real-time invite progress
  const {
    connected: wsConnected,
    progress: wsProgress,
    logs: wsLiveLogs,
    phase,
    phaseMessage,
  } = useInviteSocket(activeJobId);

  // Periodic polling for job state as fallback
  const { data: jobs, refetch: refetchJobs } = useInviteJobs();
  const activeJob = jobs?.find((j) => j.id === activeJobId) || null;

  useEffect(() => {
    if (wsProgress && activeJobId) {
      queryClient.invalidateQueries({ queryKey: ["invite-jobs"] });
    }
  }, [wsProgress, activeJobId, queryClient]);

  useEffect(() => {
    if (!activeJobId || wsConnected) return;
    const interval = setInterval(() => refetchJobs(), 3000);
    return () => clearInterval(interval);
  }, [activeJobId, wsConnected, refetchJobs]);

  // Merge live WS logs
  useEffect(() => {
    if (wsLiveLogs.length > 0) {
      setWsLogs((prev) => [...prev, ...wsLiveLogs]);
    }
  }, [wsLiveLogs]);

  // Auto-select first account
  useEffect(() => {
    if (accounts && accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds([accounts[0].id]);
    }
  }, [accounts, selectedAccountIds]);

  function addSourceGroup() {
    if (!newSourceValue.trim()) return;
    setSourceGroups((prev) => [...prev, { type: newSourceType, value: newSourceValue.trim() }]);
    setNewSourceValue("");
  }

  function removeSourceGroup(idx: number) {
    setSourceGroups((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleStart() {
    if (selectedAccountIds.length === 0 || !destGroup.trim() || sourceGroups.length === 0) return;
    try {
      const job = await startMutation.mutateAsync({
        account_ids: selectedAccountIds,
        destination_group: destGroup.trim(),
        destination_type: destType,
        source_groups: sourceGroups,
        delay_per_invite: Math.max(5, parseInt(delayPerInvite) || 30),
        delay_per_batch: Math.max(0, parseInt(delayPerBatch) || 60),
        batch_size: Math.max(1, parseInt(batchSize) || 5),
      });
      setActiveJobId(job.id);
      setWsLogs([]);
    } catch {}
  }

  const destTypeOptions = [
    { value: "username", label: _("invite.typeUsername") },
    { value: "link", label: _("invite.typeLink") },
    { value: "group_id", label: _("invite.typeGroupId") },
  ];

  const filteredByFolder = selectedFolderId
    ? (accounts || []).filter((acc: Account) => acc.folder_ids?.includes(selectedFolderId))
    : (accounts || []);

  const filteredAccounts = filteredByFolder.filter((acc: Account) => {
    const q = accountSearchQuery.toLowerCase();
    return (
      (acc.first_name || "").toLowerCase().includes(q) ||
      (acc.phone || "").toLowerCase().includes(q)
    );
  });

  const folderList = Array.isArray(folders) ? folders : [];

  return (
    <div className="space-y-6">
      {/* Config form */}
      {accountsLoading ? (
        <div className="space-y-4">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={3} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary-600" />
            {_("invite.newInvite")}
          </h2>

          {/* Accounts selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {_("invite.account") || "Telegram Accounts"} ({selectedAccountIds.length} selected)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAccountIds((accounts || []).map((a) => a.id))}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Select All
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedAccountIds([])}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Search */}
            {/* Folder filter */}
            <div className="mb-3">
              <FolderFilterBar
                folders={folderList}
                selectedFolderId={selectedFolderId}
                onSelect={setSelectedFolderId}
              />
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search accounts by name or phone..."
                value={accountSearchQuery}
                onChange={(e) => setAccountSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>

            {/* Scrollable grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto p-1.5 border border-gray-200 rounded-lg bg-gray-50">
              {filteredAccounts.length === 0 ? (
                <div className="col-span-full text-center py-6 text-sm text-gray-500">
                  No accounts found
                </div>
              ) : (
                filteredAccounts.map((acc: Account) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  const initials = (acc.first_name || "").slice(0, 2).toUpperCase() || "TG";
                  return (
                    <div
                      key={acc.id}
                      onClick={() => {
                        setSelectedAccountIds((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== acc.id)
                            : [...prev, acc.id]
                        );
                      }}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border bg-white cursor-pointer select-none transition-all duration-200",
                        isSelected
                          ? "border-primary-500 ring-2 ring-primary-500/20"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 pointer-events-none"
                      />
                      <AccountAvatar
                        accountId={acc.id}
                        firstName={acc.first_name}
                        phone={acc.phone}
                        photoVersion={acc.photo_version}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {acc.first_name || "Unknown"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{acc.phone}</p>
                      </div>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          acc.is_active ? "bg-green-500" : "bg-red-500"
                        )}
                        title={acc.is_active ? "Active" : "Expired"}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {_("invite.destination")}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={destType}
                onChange={(e) => setDestType(e.target.value as typeof destType)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white w-full sm:w-36"
              >
                {destTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={destGroup}
                onChange={(e) => setDestGroup(e.target.value)}
                placeholder={_("invite.destinationPlaceholder")}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Source Groups */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {_("invite.sourceGroups")}
            </label>
            <p className="text-xs text-gray-400 mb-2">{_("invite.sourceGroupsDesc")}</p>

            {/* Existing source groups */}
            {sourceGroups.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {sourceGroups.map((sg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded font-medium">
                      {sg.type}
                    </span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{sg.value}</span>
                    <button
                      onClick={() => removeSourceGroup(idx)}
                      className="text-gray-400 hover:text-red-500 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new source group */}
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={newSourceType}
                onChange={(e) => setNewSourceType(e.target.value as typeof newSourceType)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white w-full sm:w-36"
              >
                {destTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newSourceValue}
                onChange={(e) => setNewSourceValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSourceGroup();
                  }
                }}
                placeholder={_("invite.sourcePlaceholder")}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <button
                onClick={addSourceGroup}
                disabled={!newSourceValue.trim()}
                className="px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 transition"
              >
                {_("invite.addSource")}
              </button>
            </div>
          </div>

          {/* Delay settings */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {_("invite.delayPerInvite")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={delayPerInvite}
                onChange={(e) => setDelayPerInvite(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="30"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">{_("invite.delayPerInviteSuffix")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {_("invite.batchSize")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="5"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">{_("invite.batchSizeSuffix")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {_("invite.delayPerBatch")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={delayPerBatch}
                onChange={(e) => setDelayPerBatch(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="60"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">{_("invite.delayPerBatchSuffix")}</p>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900">Rate Limit Warning</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Telegram limits invites to ~20-50 per day for regular accounts. Distribute invites across multiple accounts to optimize progress. The system will automatically rotate accounts and handle cooldowns.
                </p>
              </div>
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={selectedAccountIds.length === 0 || !destGroup.trim() || sourceGroups.length === 0 || startMutation.isPending}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition flex items-center justify-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            {startMutation.isPending ? _("invite.starting") : _("invite.startInvite")}
          </button>
          {startMutation.isError && (
            <p className="text-sm text-red-500">
              {(startMutation.error as any)?.response?.data?.detail || _("invite.failedToStart")}
            </p>
          )}
        </div>
      )}

      {/* Active job progress */}
      {activeJob && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">
                Invite {activeJob.id.slice(0, 8)}...
              </h2>
              {wsConnected && (
                <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                  <Wifi className="h-3 w-3" /> {_("invite.live")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium",
                  activeJob.status === "running" && "bg-blue-100 text-blue-800",
                  activeJob.status === "paused" && "bg-yellow-100 text-yellow-800",
                  activeJob.status === "completed" && "bg-green-100 text-green-800",
                  activeJob.status === "failed" && "bg-red-100 text-red-800",
                  activeJob.status === "cancelled" && "bg-gray-100 text-gray-600"
                )}
              >
                {activeJob.status}
              </span>

              {activeJob.status === "running" && (
                <>
                  <button
                    onClick={() => actionMutation.mutate({ jobId: activeJob.id, action: "pause" })}
                    className="p-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition"
                    title={_("invite.pause")}
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setStopConfirmOpen(true)}
                    className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                    title={_("invite.stop")}
                  >
                    <Square className="h-4 w-4" />
                  </button>
                </>
              )}
              {activeJob.status === "paused" && (
                <button
                  onClick={() => actionMutation.mutate({ jobId: activeJob.id, action: "resume" })}
                  className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
                  title={_("invite.resume")}
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Phase indicator */}
          {phaseMessage && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-700">{phaseMessage}</span>
            </div>
          )}

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">{_("invite.progress")}</span>
              <span className="font-medium">{activeJob.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={cn(
                  "h-2.5 rounded-full transition-all duration-500",
                  activeJob.status === "completed"
                    ? "bg-green-500"
                    : activeJob.status === "failed"
                    ? "bg-red-500"
                    : "bg-primary-600"
                )}
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-center">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xl font-bold text-gray-900">{activeJob.total_members}</p>
              <p className="text-xs text-gray-500">{_("invite.totalMembers")}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xl font-bold text-green-700">
                {wsProgress?.invited ?? activeJob.invited_count}
              </p>
              <p className="text-xs text-green-600">{_("invite.invited")}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xl font-bold text-blue-700">
                {wsProgress?.already_member ?? activeJob.already_member_count}
              </p>
              <p className="text-xs text-blue-600">{_("invite.alreadyMember")}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-xl font-bold text-orange-700">
                {wsProgress?.skipped ?? activeJob.skip_count}
              </p>
              <p className="text-xs text-orange-600">{_("invite.skipped")}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xl font-bold text-red-700">
                {wsProgress?.failed ?? activeJob.fail_count}
              </p>
              <p className="text-xs text-red-600">{_("invite.failed")}</p>
            </div>
          </div>

          {/* Live log feed */}
          {wsLogs.length > 0 && (
            <div className="border border-gray-100 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
              {wsLogs.slice(-30).reverse().map((log: any, i: number) => (
                <div key={`live-${i}`} className="px-3 py-2 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
                  {log.status === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : log.status === "already_member" ? (
                    <Users className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  ) : log.status === "skipped" ? (
                    <SkipForward className="h-4 w-4 text-orange-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="text-gray-700 truncate">
                    {log.username ? `@${log.username}` : log.first_name || `ID:${log.user_id_tg}`}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{log.source_group}</span>
                  <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                    {log.account_name && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-24" title={`Account: ${log.account_name}`}>
                        {log.account_name.split(" ")[0]}
                      </span>
                    )}
                    {log.error_type && (
                      <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        {log.error_type}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={stopConfirmOpen}
        onOpenChange={setStopConfirmOpen}
        onConfirm={() => {
          if (activeJob) actionMutation.mutate({ jobId: activeJob.id, action: "stop" });
          setStopConfirmOpen(false);
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

// ── Invite History Tab ──────────────────────────────────────────────────────

function InviteHistoryTab() {
  const _ = useT();
  const { data: jobs, isLoading } = useInviteJobs();
  const actionMutation = useInviteAction();
  const deleteMutation = useDeleteInviteJob();
  const retryMutation = useRetryInviteJob();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [stopConfirmId, setStopConfirmId] = useState<string | null>(null);

  if (isLoading) return <CardSkeleton lines={3} />;

  return (
    <div className="space-y-4">
      {!jobs || jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <UserPlus className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{_("invite.noJobs")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.date")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.destination")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.status")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.progress")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {_("invite.invited")} / {_("invite.failed")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">{_("invite.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job: InviteJob) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700 truncate max-w-40">
                      {job.destination_group}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          job.status === "running" && "bg-blue-100 text-blue-800",
                          job.status === "paused" && "bg-yellow-100 text-yellow-800",
                          job.status === "completed" && "bg-green-100 text-green-800",
                          job.status === "failed" && "bg-red-100 text-red-800",
                          job.status === "cancelled" && "bg-gray-100 text-gray-600",
                          job.status === "pending" && "bg-purple-100 text-purple-800"
                        )}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-primary-600 h-1.5 rounded-full transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="text-green-700">{job.invited_count}</span>
                      {" / "}
                      <span className="text-red-700">{job.fail_count}</span>
                      {job.skip_count > 0 && (
                        <span className="text-orange-500 text-xs ml-1">
                          (+{job.skip_count} skip)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {job.status === "running" && (
                          <>
                            <button
                              onClick={() => actionMutation.mutate({ jobId: job.id, action: "pause" })}
                              className="p-1.5 text-yellow-700 hover:bg-yellow-100 rounded transition"
                              title={_("invite.pause")}
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setStopConfirmId(job.id)}
                              className="p-1.5 text-red-700 hover:bg-red-100 rounded transition"
                              title={_("invite.stop")}
                            >
                              <Square className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {job.status === "paused" && (
                          <button
                            onClick={() => actionMutation.mutate({ jobId: job.id, action: "resume" })}
                            className="p-1.5 text-green-700 hover:bg-green-100 rounded transition"
                            title={_("invite.resume")}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {["completed", "failed", "cancelled"].includes(job.status) && (
                          <>
                            <button
                              onClick={() => retryMutation.mutate(job.id)}
                              className="p-1.5 text-blue-700 hover:bg-blue-100 rounded transition"
                              title={_("invite.retry")}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(job.id)}
                              className="p-1.5 text-red-700 hover:bg-red-100 rounded transition"
                              title={_("invite.delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

// ── Invite Logs Tab ─────────────────────────────────────────────────────────

function InviteLogsTab() {
  const _ = useT();
  const { data: jobs } = useInviteJobs();
  const { data: accounts } = useAccounts();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (searchQuery) filters.search = searchQuery;

  const { data: logs, isLoading } = useInviteLogs(selectedJobId, filters);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white w-full sm:min-w-48 sm:w-auto"
          >
            <option value="">{_("invite.selectJob")}</option>
            {(jobs || []).map((j: InviteJob) => (
              <option key={j.id} value={j.id}>
                {j.destination_group} — {new Date(j.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white"
          >
            <option value="">{_("invite.allStatuses")}</option>
            <option value="success">{_("invite.success")}</option>
            <option value="error">{_("invite.error")}</option>
            <option value="skipped">{_("invite.skipped")}</option>
            <option value="already_member">{_("invite.alreadyMember")}</option>
          </select>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search username, name, source..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Logs table */}
      {!selectedJobId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{_("invite.selectJobToView")}</p>
        </div>
      ) : isLoading ? (
        <CardSkeleton lines={4} />
      ) : !logs || logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{_("invite.noEntries")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colUser")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colUsername")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colSource")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colAccount") || "Account"}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colStatus")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colErrorType")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{_("invite.colTime")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const accUsed = accounts?.find((a) => a.id === log.account_id_used);
                  const accName = accUsed
                    ? `${accUsed.first_name || "Unknown"} (${accUsed.phone || ""})`
                    : log.account_id_used
                    ? log.account_id_used.slice(0, 8)
                    : "—";
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700">
                        {log.first_name || `ID:${log.user_id_tg}`}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {log.username ? `@${log.username}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-32">
                        {log.source_group}
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-32" title={accName}>
                        {accName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            log.status === "success" && "bg-green-100 text-green-800",
                            log.status === "error" && "bg-red-100 text-red-800",
                            log.status === "skipped" && "bg-orange-100 text-orange-800",
                            log.status === "already_member" && "bg-blue-100 text-blue-800"
                          )}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {log.error_type ? (
                          <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                            {log.error_type}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(log.invited_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
