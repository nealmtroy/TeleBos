"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import {
  useGroupLists,
  useTextLists,
  useStartBroadcast,
  useBroadcastJob,
  useBroadcastJobs,
  useBroadcastLogs,
  useBroadcastAction,
} from "@/hooks/use-broadcast";
import { useBroadcastSocket } from "@/hooks/use-socket";
import type { Account } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { Send, Play, Pause, Square, Loader2, CheckCircle, XCircle, AlertTriangle, Wifi, RefreshCw, Info, Search } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function NewBroadcastPage() {
  const _ = useT();
  const router = useRouter();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: groupLists, isLoading: groupListsLoading } = useGroupLists();
  const { data: textLists, isLoading: textListsLoading } = useTextLists();
  const { data: allJobs } = useBroadcastJobs();
  const startMutation = useStartBroadcast();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [groupListId, setGroupListId] = useState("");
  const [textListId, setTextListId] = useState("");
  const [mode, setMode] = useState<"multi_random" | "single_text">("multi_random");
  const [customText, setCustomText] = useState("");
  const [delayPerGroup, setDelayPerGroup] = useState("5");
  const [delayAfterAll, setDelayAfterAll] = useState("60");
  const [delayRandomized, setDelayRandomized] = useState(false);
  const [logDestination, setLogDestination] = useState("@teleboslogging_bot");
  const [logWebOnly, setLogWebOnly] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [conflictNames, setConflictNames] = useState<string[]>([]);

  // Active job tracking — via WebSocket for real-time updates
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [wsLogs, setWsLogs] = useState<any[]>([]);
  const { data: activeJob, refetch: refetchJob } = useBroadcastJob(activeJobId || "");
  const { data: jobLogs, refetch: refetchLogs } = useBroadcastLogs(activeJobId || "");
  const actionMutation = useBroadcastAction();
  const queryClient = useQueryClient();

  // WebSocket for real-time broadcast progress
  const { connected: wsConnected, progress: wsProgress, logs: wsLiveLogs } = useBroadcastSocket(activeJobId);

  // Merge WebSocket progress into React Query cache
  useEffect(() => {
    if (wsProgress && activeJobId) {
      queryClient.setQueryData(["broadcast-jobs", activeJobId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          progress: wsProgress.current != null ? Math.round((wsProgress.current / wsProgress.total) * 100) : old.progress,
          sent_count: wsProgress.sent ?? old.sent_count,
          fail_count: wsProgress.failed ?? old.fail_count,
          status: wsProgress.status || old.status,
        };
      });
    }
  }, [wsProgress, activeJobId, queryClient]);

  // Periodic polling as fallback (slower when WebSocket connected)
  useEffect(() => {
    if (!activeJobId || wsConnected) return;
    const interval = setInterval(() => {
      refetchJob();
      refetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeJobId, wsConnected, refetchJob, refetchLogs]);

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

  function handlePreStart() {
    if (selectedAccountIds.length === 0 || !groupListId) return;

    // Check for running jobs with selected accounts
    const runningJobs = (allJobs || []).filter(j => j.status === "running");
    const runningAccIds = new Set<string>();
    runningJobs.forEach(j => {
      (j.account_ids || []).forEach(id => runningAccIds.add(id));
    });

    const conflicts = selectedAccountIds.filter(id => runningAccIds.has(id));
    if (conflicts.length > 0) {
      const names = accounts?.filter(a => conflicts.includes(a.id)).map(a => a.first_name || a.phone) || [];
      setConflictNames(names);
      setWarningOpen(true);
    } else {
      setConfirmOpen(true);
    }
  }

  async function handleConfirmStart() {
    if (selectedAccountIds.length === 0 || !groupListId) return;
    try {
      const job = await startMutation.mutateAsync({
        account_ids: selectedAccountIds,
        group_list_id: groupListId,
        text_list_id: textListId || undefined,
        mode,
        custom_text: mode === "single_text" ? customText : undefined,
        delay_per_group: Math.max(1, parseInt(delayPerGroup) || 5),
        delay_after_all: Math.max(0, parseInt(delayAfterAll) || 0),
        loop_enabled: true,
        delay_randomized: delayRandomized,
        log_destination: logWebOnly
          ? "web_only"
          : (logDestination.trim() || null),
      });
      setConfirmOpen(false);
      setWarningOpen(false);
      router.push(`/broadcast/success/${job.id}`);
    } catch (err) {
      // handled by mutation
    }
  }

  const isRunning = activeJob && activeJob.status === "running";
  const isCompleted = activeJob && activeJob.status === "completed";

  const filteredAccounts = (accounts || []).filter((acc: Account) => {
    const q = accountSearchQuery.toLowerCase();
    return (
      (acc.first_name || "").toLowerCase().includes(q) ||
      (acc.phone || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_( "newBroadcast.title")}</h1>
        <p className="text-gray-500 mt-1">{_("newBroadcast.desc")}</p>
      </div>

      {/* Config form - show skeleton while data loads */}
      {accountsLoading || groupListsLoading || textListsLoading ? (
        <div className="space-y-4">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={3} />
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">{_("newBroadcast.configuration")}</h2>

        {/* Accounts Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              {_("newBroadcast.account") || "Telegram Accounts"} ({selectedAccountIds.length} selected)
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
                      title={acc.is_active ? "Active" : "Inactive"}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Group list */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{_("newBroadcast.groupList")}</label>
          <select
            value={groupListId}
            onChange={(e) => setGroupListId(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white"
          >
            <option value="">{_("newBroadcast.groupListPlaceholder")}</option>
            {(groupLists || []).map((gl) => (
              <option key={gl.id} value={gl.id}>
                {gl.name} ({gl.items.length} {_("groupLists.groups")})
              </option>
            ))}
          </select>
        </div>

        {/* Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{_("newBroadcast.mode")}</label>
          <div className="flex gap-3">
            {[
              { value: "multi_random", label: _("newBroadcast.multiRandom"), desc: _("newBroadcast.multiRandomDesc") },
              { value: "single_text", label: _("newBroadcast.singleText"), desc: _("newBroadcast.singleTextDesc") },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value as typeof mode)}
                className={cn(
                  "flex-1 p-3 rounded-lg border-2 text-left transition",
                  mode === opt.value
                    ? "border-primary-600 bg-primary-50"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Text list / custom text */}
        {mode === "multi_random" ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{_("newBroadcast.textList")}</label>
            <select
              value={textListId}
              onChange={(e) => setTextListId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white"
            >
              <option value="">{_("newBroadcast.textListPlaceholder")}</option>
              {(textLists || []).map((tl) => (
                <option key={tl.id} value={tl.id}>
                  {tl.name} ({tl.texts.length} {_("textLists.texts")})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{_("newBroadcast.messageText")}</label>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={3}
              placeholder={_("newBroadcast.messagePlaceholder")}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
          </div>
        )}

        {/* Delays & Randomize */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="delayRandomized"
              checked={delayRandomized}
              onChange={(e) => setDelayRandomized(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            <label htmlFor="delayRandomized" className="text-sm font-medium text-gray-700 cursor-pointer">
              Randomize Delay per Group (5-30 seconds)
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {_("newBroadcast.delayPerGroup")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={delayRandomized}
                value={delayRandomized ? "5-30 (Random)" : delayPerGroup}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setDelayPerGroup(val);
                }}
                placeholder="5"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
              />
              <p className="text-xs text-gray-400 mt-1">{_("newBroadcast.delayPerGroupSuffix")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {_("newBroadcast.delayAfterAll")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={delayAfterAll}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setDelayAfterAll(val);
                }}
                placeholder="60"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">{_("newBroadcast.delayAfterAllSuffix")}</p>
            </div>
          </div>
        </div>

        {/* Cycle log destination */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Cycle Log Destination
          </label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="logWebOnly"
              checked={logWebOnly}
              onChange={(e) => setLogWebOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            <label htmlFor="logWebOnly" className="text-sm text-gray-700 cursor-pointer">
              Web only (don't send cycle logs to Telegram)
            </label>
          </div>
          <input
            type="text"
            disabled={logWebOnly}
            value={logDestination}
            onChange={(e) => setLogDestination(e.target.value)}
            placeholder="@teleboslogging_bot or user_id"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
          />
          <p className="text-xs text-gray-400">
            The broadcasting account will send each cycle's summary here. Default: @teleboslogging_bot
          </p>
        </div>

        {/* Loop info banner */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary-100 text-primary-700">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-900">{_("newBroadcast.loopTitle")}</p>
              <p className="text-xs text-primary-700 mt-0.5">
                {_("newBroadcast.loopDesc")}
              </p>
            </div>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handlePreStart}
          disabled={
            selectedAccountIds.length === 0 || !groupListId || startMutation.isPending ||
            (mode === "multi_random" && !textListId) ||
            (mode === "single_text" && !customText.trim())
          }
          className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition flex items-center justify-center gap-2"
        >
          <Send className="h-4 w-4" />
          {startMutation.isPending ? _("newBroadcast.starting") : _("newBroadcast.startBroadcast")}
        </button>
        {startMutation.isError && (
          <p className="text-sm text-red-500">
            {(startMutation.error as any)?.response?.data?.detail || _("newBroadcast.failedToStart")}
          </p>
        )}
      </div>
      )}

      {/* Active job progress */}
      {activeJob && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">
                Broadcast {activeJob.id.slice(0, 8)}...
              </h2>
              {wsConnected && (
                <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                  <Wifi className="h-3 w-3" /> {_("newBroadcast.live")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium",
                activeJob.status === "running" && "bg-blue-100 text-blue-800",
                activeJob.status === "paused" && "bg-yellow-100 text-yellow-800",
                activeJob.status === "completed" && "bg-green-100 text-green-800",
                activeJob.status === "failed" && "bg-red-100 text-red-800",
                activeJob.status === "cancelled" && "bg-gray-100 text-gray-600",
              )}>
                {activeJob.status}
              </span>

              {/* Pause/Resume/Stop controls */}
              {activeJob.status === "running" && (
                <>
                  <button
                    onClick={() => actionMutation.mutate({ jobId: activeJob.id, action: "pause" })}
                    className="p-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition"
                    title={_("newBroadcast.pause")}
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setStopConfirmOpen(true)}
                    className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                    title={_("newBroadcast.stop")}
                  >
                    <Square className="h-4 w-4" />
                  </button>
                </>
              )}
              {activeJob.status === "paused" && (
                <button
                  onClick={() => actionMutation.mutate({ jobId: activeJob.id, action: "resume" })}
                  className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
                  title={_("newBroadcast.resume")}
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">{_("newBroadcast.progress")}</span>
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
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-indigo-700">{wsProgress?.cycle || 1}</p>
              <p className="text-xs text-indigo-600">{_("newBroadcast.cycle")}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">{activeJob.total_groups}</p>
              <p className="text-xs text-gray-500">{_("newBroadcast.total")}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-700">{activeJob.sent_count}</p>
              <p className="text-xs text-green-600">{_("newBroadcast.sent")}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-700">{activeJob.fail_count}</p>
              <p className="text-xs text-red-600">{_("newBroadcast.failed")}</p>
            </div>
          </div>

          {/* Live log feed (merged: REST logs + WebSocket live logs) */}
          {(jobLogs && jobLogs.length > 0) || wsLogs.length > 0 ? (
            <div className="border border-gray-100 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
              {/* Show REST logs (historical) */}
              {(jobLogs || []).slice(-30).reverse().map((log) => (
                <div key={log.id} className="px-3 py-2 text-sm flex items-center gap-2">
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium font-mono">
                    C{log.cycle_number || "?"}
                  </span>
                  {log.status === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="text-gray-700 truncate">{log.group_identifier}</span>
                  {log.error_type && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      {log.error_type}
                    </span>
                  )}
                </div>
              ))}
              {/* Show live WS logs */}
              {wsLogs.slice(-10).reverse().map((log: any, i: number) => (
                <div key={`live-${i}`} className="px-3 py-2 text-sm flex items-center gap-2 bg-green-50/50">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium font-mono">
                    C{log.cycle || "?"}
                  </span>
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700 truncate">{log.group || "..."}</span>
                  <span className="text-xs text-green-600 ml-auto">live</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={stopConfirmOpen}
        onOpenChange={setStopConfirmOpen}
        onConfirm={() => {
          if (activeJob) actionMutation.mutate({ jobId: activeJob.id, action: "stop" });
          setStopConfirmOpen(false);
        }}
        title={_("newBroadcast.stop")}
        message={_("newBroadcast.stopConfirm")}
        confirmText={_("newBroadcast.stop")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />

      {/* Warning Modal for already running broadcasts */}
      <ConfirmDialog
        open={warningOpen}
        onOpenChange={setWarningOpen}
        onConfirm={() => {
          setWarningOpen(false);
          setConfirmOpen(true);
        }}
        title="Active Broadcast Detected"
        message={`The following accounts already have a running broadcast: ${conflictNames.join(", ")}. Are you sure you want to start another broadcast with them? This might cause rate limits or conflicts.`}
        confirmText="Continue Anyway"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Final Confirmation Modal */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmStart}
        title="Confirm Broadcast Details"
        message={
          <div className="space-y-3 text-sm text-gray-600 mt-2 text-left">
            <p>Please review your broadcast settings before starting:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Accounts:</strong> {selectedAccountIds.length} selected</li>
              <li><strong>Group List:</strong> {(groupLists || []).find(g => g.id === groupListId)?.name || "-"}</li>
              <li><strong>Text Source:</strong> {mode === "single_text" ? "Custom Text" : ((textLists || []).find(t => t.id === textListId)?.name || "-")}</li>
              <li><strong>Delay per Group:</strong> {delayRandomized ? "5-30s (Random)" : `${delayPerGroup}s`}</li>
              <li><strong>Delay after Cycle:</strong> {delayAfterAll}s</li>
            </ul>
            <p className="mt-4 font-medium text-gray-900">Do you want to start this broadcast now?</p>
          </div>
        }
        confirmText={startMutation.isPending ? "Starting..." : "Start Broadcast"}
        cancelText="Cancel"
        variant="primary"
      />
    </div>
  );
}
