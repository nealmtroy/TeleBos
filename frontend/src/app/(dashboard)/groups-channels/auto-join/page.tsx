"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import api from "@/lib/api";
import { useAccounts, type Account } from "@/hooks/use-accounts";
import { useGroupLists, useCreateGroupList, type GroupList, type GroupListItem } from "@/hooks/use-broadcast";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Users,
  Hash,
  UserPlus,
  Play,
  Pause,
  Square,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Search,
  Copy,
  FileText,
  Check,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight,
  Bookmark,
  Sparkles,
  Info,
} from "lucide-react";

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

interface JoinLog {
  id: string;
  time: string;
  accountPhone: string;
  accountName: string;
  target: string;
  status: "success" | "already_member" | "flood_wait" | "failed";
  chatTitle?: string;
  chatType?: string;
  message: string;
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

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0 });
  const [stats, setStats] = useState({ success: 0, already: 0, flood: 0, failed: 0 });
  const [logs, setLogs] = useState<JoinLog[]>([]);

  // Refs for async control
  const stopRequestedRef = useRef(false);
  const pauseRequestedRef = useRef(false);

  // Synchronize pause state to ref
  useEffect(() => {
    pauseRequestedRef.current = isPaused;
  }, [isPaused]);

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

  // Sleep utility with abort/pause support
  const sleep = (ms: number) => {
    return new Promise<void>((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (stopRequestedRef.current) {
          clearInterval(interval);
          resolve();
          return;
        }
        if (Date.now() - start >= ms) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  };

  // Wait while paused
  const waitWhilePaused = async () => {
    while (pauseRequestedRef.current && !stopRequestedRef.current) {
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  // Start execution
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

    stopRequestedRef.current = false;
    pauseRequestedRef.current = false;
    setIsRunning(true);
    setIsPaused(false);
    setStats({ success: 0, already: 0, flood: 0, failed: 0 });
    setLogs([]);

    // Plan tasks
    type Task = { account: Account; target: string };
    const tasks: Task[] = [];

    if (distributionMode === "all") {
      for (const target of effectiveTargets) {
        for (const account of selectedAccountsList) {
          tasks.push({ account, target });
        }
      }
    } else {
      // Distribute round-robin
      effectiveTargets.forEach((target, idx) => {
        const account = selectedAccountsList[idx % selectedAccountsList.length];
        tasks.push({ account, target });
      });
    }

    setCurrentProgress({ current: 0, total: tasks.length });

    toast({
      variant: "info",
      title: "Auto Join Dimulai",
      description: `Memproses ${tasks.length} total join untuk ${selectedAccountsList.length} akun.`,
    });

    for (let i = 0; i < tasks.length; i++) {
      if (stopRequestedRef.current) {
        break;
      }

      await waitWhilePaused();
      if (stopRequestedRef.current) break;

      const { account, target } = tasks[i];
      const nowStr = new Date().toLocaleTimeString();

      try {
        const response = await api.post<{
          chat_id: number;
          title: string;
          username: string | null;
          chat_type: string;
          already_joined?: boolean;
        }>(`/accounts/${account.id}/chats/join`, { identifier: target });

        const isAlready = response.data.already_joined === true;

        const newLog: JoinLog = {
          id: Math.random().toString(36).slice(2),
          time: nowStr,
          accountPhone: account.phone,
          accountName: account.first_name || "Account",
          target,
          status: isAlready ? "already_member" : "success",
          chatTitle: response.data.title,
          chatType: response.data.chat_type,
          message: isAlready
            ? `Sudah bergabung sebelumnya: "${response.data.title}"`
            : `Berhasil bergabung ke: "${response.data.title}" (${response.data.chat_type})`,
        };

        setLogs((prev) => [newLog, ...prev]);
        setStats((prev) => ({
          ...prev,
          success: isAlready ? prev.success : prev.success + 1,
          already: isAlready ? prev.already + 1 : prev.already,
        }));
      } catch (err: any) {
        const errMsg = err?.response?.data?.detail || err?.message || "Gagal bergabung";
        const isFlood = errMsg.toLowerCase().includes("flood") || errMsg.toLowerCase().includes("wait");

        const newLog: JoinLog = {
          id: Math.random().toString(36).slice(2),
          time: nowStr,
          accountPhone: account.phone,
          accountName: account.first_name || "Account",
          target,
          status: isFlood ? "flood_wait" : "failed",
          message: errMsg,
        };

        setLogs((prev) => [newLog, ...prev]);
        setStats((prev) => ({
          ...prev,
          flood: isFlood ? prev.flood + 1 : prev.flood,
          failed: isFlood ? prev.failed : prev.failed + 1,
        }));
      }

      setCurrentProgress({ current: i + 1, total: tasks.length });

      // Apply delay if there are more tasks
      if (i < tasks.length - 1 && !stopRequestedRef.current) {
        let actualDelay = delaySeconds;
        if (randomizeDelay) {
          const jitter = (Math.random() * 4 - 2); // +/- 2 seconds
          actualDelay = Math.max(2, delaySeconds + jitter);
        }
        await sleep(actualDelay * 1000);
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    toast({
      variant: "success",
      title: "Auto Join Selesai",
      description: "Semua antrean auto join telah selesai diproses.",
    });
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setIsPaused(false);
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const progressPercent = currentProgress.total > 0
    ? Math.round((currentProgress.current / currentProgress.total) * 100)
    : 0;

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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Daftar Grup / Saluran Target</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Pilih sumber target yang akan diikuti</p>
                </div>
              </div>

              {/* Source Switcher Tabs */}
              <div className="flex bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSourceMode("bulk")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-colors",
                    sourceMode === "bulk"
                      ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border border-gray-200/50 dark:border-slate-700"
                      : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
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
                      ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border border-gray-200/50 dark:border-slate-700"
                      : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
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
                    <span className="font-semibold text-gray-700">Tempel Link / Username per baris:</span>
                    <span className="text-gray-400 font-mono">
                      {parsedTargets.length} target terdeteksi
                    </span>
                  </div>

                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    disabled={isRunning}
                    placeholder={"https://t.me/telegram\nhttps://t.me/+AbCdEfGhIjK\n@channelusername\nhttps://t.me/joinchat/XyZ123\ngroupusername"}
                    className="h-36 font-mono text-xs leading-relaxed bg-gray-50/50 border-gray-200 focus:bg-white resize-y"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <div className="text-gray-500 text-[11px] leading-relaxed">
                      Format: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">@user</code>,{" "}
                      <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">t.me/name</code>, atau link private{" "}
                      <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">t.me/+hash</code>.
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
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      disabled={isRunning || listsLoading}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    >
                      <option value="">-- Pilih Group List --</option>
                      {(savedGroupLists || []).map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name} ({list.items.length} target)
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeSavedList ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-900">{activeSavedList.name}</span>
                        <Badge variant="outline" className="bg-white text-[11px] font-mono">
                          {activeSavedList.items.length} target
                        </Badge>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {activeSavedList.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-[11px] font-mono bg-white border border-gray-150 px-2.5 py-1 rounded-md text-gray-700 truncate"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Pilih Akun Telegram</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
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
                <span className="text-gray-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={deselectAllAccounts}
                  disabled={isRunning || selectedAccountIds.size === 0}
                  className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-50"
                >
                  Batal
                </button>
              </div>
            </div>

            <div className="p-5">
              {accountsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400 text-xs gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary-500" />
                  Memuat akun...
                </div>
              ) : activeAccounts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
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
                            ? "bg-primary-50 dark:bg-primary-950/50 text-primary-950 dark:text-primary-200 font-medium"
                            : "text-gray-700 dark:text-slate-300 hover:bg-gray-100/70 dark:hover:bg-slate-800/60",
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
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 font-mono">{acc.phone}</p>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Pengaturan Eksekusi</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">Jeda dan distribusi tugas antar akun</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-gray-700 dark:text-slate-300">Jeda Antar Join:</span>
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
                <div className="flex justify-between text-[11px] text-gray-400 dark:text-slate-400 font-mono mt-0.5">
                  <span>2s (Cepat)</span>
                  <span>5s (Disarankan)</span>
                  <span>30s (Sangat Aman)</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-gray-800 dark:text-slate-200">Randomize Jitter (± 2s)</span>
                  <p className="text-xs text-gray-400 dark:text-slate-400">Variasi jeda agar lebih natural</p>
                </div>
                <input
                  type="checkbox"
                  checked={randomizeDelay}
                  onChange={(e) => setRandomizeDelay(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 block">Metode Distribusi Akun:</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDistributionMode("all")}
                    disabled={isRunning}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-colors",
                      distributionMode === "all"
                        ? "bg-primary-50/50 dark:bg-primary-950/40 border-primary-500/40 text-primary-950 dark:text-primary-200 font-bold"
                        : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <span className="block text-[11px] font-bold">Semua Akun</span>
                    <span className="text-[11px] text-gray-500 dark:text-slate-400 font-normal">Tiap akun join ke semua target</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDistributionMode("distribute")}
                    disabled={isRunning}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-colors",
                      distributionMode === "distribute"
                        ? "bg-primary-50/50 dark:bg-primary-950/40 border-primary-500/40 text-primary-950 dark:text-primary-200 font-bold"
                        : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <span className="block text-[11px] font-bold">Bagi Rata (Round-Robin)</span>
                    <span className="text-[11px] text-gray-500 dark:text-slate-400 font-normal">Bagi target antar akun</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center gap-2">
                {!isRunning ? (
                  <Button
                    onClick={handleStart}
                    disabled={effectiveTargets.length === 0 || selectedAccountIds.size === 0}
                    className="flex-1 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs py-2.5 flex items-center justify-center gap-2"
                  >
                    <Play className="h-4 w-4 fill-white" />
                    Mulai Auto Join ({effectiveTargets.length} Target)
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleTogglePause}
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
                      onClick={handleStop}
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary-500" />
                Progres Eksekusi
              </h2>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs text-primary-600 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary-500 animate-ping" />
                  Berjalan...
                </span>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                <span>
                  Progres: {currentProgress.current} / {currentProgress.total}
                </span>
                <span className="font-bold text-gray-900 dark:text-slate-100">{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="bg-green-50 dark:bg-emerald-950/40 border border-green-200 dark:border-emerald-800/40 rounded-xl p-2.5">
                <span className="block text-lg font-bold text-green-700 dark:text-emerald-300">{stats.success}</span>
                <span className="text-[11px] text-green-600 dark:text-emerald-400 font-semibold">Sukses</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 rounded-xl p-2.5">
                <span className="block text-lg font-bold text-blue-700 dark:text-blue-300">{stats.already}</span>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">Member</span>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-xl p-2.5">
                <span className="block text-lg font-bold text-amber-700 dark:text-amber-300">{stats.flood}</span>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">FloodWait</span>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 rounded-xl p-2.5">
                <span className="block text-lg font-bold text-rose-700 dark:text-rose-300">{stats.failed}</span>
                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">Gagal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Log Console Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Log Aktivitas Real-Time</h2>
            <Badge variant="outline" className="text-[11px] bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-mono ml-1">
              {logs.length} catatan
            </Badge>
          </div>

          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 font-medium transition-colors"
            >
              Bersihkan Log
            </button>
          )}
        </div>

        <div className="p-0">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs">
              Belum ada log aktivitas. Mulai auto join untuk melihat hasil di sini.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800/70 text-gray-500 dark:text-slate-400 font-semibold sticky top-0 border-b border-gray-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 w-24">Waktu</th>
                    <th className="py-2.5 px-4 w-36">Akun</th>
                    <th className="py-2.5 px-4">Target</th>
                    <th className="py-2.5 px-4 w-32">Status</th>
                    <th className="py-2.5 px-4">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800 font-mono text-[11px]">
                  {logs.map((log) => {
                    const statusConfig = {
                      success: { text: "Sukses", badge: "bg-green-50 text-green-700 border-green-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50" },
                      already_member: { text: "Member", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50" },
                      flood_wait: { text: "FloodWait", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50" },
                      failed: { text: "Gagal", badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50" },
                    }[log.status];

                    return (
                      <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-4 text-gray-400 dark:text-slate-500 whitespace-nowrap">{log.time}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-gray-900 dark:text-slate-100 block font-sans">{log.accountName}</span>
                          <span className="text-gray-400 dark:text-slate-500 text-[11px]">{log.accountPhone}</span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-800 dark:text-slate-200 font-bold max-w-xs truncate" title={log.target}>
                          {log.target}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <Badge variant="outline" className={cn("text-[11px] uppercase font-sans font-bold", statusConfig.badge)}>
                            {statusConfig.text}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-slate-400 font-sans max-w-md truncate" title={log.message}>
                          {log.message}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
