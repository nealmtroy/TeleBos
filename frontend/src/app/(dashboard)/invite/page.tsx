"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccounts } from "@/hooks/use-accounts";
import { useAccountFolders } from "@/hooks/use-account-folders";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { FolderFilterBar } from "@/components/accounts/folder-filter-bar";
import {
  useInviteJobs,
  useStartInvite,
  useInviteAction,
} from "@/hooks/use-invite";
import { useInviteSocket } from "@/hooks/use-socket";
import type { Account } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  UserPlus,
  Play,
  Pause,
  Square,
  Loader2,
  CheckCircle,
  XCircle,
  Wifi,
  Plus,
  Clock,
  ClipboardList,
  Users,
  Shield,
  SkipForward,
  Search,
  ExternalLink,
} from "lucide-react";

export default function InvitePage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: rawAccounts, isLoading: accountsLoading } = useAccounts();
  const accounts = rawAccounts?.filter((acc) => acc.is_active && !acc.for_sale);
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

  // Periodic polling for job state
  const { data: jobs, refetch: refetchJobs } = useInviteJobs();

  // Auto-track running job if any exists and activeJobId is not set
  const runningJob = jobs?.find((j) => j.status === "running" || j.status === "paused");
  const currentTrackingId = activeJobId || runningJob?.id || null;
  const activeJob = jobs?.find((j) => j.id === currentTrackingId) || null;

  // WebSocket for real-time invite progress
  const {
    connected: wsConnected,
    progress: wsProgress,
    logs: wsLiveLogs,
    phaseMessage,
  } = useInviteSocket(currentTrackingId);

  useEffect(() => {
    if (wsProgress && currentTrackingId) {
      queryClient.invalidateQueries({ queryKey: ["invite-jobs"] });
    }
  }, [wsProgress, currentTrackingId, queryClient]);

  useEffect(() => {
    if (!currentTrackingId || wsConnected) return;
    const interval = setInterval(() => refetchJobs(), 3000);
    return () => clearInterval(interval);
  }, [currentTrackingId, wsConnected, refetchJobs]);

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

  return (
    <div className="space-y-6">
      {/* Header + Sub-navigation pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("invite.title")}</h1>
          <p className="text-gray-500 mt-1">{_("invite.desc")}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          <Link
            href="/invite"
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-semibold bg-white text-gray-900 shadow-xs transition"
          >
            <Plus className="h-4 w-4 text-primary-600" />
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
            className="flex items-center gap-2 py-2 px-3.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white/60 transition"
          >
            <ClipboardList className="h-4 w-4 text-gray-400" />
            {_("invite.inviteLogs")}
          </Link>
        </div>
      </div>

      {/* Main Content Form */}
      <div className="space-y-6">
        {/* Step 1: Account Selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{_("invite.selectAccounts")}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {selectedAccountIds.length} {_("invite.selected")}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (accounts) {
                    if (selectedAccountIds.length === accounts.length) {
                      setSelectedAccountIds([]);
                    } else {
                      setSelectedAccountIds(accounts.map((a) => a.id));
                    }
                  }
                }}
                className="text-xs text-primary-600 hover:underline"
              >
                {accounts && selectedAccountIds.length === accounts.length
                  ? _("invite.deselectAll")
                  : _("invite.selectAll")}
              </button>
            </div>
          </div>

          {folders && folders.length > 0 && (
            <FolderFilterBar
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
            />
          )}

          {/* Search accounts */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={_("invite.searchAccountsPlaceholder")}
              value={accountSearchQuery}
              onChange={(e) => setAccountSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {accountsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !accounts || accounts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{_("invite.noActiveAccounts")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
              {accounts
                .filter((acc: Account) => {
                  if (selectedFolderId && !acc.folder_ids?.includes(selectedFolderId)) return false;
                  if (accountSearchQuery.trim()) {
                    const q = accountSearchQuery.toLowerCase();
                    const name = (acc.first_name || "").toLowerCase() + " " + (acc.last_name || "").toLowerCase();
                    const phone = (acc.phone || "").toLowerCase();
                    const username = (acc.username || "").toLowerCase();
                    return name.includes(q) || phone.includes(q) || username.includes(q);
                  }
                  return true;
                })
                .map((acc: Account) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  const displayName = acc.first_name
                    ? `${acc.first_name} ${acc.last_name || ""}`.trim()
                    : acc.phone;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => {
                        setSelectedAccountIds((prev) =>
                          isSelected ? prev.filter((id) => id !== acc.id) : [...prev, acc.id]
                        );
                      }}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition",
                        isSelected
                          ? "border-primary-500 bg-primary-50/50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <AccountAvatar
                        accountId={acc.id}
                        firstName={acc.first_name}
                        phone={acc.phone}
                        photoVersion={acc.photo_version}
                        colorId={acc.color_id}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {acc.username ? `@${acc.username}` : acc.phone}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Step 2: Destination Group */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">{_("invite.destination")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {_("invite.destinationType")}
              </label>
              <select
                value={destType}
                onChange={(e) => setDestType(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {destTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {destType === "username"
                  ? _("invite.destUsernameLabel")
                  : destType === "link"
                  ? _("invite.destLinkLabel")
                  : _("invite.destGroupIdLabel")}
              </label>
              <input
                type="text"
                placeholder={
                  destType === "username"
                    ? "@mygroup"
                    : destType === "link"
                    ? "https://t.me/+joinlink"
                    : "-1001234567890"
                }
                value={destGroup}
                onChange={(e) => setDestGroup(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Source Groups (Multi-Group) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{_("invite.sourceGroups")}</h2>
            <span className="text-xs text-gray-500">
              {sourceGroups.length} {_("invite.sourcesAdded")}
            </span>
          </div>
          <p className="text-xs text-gray-500">{_("invite.sourceGroupsDesc")}</p>

          <div className="flex gap-2">
            <select
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value as any)}
              className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {destTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder={
                newSourceType === "username"
                  ? "@sourcegroup"
                  : newSourceType === "link"
                  ? "https://t.me/joinchat/..."
                  : "-1009876543210"
              }
              value={newSourceValue}
              onChange={(e) => setNewSourceValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSourceGroup();
                }
              }}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={addSourceGroup}
              disabled={!newSourceValue.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 transition"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {sourceGroups.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {sourceGroups.map((sg, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                      {sg.type}
                    </span>
                    <span className="truncate text-gray-800">{sg.value}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSourceGroup(idx)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 4: Delays & Rate Limiting */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">{_("invite.delaysConfig")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {_("invite.delayPerInvite")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={delayPerInvite}
                  onChange={(e) => setDelayPerInvite(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">detik</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{_("invite.delayPerInviteSuffix")}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {_("invite.batchSize")}
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">{_("invite.batchSizeSuffix")}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {_("invite.delayPerBatch")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="3600"
                  value={delayPerBatch}
                  onChange={(e) => setDelayPerBatch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">detik</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{_("invite.delayPerBatchSuffix")}</p>
            </div>
          </div>
        </div>

        {/* Start Button */}
        {(!activeJob || ["completed", "failed", "cancelled"].includes(activeJob.status)) && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={
                selectedAccountIds.length === 0 ||
                !destGroup.trim() ||
                sourceGroups.length === 0 ||
                startMutation.isPending
              }
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:text-gray-500 transition flex items-center justify-center gap-2 shadow-xs"
            >
              <UserPlus className="h-5 w-5" />
              {startMutation.isPending ? _("invite.starting") : _("invite.startInvite")}
            </button>
            {startMutation.isError && (
              <p className="text-sm text-red-500">
                {(startMutation.error as any)?.response?.data?.detail || _("invite.failedToStart")}
              </p>
            )}
          </div>
        )}

        {/* Active Job Progress View */}
        {activeJob && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900">
                  Invite Job #{activeJob.id.slice(0, 8)}
                </h2>
                {wsConnected && (
                  <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
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

                <Link
                  href={`/invite/logs?job_id=${activeJob.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Log Detail
                </Link>
              </div>
            </div>

            {/* Phase indicator */}
            {phaseMessage && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-700 font-medium">{phaseMessage}</span>
              </div>
            )}

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-500">{_("invite.progress")}</span>
                <span className="font-semibold text-gray-800">{activeJob.progress}%</span>
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

            {/* Live log feed preview */}
            {wsLogs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Aktivitas Terbaru</span>
                  <Link
                    href={`/invite/logs?job_id=${activeJob.id}`}
                    className="text-primary-600 hover:underline flex items-center gap-1"
                  >
                    Buka Log Lengkap <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100 bg-gray-50/50">
                  {wsLogs.slice(-20).reverse().map((log: any, i: number) => (
                    <div key={`live-${i}`} className="px-3 py-2 text-xs flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
                      {log.status === "success" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      ) : log.status === "already_member" ? (
                        <Users className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      ) : log.status === "skipped" ? (
                        <SkipForward className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-gray-700 truncate font-mono">
                        {log.username ? `@${log.username}` : log.first_name || `ID:${log.user_id_tg}`}
                      </span>
                      <span className="text-gray-400 truncate">{log.source_group}</span>
                      <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                        {log.account_name && (
                          <span
                            className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-24 text-[10px]"
                            title={`Account: ${log.account_name}`}
                          >
                            {log.account_name.split(" ")[0]}
                          </span>
                        )}
                        {log.error_type && (
                          <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px]">
                            {log.error_type}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
