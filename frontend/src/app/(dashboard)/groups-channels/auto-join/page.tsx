"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import { useGroupLists, useCreateGroupList, type GroupListItem } from "@/hooks/use-broadcast";
import {
  useAutoJoinJobs,
  useAutoJoinJob,
  useStartAutoJoin,
  useAutoJoinAction,
  useAutoJoinLogs,
  useDeleteAutoJoinJob,
  type AutoJoinJob,
  type AutoJoinLog,
} from "@/hooks/use-auto-join";
import { useAutoJoinSocket } from "@/hooks/use-socket";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildJoinTasks } from "./autoJoinTaskPlan";
import { cn, formatDate } from "@/lib/utils";
import {
  Hash,
  UserPlus,
  Play,
  Pause,
  Square,
  RefreshCw,
  FileText,
  Check,
  ChevronRight,
  Layers,
  Bookmark,
  Trash2,
  History,
  Wifi,
  WifiOff,
} from "lucide-react";

/** Where the still-running job id is remembered so navigation never orphans a run. */
const ACTIVE_JOB_KEY = "telebos:auto-join-active-job";

/** How many log rows we are willing to render, newest first. */
const LOG_RENDER_CAP = 500;

type JobStatus = AutoJoinJob["status"];

const TERMINAL_STATUSES: JobStatus[] = ["completed", "cancelled", "failed"];

function isTerminal(status: JobStatus | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

/**
 * One row shape for both log sources. Persisted rows carry an `id` and a
 * `joined_at`; live WebSocket rows carry neither, so we synthesize a key and a
 * clock time for them.
 */
interface LogRow {
  key: string;
  time: string;
  accountName: string;
  target: string;
  status: AutoJoinLog["status"];
  errorType: string | null;
  detail: string;
}

/** Read the persisted id in a way that survives SSR and private-mode storage. */
function readStoredJobId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

function writeStoredJobId(jobId: string | null) {
  try {
    if (jobId) window.localStorage.setItem(ACTIVE_JOB_KEY, jobId);
    else window.localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    /* storage unavailable — the run still works, it just won't be restored */
  }
}

/**
 * Stable identity for a join attempt within one job. A job visits each
 * (account, target) pair at most once, so this is unique per log — which is
 * what lets a live WebSocket row and its later persisted twin collapse into a
 * single table row.
 */
function logIdentity(accountId: string | null | undefined, target: string | null | undefined) {
  return `${accountId ?? "?"}|${target ?? "?"}`;
}

function formatClock(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString();
}

/** Status → badge label and Tailwind classes, matching the palette already in use. */
function jobStatusBadge(status: JobStatus, t: (key: string) => string) {
  return {
    pending: {
      text: t("autoJoin.statusPending"),
      badge: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-600",
    },
    running: {
      text: t("autoJoin.statusRunning"),
      badge: "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-950/60 dark:text-primary-300 dark:border-primary-800/60",
    },
    paused: {
      text: t("autoJoin.statusPaused"),
      badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
    },
    completed: {
      text: t("autoJoin.statusCompleted"),
      badge: "bg-green-50 text-green-700 border-green-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
    },
    cancelled: {
      text: t("autoJoin.statusCancelled"),
      badge: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
    },
    failed: {
      text: t("autoJoin.statusFailed"),
      badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
    },
  }[status];
}

/**
 * Parses raw text input into clean Telegram identifiers.
 * Supports:
 * - https://t.me/username or t.me/username
 * - https://t.me/+hash or https://t.me/joinchat/hash
 * - @username
 * - bare username (5-32 alphanumeric + underscore)
 */
function parseRawTargets(text: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  const VALID_USERNAME = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

  const add = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      items.push(clean);
    }
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matched = false;

    // 1. Any t.me link
    const urlMatches = trimmed.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)?[a-zA-Z0-9_+/-]+/gi);
    if (urlMatches) {
      for (const link of urlMatches) {
        let full = link;
        if (!/^https?:\/\//i.test(full)) full = "https://" + full;
        add(full);
        matched = true;
      }
    }
    if (matched) continue;

    // 2. @mentions
    const atMatches = trimmed.match(/@[a-zA-Z][a-zA-Z0-9_]{4,31}/g);
    if (atMatches) {
      for (const m of atMatches) {
        add(m);
        matched = true;
      }
    }
    if (matched) continue;

    // 3. Bare username
    if (VALID_USERNAME.test(trimmed)) {
      add("@" + trimmed);
    }
  }

  return items;
}

export default function AutoJoinPage() {
  const _ = useT();
  const { toast } = useToast();

  // Accounts
  const { data: rawAccounts, isLoading: accountsLoading } = useAccounts({ is_active: true, limit: 1000 });
  const activeAccounts = useMemo(() => {
    return (rawAccounts || []).filter((a) => a.is_active && !a.for_sale);
  }, [rawAccounts]);

  // Saved Group Lists
  const { data: savedGroupLists, isLoading: listsLoading } = useGroupLists();
  const createGroupListMutation = useCreateGroupList();

  // Mode: "bulk" (paste) or "saved" (select list)
  const [sourceMode, setSourceMode] = useState<"bulk" | "saved">("bulk");

  // Bulk input state
  const [bulkText, setBulkText] = useState("");
  const parsedTargets = useMemo(() => parseRawTargets(bulkText), [bulkText]);

  // Save to group list dialog
  const [showSaveListInput, setShowSaveListInput] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isSavingList, setIsSavingList] = useState(false);

  // Saved list selection
  const [selectedListId, setSelectedListId] = useState<string>("");
  const activeSavedList = useMemo(() => {
    return (savedGroupLists || []).find((l) => l.id === selectedListId);
  }, [savedGroupLists, selectedListId]);

  // Selected accounts (Set of account IDs)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());

  // Execution Settings
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [randomizeDelay, setRandomizeDelay] = useState<boolean>(true);
  const [distributionMode, setDistributionMode] = useState<"all" | "distribute">("all");

  // ── Job tracking ──────────────────────────────────────────────────────────
  // The run lives in the backend worker; this page only watches it. The active
  // job id is persisted so navigating away and back re-attaches to a run that
  // is still going instead of orphaning it.
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobLoaded, setActiveJobLoaded] = useState(false);

  useEffect(() => {
    setActiveJobId(readStoredJobId());
    setActiveJobLoaded(true);
  }, []);

  const { data: job, isLoading: jobLoading, isError: jobError, refetch: refetchJob } = useAutoJoinJob(activeJobId);
  const { connected, logs: liveLogs, phaseMessage } = useAutoJoinSocket(activeJobId);
  const { data: persistedLogs } = useAutoJoinLogs(activeJobId);
  const { data: recentJobs, isLoading: historyLoading } = useAutoJoinJobs(20);
  const startMutation = useStartAutoJoin();
  const actionMutation = useAutoJoinAction(activeJobId ?? "");
  const deleteMutation = useDeleteAutoJoinJob();

  const jobStatus = job?.status;

  // Poll the job row while it is live. The WebSocket streams logs but the job
  // counters live in the database, so a slow poll keeps them honest even if the
  // socket drops.
  useEffect(() => {
    if (!activeJobId || isTerminal(jobStatus)) return;
    const id = window.setInterval(() => {
      refetchJob();
    }, 3000);
    return () => window.clearInterval(id);
  }, [activeJobId, jobStatus, refetchJob]);

  const isJobActive = !!job && !isTerminal(jobStatus);
  const isRunning = jobStatus === "running" || jobStatus === "paused";
  const isPaused = jobStatus === "paused";
  const progressPercent = Math.min(100, Math.max(0, job?.progress ?? 0));

  const normalizedLogs = useMemo<LogRow[]>(() => {
    const rows: LogRow[] = [];
    const seen = new Set<string>();

    const push = (identity: string, row: LogRow) => {
      if (seen.has(identity)) return;
      seen.add(identity);
      rows.push(row);
    };

    // Persisted rows first so their real joined_at wins for a given attempt.
    persistedLogs?.forEach((log) => {
      push(logIdentity(log.account_id_used, log.target), {
        key: log.id,
        time: formatClock(log.joined_at),
        accountName: log.account_name || "—",
        target: log.target,
        status: log.status,
        errorType: log.error_type,
        detail: log.error_message || log.chat_title || log.chat_type || "—",
      });
    });

    // Live rows have no id and no joined_at. Keying them by (account, target)
    // means that when the row is later persisted, the two collapse instead of
    // the table showing every attempt twice.
    liveLogs.forEach((raw) => {
      const entry = raw as Partial<AutoJoinLog>;
      push(logIdentity(entry.account_id_used, entry.target), {
        key: `live:${logIdentity(entry.account_id_used, entry.target)}`,
        time: formatClock(null),
        accountName: entry.account_name || "—",
        target: entry.target || "—",
        status: (entry.status as AutoJoinLog["status"]) || "error",
        errorType: entry.error_type ?? null,
        detail: entry.error_message || entry.chat_title || entry.chat_type || "—",
      });
    });

    // The API returns newest-first; keep that order across the merged list.
    return rows;
  }, [persistedLogs, liveLogs]);

  const visibleLogs = useMemo(
    () => normalizedLogs.slice(0, LOG_RENDER_CAP),
    [normalizedLogs]
  );

  const attachJob = (jobId: string | null) => {
    setActiveJobId(jobId);
    writeStoredJobId(jobId);
  };

  // Forget the persisted job once it finishes — the history table still has it.
  useEffect(() => {
    if (activeJobId && isTerminal(job?.status)) {
      writeStoredJobId(null);
    }
  }, [activeJobId, job?.status]);

  // A job id that no longer resolves (deleted elsewhere, or from another tab)
  // must not leave the page stuck on a permanent "loading" spinner.
  useEffect(() => {
    if (activeJobId && jobError) {
      attachJob(null);
    }
  }, [activeJobId, jobError]);

  // Auto-select first account if none selected
  useEffect(() => {
    if (activeAccounts.length > 0 && selectedAccountIds.size === 0) {
      setSelectedAccountIds(new Set([activeAccounts[0].id]));
    }
  }, [activeAccounts]);

  // Effective targets list
  const effectiveTargets = useMemo(() => {
    if (sourceMode === "bulk") {
      return parsedTargets;
    }
    if (sourceMode === "saved" && activeSavedList) {
      return activeSavedList.items.map((it) => it.value);
    }
    return [];
  }, [sourceMode, parsedTargets, activeSavedList]);

  /**
   * How many joins this configuration would produce. Purely a preview of what
   * the worker will do — the worker owns the real run and its own pacing.
   */
  const estimatedJoins = useMemo(() => {
    const selected = activeAccounts.filter((a) => selectedAccountIds.has(a.id));
    if (selected.length === 0 || effectiveTargets.length === 0) return 0;
    return buildJoinTasks(effectiveTargets, selected, distributionMode).length;
  }, [effectiveTargets, activeAccounts, selectedAccountIds, distributionMode]);

  // Toggle account selection
  const toggleAccount = (id: string) => {
    if (isRunning) return;
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllAccounts = () => {
    if (isRunning) return;
    setSelectedAccountIds(new Set(activeAccounts.map((a) => a.id)));
  };

  const deselectAllAccounts = () => {
    if (isRunning) return;
    setSelectedAccountIds(new Set());
  };

  // Save current bulk text to group lists
  const handleSaveToGroupList = async () => {
    if (!newListName.trim() || parsedTargets.length === 0) return;
    setIsSavingList(true);
    try {
      const items: GroupListItem[] = parsedTargets.map((t) => ({
        type: t.startsWith("http") ? "link" : "username",
        value: t,
      }));
      await createGroupListMutation.mutateAsync({
        name: newListName.trim(),
        items,
      });
      toast({
        variant: "success",
        title: "Group List Disimpan",
        description: `Berhasil menyimpan "${newListName.trim()}" dengan ${items.length} target.`,
      });
      setNewListName("");
      setShowSaveListInput(false);
    } catch (err: any) {
      toast({
        variant: "error",
        title: "Gagal Menyimpan",
        description: err?.response?.data?.detail || "Terjadi kesalahan saat menyimpan list.",
      });
    } finally {
      setIsSavingList(false);
    }
  };

  // Hand the run to the backend worker. Everything after this is observation.
  const handleStart = async () => {
    if (effectiveTargets.length === 0) {
      toast({
        variant: "error",
        title: "Target Kosong",
        description: "Silakan masukkan target atau pilih Group List yang memiliki target.",
      });
      return;
    }

    const selectedAccountsList = activeAccounts.filter((a) => selectedAccountIds.has(a.id));
    if (selectedAccountsList.length === 0) {
      toast({
        variant: "error",
        title: "Akun Belum Dipilih",
        description: "Pilih setidaknya satu akun Telegram yang aktif untuk mulai bergabung.",
      });
      return;
    }

    // The same per-group pacing the worker applies is previewed here so the
    // button can tell the user how big the run will be.
    const tasks = buildJoinTasks(effectiveTargets, selectedAccountsList, distributionMode);

    try {
      const created = await startMutation.mutateAsync({
        account_ids: selectedAccountsList.map((a) => a.id),
        targets: effectiveTargets.map((value) => ({
          type: value.startsWith("http") ? "link" : "username",
          value,
        })),
        distribution_mode: distributionMode,
        delay_per_group: delaySeconds,
        delay_randomized: randomizeDelay,
      });
      attachJob(created.id);
      toast({
        variant: "info",
        title: "Auto Join Dimulai",
        description: `Memproses ${tasks.length} total join untuk ${selectedAccountsList.length} akun di worker backend.`,
      });
    } catch {
      /* the mutation already surfaced a toast */
    }
  };

  const handleJobAction = (action: "pause" | "resume" | "stop") => {
    if (!activeJobId) return;
    actionMutation.mutate(action);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (jobId === activeJobId) {
      attachJob(null);
    }
    try {
      await deleteMutation.mutateAsync(jobId);
    } catch {
      /* the mutation already surfaced a toast */
    }
  };

  const canStart = effectiveTargets.length > 0 && selectedAccountIds.size > 0 && !startMutation.isPending;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary-600 mb-1">
            <Link href="/groups-channels" className="hover:underline flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              Grup & Saluran
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-gray-500">Auto Join</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <UserPlus className="h-6 w-6 text-primary-600" />
            Auto Join Groups & Channels
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
            Bergabung ke banyak grup dan channel Telegram secara massal dengan akun Anda. Masukkan link atau username secara manual atau gunakan daftar dari Group Lists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/broadcast/group-lists"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-slate-200 transition-colors"
          >
            <Bookmark className="h-4 w-4 text-primary-500" />
            Kelola Group Lists
          </Link>
          <Link
            href="/groups-channels"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-slate-200 transition-colors"
          >
            <Hash className="h-4 w-4 text-primary-500" />
            Lihat My Chats
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Source Input & Account Selection (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Target Groups/Channels */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Daftar Grup / Saluran Target</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-300">Pilih sumber target yang akan diikuti</p>
                </div>
              </div>

              {/* Source Switcher Tabs */}
              <div className="flex bg-gray-100 dark:bg-slate-700/80 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSourceMode("bulk")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-colors",
                    sourceMode === "bulk"
                      ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-bold"
                      : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100"
                  )}
                >
                  Input Massal
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("saved")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5",
                    sourceMode === "saved"
                      ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-bold"
                      : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100"
                  )}
                >
                  <Bookmark className="h-3 w-3 text-primary-500" />
                  Group Lists
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {sourceMode === "bulk" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700 dark:text-slate-200">Tempel Link / Username per baris:</span>
                    <span className="text-gray-400 dark:text-slate-400 font-mono">
                      {parsedTargets.length} target terdeteksi
                    </span>
                  </div>

                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    disabled={isRunning}
                    placeholder={"https://t.me/telegram\nhttps://t.me/+AbCdEfGhIjK\n@channelusername\nhttps://t.me/joinchat/XyZ123\ngroupusername"}
                    className="h-36 font-mono text-xs leading-relaxed bg-gray-50/50 dark:bg-slate-900/90 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 resize-y"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <div className="text-gray-500 dark:text-slate-400 text-xs leading-relaxed">
                      Format: <code className="bg-gray-100 dark:bg-slate-700 dark:text-slate-200 px-1 py-0.5 rounded font-mono">@user</code>,{" "}
                      <code className="bg-gray-100 dark:bg-slate-700 dark:text-slate-200 px-1 py-0.5 rounded font-mono">t.me/name</code>, atau link private{" "}
                      <code className="bg-gray-100 dark:bg-slate-700 dark:text-slate-200 px-1 py-0.5 rounded font-mono">t.me/+hash</code>.
                    </div>

                    <div className="flex items-center gap-2">
                      {bulkText && (
                        <button
                          type="button"
                          onClick={() => setBulkText("")}
                          disabled={isRunning}
                          className="text-gray-400 hover:text-red-500 font-medium transition"
                        >
                          Hapus
                        </button>
                      )}
                      {parsedTargets.length > 0 && !showSaveListInput && (
                        <button
                          type="button"
                          onClick={() => setShowSaveListInput(true)}
                          className="text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 transition"
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                          Simpan ke Group List
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Save to Group List inline dialog */}
                  {showSaveListInput && (
                    <div className="bg-primary-50/60 border border-primary-200 rounded-xl p-3.5 space-y-2.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary-900">
                          Simpan {parsedTargets.length} target ke Group List baru
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSaveListInput(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="Nama list (cth: Channel Crypto & Airdrop)"
                          className="flex-1 px-3 py-1.5 bg-white border border-primary-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <Button
                          size="sm"
                          disabled={!newListName.trim() || isSavingList}
                          onClick={handleSaveToGroupList}
                          className="text-xs rounded-lg px-3"
                        >
                          {isSavingList ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Simpan"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Saved Group List Selector */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Pilih Group List Tersimpan:
                    </label>
                    <Select
                      value={selectedListId || "_none"}
                      onValueChange={(val) => setSelectedListId(val === "_none" ? "" : val)}
                      disabled={isRunning || listsLoading}
                    >
                      <SelectTrigger className="w-full h-10 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900">
                        <SelectValue placeholder="-- Pilih Group List --" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">-- Pilih Group List --</SelectItem>
                        {(savedGroupLists || []).map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            {list.name} ({list.items.length} target)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {activeSavedList ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-900">{activeSavedList.name}</span>
                        <Badge variant="outline" className="bg-white text-xs font-mono">
                          {activeSavedList.items.length} target
                        </Badge>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {activeSavedList.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs font-mono bg-white border border-gray-150 px-2.5 py-1 rounded-md text-gray-700 truncate"
                          >
                            <span className="truncate">{it.value}</span>
                            <span className="text-[10px] text-gray-400 uppercase font-sans ml-2">{it.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs">
                      Belum ada list yang dipilih. Silakan pilih list di atas atau gunakan mode Input Massal.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Account Selection */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Pilih Akun Telegram</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-300">
                    {selectedAccountIds.size} dari {activeAccounts.length} akun aktif dipilih
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={selectAllAccounts}
                  disabled={isRunning || activeAccounts.length === 0}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 disabled:opacity-50"
                >
                  Pilih Semua
                </button>
                <span className="text-gray-300 dark:text-slate-600">|</span>
                <button
                  type="button"
                  onClick={deselectAllAccounts}
                  disabled={isRunning || selectedAccountIds.size === 0}
                  className="text-gray-500 dark:text-slate-300 hover:text-gray-700 dark:hover:text-white disabled:opacity-50"
                >
                  Batal
                </button>
              </div>
            </div>

            <div className="p-5">
              {accountsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400 dark:text-slate-400 text-xs gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary-500" />
                  Memuat akun...
                </div>
              ) : activeAccounts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-slate-400 text-xs">
                  Tidak ada akun aktif yang tersedia. Tambahkan atau sambungkan akun terlebih dahulu.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {activeAccounts.map((acc) => {
                    const isSelected = selectedAccountIds.has(acc.id);
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleAccount(acc.id)}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-xl transition-colors cursor-pointer select-none text-xs",
                          isSelected
                            ? "bg-primary-50 dark:bg-primary-950/60 text-primary-950 dark:text-primary-200 font-medium"
                            : "text-gray-700 dark:text-slate-200 hover:bg-gray-100/70 dark:hover:bg-slate-700/60",
                          isRunning && "pointer-events-none opacity-80"
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded flex items-center justify-center border transition",
                            isSelected
                              ? "bg-primary-600 border-primary-600 text-white"
                              : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <div className="truncate flex-1">
                          <p className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                            {acc.first_name || "Tanpa Nama"} {acc.last_name || ""}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-300 font-mono">{acc.phone}</p>
                        </div>
                        {acc.spam_status === "limited" ? (
                          <Badge variant="outline" className="text-[11px] font-semibold bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50 shrink-0">
                            Limited
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px] font-semibold bg-green-50 text-green-700 border-green-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 shrink-0">
                            Normal
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Execution Config & Live Progress (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 3: Execution Settings */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100 dark:border-slate-700">
              <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Pengaturan Eksekusi</h2>
                <p className="text-xs text-gray-500 dark:text-slate-300">Jeda dan distribusi tugas antar akun</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-gray-700 dark:text-slate-200">Jeda Antar Grup:</span>
                  <span className="font-bold text-primary-600 dark:text-primary-400 font-mono">{delaySeconds} Detik</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full accent-primary-600 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-slate-300 font-mono mt-0.5">
                  <span>2s (Cepat)</span>
                  <span>5s (Disarankan)</span>
                  <span>30s (Sangat Aman)</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100 dark:border-slate-700">
                <div>
                  <span className="font-semibold text-gray-800 dark:text-slate-100">Randomize Jitter (± 2s)</span>
                  <p className="text-xs text-gray-400 dark:text-slate-300">Variasi jeda agar lebih natural</p>
                </div>
                <Checkbox
                  checked={randomizeDelay}
                  onCheckedChange={(checked) => setRandomizeDelay(Boolean(checked))}
                  disabled={isRunning}
                />
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-slate-700 space-y-2">
                <span className="text-xs font-semibold text-gray-800 dark:text-slate-100 block">Metode Distribusi Akun:</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDistributionMode("all")}
                    disabled={isRunning}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-colors",
                      distributionMode === "all"
                        ? "bg-primary-50/50 dark:bg-primary-950/40 border-primary-500/40 text-primary-950 dark:text-primary-200 font-bold"
                        : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                    )}
                  >
                    <span className="block text-xs font-bold">Semua Akun</span>
                    <span className="text-xs text-gray-500 dark:text-slate-300 font-normal">Tiap akun join ke semua target</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDistributionMode("distribute")}
                    disabled={isRunning}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-colors",
                      distributionMode === "distribute"
                        ? "bg-primary-50/50 dark:bg-primary-950/40 border-primary-500/40 text-primary-950 dark:text-primary-200 font-bold"
                        : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                    )}
                  >
                    <span className="block text-xs font-bold">Bagi Rata (Round-Robin)</span>
                    <span className="text-xs text-gray-500 dark:text-slate-300 font-normal">Bagi target antar akun</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-100 dark:border-slate-700 flex items-center gap-2">
                {!isJobActive ? (
                  <Button
                    onClick={handleStart}
                    disabled={!canStart}
                    className="flex-1 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs py-2.5 flex items-center justify-center gap-2"
                  >
                    {startMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-white" />
                    )}
                    Mulai Auto Join ({estimatedJoins} Join)
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => handleJobAction(isPaused ? "resume" : "pause")}
                      disabled={actionMutation.isPending || jobStatus === "pending"}
                      className={cn(
                        "flex-1 rounded-xl font-bold text-xs py-2.5 flex items-center justify-center gap-2 transition-colors",
                        isPaused
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-amber-600 hover:bg-amber-700 text-white"
                      )}
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-4 w-4 fill-white" /> Lanjut
                        </>
                      ) : (
                        <>
                          <Pause className="h-4 w-4 fill-white" /> Jeda Sementara
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleJobAction("stop")}
                      disabled={actionMutation.isPending}
                      variant="destructive"
                      className="rounded-xl font-bold text-xs py-2.5 px-4 flex items-center justify-center gap-1.5"
                    >
                      <Square className="h-3.5 w-3.5 fill-white" /> Hentikan
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Live Progress Stats */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-700">
              <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary-500" />
                Progres Eksekusi
              </h2>
              {job ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[11px] uppercase font-bold", jobStatusBadge(jobStatus!, _).badge)}>
                    {jobStatusBadge(jobStatus!, _).text}
                  </Badge>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] font-semibold",
                      connected ? "text-primary-600" : "text-gray-400 dark:text-slate-400"
                    )}
                    title={connected ? _("autoJoin.live") : _("autoJoin.offline")}
                  >
                    {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    {connected ? _("autoJoin.live") : _("autoJoin.offline")}
                  </span>
                </div>
              ) : null}
            </div>

            {!job ? (
              <div className="text-center py-6 text-gray-400 dark:text-slate-400 text-xs">
                {activeJobId && jobLoading ? "Memuat job..." : _("autoJoin.noActiveJob")}
              </div>
            ) : (
              <>
                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-slate-300">
                    <span>
                      {job.success_count + job.already_count + job.fail_count} / {job.total_tasks} tugas
                    </span>
                    <span className="font-bold text-gray-900 dark:text-slate-100">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-primary-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Metric counters — these live on the job row, not in the browser */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-slate-700/70 pt-2 text-center">
                  <div className="px-2">
                    <span className="block text-lg font-bold text-green-700 dark:text-emerald-300">{job.success_count}</span>
                    <span className="text-xs text-green-600 dark:text-emerald-400 font-semibold">{_("autoJoin.success")}</span>
                  </div>
                  <div className="px-2">
                    <span className="block text-lg font-bold text-blue-700 dark:text-blue-300">{job.already_count}</span>
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{_("autoJoin.already")}</span>
                  </div>
                  <div className="px-2">
                    <span className="block text-lg font-bold text-rose-700 dark:text-rose-300">{job.fail_count}</span>
                    <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{_("autoJoin.failed")}</span>
                  </div>
                </div>

                {phaseMessage && (
                  <p className="text-xs text-gray-500 dark:text-slate-300 pt-1 border-t border-gray-100 dark:border-slate-700">
                    {phaseMessage}
                  </p>
                )}

                {isJobActive && (
                  <p className="text-xs text-gray-400 dark:text-slate-400 pt-1 border-t border-gray-100 dark:border-slate-700">
                    {_("autoJoin.runningInWorker")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Live Log Console Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Log Aktivitas Real-Time</h2>
            <Badge variant="outline" className="text-[11px] bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-200 font-mono ml-1">
              {normalizedLogs.length} catatan
            </Badge>
            {job && (
              <Badge variant="outline" className="text-[11px] bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-300 font-mono">
                {job.id.slice(0, 8)}
              </Badge>
            )}
          </div>
        </div>

        <div className="p-0">
          {visibleLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-400 text-xs">
              {activeJobId
                ? "Belum ada log untuk job ini."
                : activeJobLoaded
                  ? "Belum ada log aktivitas. Mulai auto join untuk melihat hasil di sini."
                  : "Memuat..."}
            </div>
          ) : (
            <>
              {normalizedLogs.length > LOG_RENDER_CAP && (
                <p className="px-4 py-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40">
                  {_("autoJoin.logCap", { shown: visibleLogs.length, total: normalizedLogs.length })}
                </p>
              )}
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <Table className="w-full text-left text-xs">
                  <TableHeader className="bg-gray-50 dark:bg-slate-700/70 text-gray-500 dark:text-slate-200 font-semibold sticky top-0 border-b border-gray-100 dark:border-slate-700 [&_tr]:border-b-0">
                    <TableRow className="hover:bg-gray-50 dark:hover:bg-slate-700/70 border-b-0">
                      <TableHead className="py-2.5 px-4 w-24">{_("autoJoin.created")}</TableHead>
                      <TableHead className="py-2.5 px-4 w-36">{_("autoJoin.detail")}</TableHead>
                      <TableHead className="py-2.5 px-4">Target</TableHead>
                      <TableHead className="py-2.5 px-4 w-32">{_("autoJoin.status")}</TableHead>
                      <TableHead className="py-2.5 px-4">{_("autoJoin.detail")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-slate-700 font-mono text-[11px]">
                    {visibleLogs.map((log) => {
                      const statusConfig = {
                        success: { text: _("autoJoin.success"), badge: "bg-green-50 text-green-700 border-green-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50" },
                        already_member: { text: _("autoJoin.already"), badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50" },
                        error: { text: _("autoJoin.failed"), badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50" },
                      }[log.status] ?? {
                        text: log.status,
                        badge: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
                      };

                      return (
                        <TableRow key={log.key} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                          <TableCell className="py-2.5 px-4 text-gray-400 dark:text-slate-300 whitespace-nowrap">{log.time}</TableCell>
                          <TableCell className="py-2.5 px-4 whitespace-nowrap">
                            <span className="font-semibold text-gray-900 dark:text-slate-100 block font-sans">{log.accountName}</span>
                            {log.errorType && (
                              <span className="text-gray-400 dark:text-slate-300 text-[11px]">{log.errorType}</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2.5 px-4 text-gray-800 dark:text-slate-200 font-bold max-w-xs truncate" title={log.target}>
                            {log.target}
                          </TableCell>
                          <TableCell className="py-2.5 px-4 whitespace-nowrap">
                            <Badge variant="outline" className={cn("text-[11px] uppercase font-sans font-bold", statusConfig.badge)}>
                              {statusConfig.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2.5 px-4 text-gray-600 dark:text-slate-300 font-sans max-w-md truncate" title={log.detail}>
                            {log.detail}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Job History */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
          <History className="h-4 w-4 text-primary-500" />
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">{_("autoJoin.history")}</h2>
            <p className="text-xs text-gray-500 dark:text-slate-300">{_("autoJoin.historyDesc")}</p>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 dark:text-slate-400 text-xs gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-primary-500" />
            Memuat riwayat...
          </div>
        ) : (recentJobs || []).length === 0 ? (
          <div className="text-center py-10 text-gray-400 dark:text-slate-400 text-xs">{_("autoJoin.noJobs")}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-xs">
              <TableHeader className="bg-gray-50 dark:bg-slate-700/70 text-gray-500 dark:text-slate-200 font-semibold border-b border-gray-100 dark:border-slate-700">
                <TableRow className="hover:bg-gray-50 dark:hover:bg-slate-700/70 border-b-0">
                  <TableHead className="py-2.5 px-4 w-24">{_("autoJoin.jobId")}</TableHead>
                  <TableHead className="py-2.5 px-4 w-40">{_("autoJoin.created")}</TableHead>
                  <TableHead className="py-2.5 px-4 w-32">{_("autoJoin.status")}</TableHead>
                  <TableHead className="py-2.5 px-4 w-40">{_("autoJoin.progress")}</TableHead>
                  <TableHead className="py-2.5 px-4">{_("autoJoin.detail")}</TableHead>
                  <TableHead className="py-2.5 px-4 w-24" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-slate-700">
                {(recentJobs || []).map((row) => {
                  const isActiveRow = row.id === activeJobId;
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => attachJob(row.id)}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isActiveRow
                          ? "bg-primary-50/60 dark:bg-primary-950/30"
                          : "hover:bg-gray-50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <TableCell className="py-2.5 px-4 font-mono text-gray-700 dark:text-slate-300">
                        {row.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-gray-500 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 whitespace-nowrap">
                        <Badge variant="outline" className={cn("text-[11px] uppercase font-bold", jobStatusBadge(row.status, _).badge)}>
                          {jobStatusBadge(row.status, _).text}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-primary-600 h-full rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-gray-500 dark:text-slate-300">{row.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-[11px] font-sans whitespace-nowrap">
                        <span className="text-green-700 dark:text-emerald-300">{row.success_count} {_("autoJoin.success").toLowerCase()}</span>
                        <span className="text-gray-300 dark:text-slate-600"> · </span>
                        <span className="text-blue-700 dark:text-blue-300">{row.already_count} {_("autoJoin.already").toLowerCase()}</span>
                        <span className="text-gray-300 dark:text-slate-600"> · </span>
                        <span className="text-rose-700 dark:text-rose-300">{row.fail_count} {_("autoJoin.failed").toLowerCase()}</span>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        {isTerminal(row.status) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteJob(row.id);
                            }}
                            disabled={deleteMutation.isPending}
                            title={_("autoJoin.delete")}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
