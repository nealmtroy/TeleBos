"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import { useAccountFolders } from "@/hooks/use-account-folders";
import { AccountSelector } from "@/components/accounts/account-selector";
import {
  useAutoLeaveJobs,
  useAutoLeaveJob,
  useStartAutoLeave,
  useAutoLeaveAction,
  useAutoLeaveLogs,
  useDeleteAutoLeaveJob,
  useAutoLeaveScan,
  type AutoLeaveJob,
  type AutoLeaveLog,
  type AccountDialogCountItem,
} from "@/hooks/use-auto-leave";
import { useAutoLeaveSocket } from "@/hooks/use-socket";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatDate } from "@/lib/utils";
import {
  Hash,
  UserMinus,
  Play,
  Pause,
  Square,
  RefreshCw,
  Check,
  ChevronRight,
  Trash2,
  History,
  Wifi,
  WifiOff,
  Shield,
  Crown,
  Users,
  Radio,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sliders,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";

const ACTIVE_JOB_KEY = "telebos:auto-leave-active-job";
const LOG_RENDER_CAP = 500;

type JobStatus = AutoLeaveJob["status"];
const TERMINAL_STATUSES: JobStatus[] = ["completed", "cancelled", "failed"];

function isTerminal(status: JobStatus | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

interface LogRow {
  key: string;
  time: string;
  accountName: string;
  target: string;
  chatType: string | null;
  status: AutoLeaveLog["status"];
  errorType: string | null;
  detail: string;
}

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
    /* storage unavailable */
  }
}

export default function AutoLeavePage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);

  // Accounts
  const { data: rawAccounts, isLoading: accountsLoading } = useAccounts({ is_active: true, limit: 1000 });
  const { data: folders } = useAccountFolders();
  const activeAccounts = useMemo(() => {
    return (rawAccounts || []).filter((a) => a.is_active && !a.for_sale);
  }, [rawAccounts]);

  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());

  // Target types: Leave Groups only, Leave Channels only, or both
  const [leaveGroups, setLeaveGroups] = useState<boolean>(true);
  const [leaveChannels, setLeaveChannels] = useState<boolean>(false);

  // Settings
  const [skipCreator, setSkipCreator] = useState<boolean>(true);
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [randomizeDelay, setRandomizeDelay] = useState<boolean>(false);

  // Dialog scanning state
  const scanMutation = useAutoLeaveScan();
  const [scannedAccounts, setScannedAccounts] = useState<Record<string, AccountDialogCountItem>>({});
  const [hasScanned, setHasScanned] = useState(false);

  // Active Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Live WebSocket
  const { connected: wsConnected, progress: wsProgress, logs: wsLogs, phaseMessage } = useAutoLeaveSocket(activeJobId);

  // API Queries & Mutations
  const { data: activeJob, refetch: refetchActiveJob } = useAutoLeaveJob(activeJobId);
  const { data: persistedLogs, refetch: refetchLogs } = useAutoLeaveLogs(activeJobId, LOG_RENDER_CAP);
  const { data: jobHistory, refetch: refetchHistory } = useAutoLeaveJobs(20);
  const startMutation = useStartAutoLeave();
  const actionMutation = useAutoLeaveAction(activeJobId || "");
  const deleteMutation = useDeleteAutoLeaveJob();

  // Local log accumulator for live feed
  const [liveLogs, setLiveLogs] = useState<LogRow[]>([]);
  const [floodNotice, setFloodNotice] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    const stored = readStoredJobId();
    if (stored) setActiveJobId(stored);
  }, []);

  const attachJob = (id: string | null) => {
    setActiveJobId(id);
    writeStoredJobId(id);
    setLiveLogs([]);
    setFloodNotice(null);
  };

  // Auto-scan selected accounts when scan button clicked
  const handleScanAccounts = () => {
    if (selectedAccountIds.size === 0) {
      toast.error("Pilih minimal satu akun untuk dipindai.");
      return;
    }
    scanMutation.mutate(
      { account_ids: Array.from(selectedAccountIds) },
      {
        onSuccess: (data) => {
          const map: Record<string, AccountDialogCountItem> = {};
          data.accounts.forEach((acc) => {
            map[acc.account_id] = acc;
          });
          setScannedAccounts(map);
          setHasScanned(true);
          toast.success(`Berhasil memindai ${data.accounts.length} akun.`);
        },
      }
    );
  };

  // Sync WebSocket live events into local logs
  useEffect(() => {
    if (!wsLogs || wsLogs.length === 0) return;
    const latest = wsLogs[wsLogs.length - 1];
    if (!latest) return;

    if (latest.type === "flood_wait") {
      setFloodNotice(latest.message || `Flood wait Telegram. Menunggu ${latest.wait_seconds || 30}s...`);
    } else if (latest.type === "progress" || latest.type === "item_skipped") {
      setFloodNotice(null);
      const isSkipped = latest.type === "item_skipped";
      const newRow: LogRow = {
        key: `live-${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString(),
        accountName: latest.account_name || "Akun",
        target: latest.target || "-",
        chatType: latest.chat_type || (leaveGroups && !leaveChannels ? "group" : leaveChannels && !leaveGroups ? "channel" : null),
        status: isSkipped ? "skipped" : latest.target_status || "success",
        errorType: latest.error_type || null,
        detail: latest.error_message || latest.reason || (isSkipped ? "Dilewati (Creator)" : "Berhasil keluar"),
      };
      setLiveLogs((prev) => [newRow, ...prev].slice(0, LOG_RENDER_CAP));
    }
  }, [wsLogs, leaveGroups, leaveChannels]);

  // Combine live and persisted logs
  const combinedLogs: LogRow[] = useMemo(() => {
    if (liveLogs.length > 0) return liveLogs;
    if (!persistedLogs) return [];
    return persistedLogs.map((p) => ({
      key: p.id,
      time: new Date(p.left_at).toLocaleTimeString(),
      accountName: p.account_name || "Akun",
      target: p.target,
      chatType: p.chat_type,
      status: p.status,
      errorType: p.error_type,
      detail: p.error_message || (p.status === "success" ? "Berhasil keluar" : p.status === "skipped" ? "Dilewati" : "Gagal"),
    }));
  }, [liveLogs, persistedLogs]);

  const currentJobStatus = wsProgress?.status || activeJob?.status || "pending";
  const isRunning = currentJobStatus === "running";
  const isPaused = currentJobStatus === "paused";

  // Scan totals across selected accounts
  const totalScannedGroups = useMemo(() => {
    let count = 0;
    selectedAccountIds.forEach((id) => {
      if (scannedAccounts[id]) count += scannedAccounts[id].group_count;
    });
    return count;
  }, [selectedAccountIds, scannedAccounts]);

  const totalScannedChannels = useMemo(() => {
    let count = 0;
    selectedAccountIds.forEach((id) => {
      if (scannedAccounts[id]) count += scannedAccounts[id].channel_count;
    });
    return count;
  }, [selectedAccountIds, scannedAccounts]);

  // Handle start auto leave
  const handleStartAutoLeave = async () => {
    if (selectedAccountIds.size === 0) {
      toast.error("Pilih minimal satu akun Telegram.");
      return;
    }
    if (!leaveGroups && !leaveChannels) {
      toast.error("Pilih minimal satu target: Tinggalkan Grup atau Tinggalkan Channel.");
      return;
    }

    const leaveType: "groups" | "channels" | "both" =
      leaveGroups && leaveChannels ? "both" : leaveGroups ? "groups" : "channels";

    try {
      const job = await startMutation.mutateAsync({
        account_ids: Array.from(selectedAccountIds),
        leave_type: leaveType,
        skip_creator: skipCreator,
        delay_per_chat: delaySeconds,
        delay_randomized: randomizeDelay,
      });

      attachJob(job.id);
      refetchHistory();
      toast.success(
        job.related_job_ids && job.related_job_ids.length > 1
          ? `Memulai auto leave untuk ${job.related_job_ids.length} akun!`
          : "Auto leave berhasil dimulai!"
      );
    } catch (err: any) {
      /* Handled by onError */
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
    await deleteMutation.mutateAsync(jobId);
  };

  const canStart = selectedAccountIds.size > 0 && (leaveGroups || leaveChannels) && !startMutation.isPending && !isRunning;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary-600 mb-1">
            <Link href="/groups-channels" className="hover:underline flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              Grup & Channel
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Auto Leave</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <UserMinus className="h-6 w-6 text-primary-600" />
            Auto Leave Grup & Channel
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">
            Keluar dari banyak grup dan channel Telegram secara otomatis dengan pacing pintar dan proteksi FloodWait.
          </p>
        </div>

        {activeJobId && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "px-2.5 py-1 text-xs font-semibold gap-1.5",
                wsConnected
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              )}
            >
              {wsConnected ? <Wifi className="h-3.5 w-3.5 animate-pulse" /> : <WifiOff className="h-3.5 w-3.5" />}
              {wsConnected ? "Live WebSocket" : "Offline"}
            </Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Account Selection & Target Choice (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Account Selection */}
          <div className="space-y-3">
            <AccountSelector
              accounts={activeAccounts}
              isLoading={accountsLoading}
              selectedAccountIds={selectedAccountIds}
              onChange={(ids) => setSelectedAccountIds(new Set(ids))}
              title="Pilih Akun Telegram"
              description="Pilih satu atau lebih akun yang ingin dijalankan auto leave."
              stepNumber="1"
              folders={folders}
              disabled={isRunning}
              columns={2}
              maxHeight="max-h-60"
            />

            {/* Scan Button & Account Stats */}
            {selectedAccountIds.size > 0 && (
              <div className="bg-card text-card-foreground rounded-xl border border-border p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary-600" />
                    <span className="text-xs font-bold text-foreground">
                      {selectedAccountIds.size} Akun Dipilih
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleScanAccounts}
                    disabled={scanMutation.isPending || isRunning}
                    className="text-xs h-8 gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", scanMutation.isPending && "animate-spin")} />
                    {scanMutation.isPending ? "Memindai..." : "Pindai Jumlah Grup & Channel"}
                  </Button>
                </div>

                {hasScanned && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-primary/5 border border-primary/15 rounded-lg p-2.5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 text-primary-600 flex items-center justify-center">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Total Grup Ditemukan</p>
                          <p className="text-base font-bold text-foreground font-mono">{totalScannedGroups}</p>
                        </div>
                      </div>

                      <div className="bg-violet-500/5 border border-violet-500/15 rounded-lg p-2.5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-violet-500/10 text-violet-600 flex items-center justify-center">
                          <Radio className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Total Channel Ditemukan</p>
                          <p className="text-base font-bold text-foreground font-mono">{totalScannedChannels}</p>
                        </div>
                      </div>
                    </div>

                    {/* Per-account list breakdown */}
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pt-1 pr-1">
                      {Array.from(selectedAccountIds).map((accId) => {
                        const info = scannedAccounts[accId];
                        const acc = activeAccounts.find((a) => a.id === accId);
                        if (!info) return null;
                        return (
                          <div
                            key={accId}
                            className="flex items-center justify-between text-xs bg-muted/40 border border-border px-3 py-1.5 rounded-md"
                          >
                            <span className="font-medium text-foreground truncate max-w-[180px]">
                              {acc?.phone || acc?.first_name || accId}
                            </span>
                            <div className="flex items-center gap-2 font-mono">
                              <Badge variant="outline" className="text-2xs bg-primary/10 text-primary-700 dark:text-primary-300">
                                👥 {info.group_count} grup
                              </Badge>
                              <Badge variant="outline" className="text-2xs bg-violet-500/10 text-violet-700 dark:text-violet-300">
                                📢 {info.channel_count} chn
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Target Selection (Side-by-side cards: Groups vs Channels) */}
          <div className="bg-card text-card-foreground rounded-2xl border border-border overflow-hidden shadow-xs">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary-600 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Pilih Target yang Akan Ditinggalkan</h2>
                  <p className="text-xs text-muted-foreground">Pilih grup saja, channel saja, atau bisa pilih keduanya sekaligus.</p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left Card: Grup Saja */}
                <div
                  onClick={() => !isRunning && setLeaveGroups(!leaveGroups)}
                  className={cn(
                    "relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-3 select-none",
                    leaveGroups
                      ? "border-primary bg-primary/5 shadow-xs ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card",
                    isRunning && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary-600 flex items-center justify-center">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className={cn(
                      "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                      leaveGroups ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                    )}>
                      {leaveGroups && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-bold text-foreground">Tinggalkan Grup</h3>
                      {hasScanned && (
                        <Badge variant="outline" className="text-2xs bg-primary/10 text-primary-700 dark:text-primary-300 font-mono">
                          {totalScannedGroups} Grup
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Keluar dari semua grup obrolan biasa (Basic Chat) dan supergroup Telegram.
                    </p>
                  </div>
                </div>

                {/* Right Card: Channel Saja */}
                <div
                  onClick={() => !isRunning && setLeaveChannels(!leaveChannels)}
                  className={cn(
                    "relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-3 select-none",
                    leaveChannels
                      ? "border-violet-600 bg-violet-500/5 shadow-xs ring-2 ring-violet-500/20"
                      : "border-border hover:border-violet-500/40 bg-card",
                    isRunning && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                      <Radio className="h-5 w-5" />
                    </div>
                    <div className={cn(
                      "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                      leaveChannels ? "bg-violet-600 border-violet-600 text-white" : "border-muted-foreground/30"
                    )}>
                      {leaveChannels && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-bold text-foreground">Tinggalkan Channel</h3>
                      {hasScanned && (
                        <Badge variant="outline" className="text-2xs bg-violet-500/10 text-violet-700 dark:text-violet-300 font-mono">
                          {totalScannedChannels} Channel
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Keluar (unfollow) dari semua siaran channel publik maupun privat Telegram.
                    </p>
                  </div>
                </div>
              </div>

              {!leaveGroups && !leaveChannels && (
                <p className="text-xs text-destructive font-medium mt-3 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Harap pilih minimal salah satu opsi di atas (Grup atau Channel).
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Execution Config & Live Monitor (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Execution Settings */}
          <div className="bg-card text-card-foreground rounded-2xl border border-border p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 pb-3 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary-600 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Pengaturan & Pacing</h2>
                <p className="text-xs text-muted-foreground">Konfigurasi jeda dan proteksi akun.</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Creator Protection Checkbox */}
              <div className="bg-muted/40 border border-border rounded-xl p-3.5 flex items-start gap-3">
                <Checkbox
                  id="skip-creator"
                  checked={skipCreator}
                  onCheckedChange={(checked) => setSkipCreator(Boolean(checked))}
                  disabled={isRunning}
                  className="mt-0.5"
                />
                <label htmlFor="skip-creator" className="text-xs cursor-pointer select-none">
                  <span className="font-bold text-foreground block">
                    Lewati grup/channel yang saya miliki (Creator)
                  </span>
                  <span className="text-muted-foreground block text-2xs mt-0.5 leading-relaxed">
                    Direkomendasikan. Telegram tidak mengizinkan pemilik grup keluar tanpa mentransfer kepemilikan.
                  </span>
                </label>
              </div>

              {/* Delay Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="delay-slider" className="font-semibold text-foreground cursor-pointer flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Jeda per Chat
                  </label>
                  <span className="font-bold text-primary-600 font-mono">{delaySeconds} detik</span>
                </div>
                <input
                  id="delay-slider"
                  type="range"
                  min="2"
                  max="30"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full accent-primary-600 cursor-pointer"
                />
                <div className="flex justify-between text-2xs text-muted-foreground font-mono mt-0.5">
                  <span>2s (Cepat)</span>
                  <span>5s (Rekomendasi)</span>
                  <span>30s (Sangat Aman)</span>
                </div>
              </div>

              {/* Jitter Delay */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
                <div>
                  <span className="font-semibold text-foreground block">Acak Jeda Waktu (Jitter)</span>
                  <p className="text-2xs text-muted-foreground">Menambahkan variasi jeda ±30% agar lebih natural.</p>
                </div>
                <Checkbox
                  checked={randomizeDelay}
                  onCheckedChange={(checked) => setRandomizeDelay(Boolean(checked))}
                  disabled={isRunning}
                />
              </div>

              {/* Action Start Button */}
              <div className="pt-2">
                <Button
                  onClick={handleStartAutoLeave}
                  disabled={!canStart}
                  className="w-full h-11 text-sm font-bold gap-2 cursor-pointer shadow-sm transition-all"
                >
                  {startMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Memulai Auto Leave...
                    </>
                  ) : (
                    <>
                      <UserMinus className="h-4 w-4" />
                      Mulai Auto Leave
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Active Job Progress & FloodWait Alert */}
          {activeJobId && (
            <div className="bg-card text-card-foreground rounded-2xl border border-border p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full animate-ping",
                    isRunning ? "bg-emerald-500" : isPaused ? "bg-amber-500" : "bg-muted-foreground"
                  )} />
                  <h3 className="text-sm font-bold text-foreground">Progres Pekerjaan</h3>
                </div>

                {/* Job Control buttons */}
                <div className="flex items-center gap-1.5">
                  {isRunning && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleJobAction("pause")}
                      disabled={actionMutation.isPending}
                      className="h-7 text-xs px-2.5 cursor-pointer gap-1"
                    >
                      <Pause className="h-3 w-3" />
                      Jeda
                    </Button>
                  )}
                  {isPaused && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleJobAction("resume")}
                      disabled={actionMutation.isPending}
                      className="h-7 text-xs px-2.5 cursor-pointer gap-1 text-emerald-600"
                    >
                      <Play className="h-3 w-3" />
                      Lanjutkan
                    </Button>
                  )}
                  {(isRunning || isPaused) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleJobAction("stop")}
                      disabled={actionMutation.isPending}
                      className="h-7 text-xs px-2.5 cursor-pointer gap-1 text-destructive hover:bg-destructive/10"
                    >
                      <Square className="h-3 w-3" />
                      Hentikan
                    </Button>
                  )}
                </div>
              </div>

              {/* FloodWait notification banner */}
              {floodNotice && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 animate-bounce" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Rate Limit Telegram (FloodWait)</p>
                    <p className="text-2xs leading-relaxed">{floodNotice}</p>
                    <p className="text-2xs text-muted-foreground">Sistem menunggu durasi selesai dan akan mencoba kembali secara otomatis.</p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Status: <strong className="text-foreground capitalize">{currentJobStatus}</strong></span>
                  <span className="font-bold text-foreground font-mono">{wsProgress?.progress ?? activeJob?.progress ?? 0}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      isRunning ? "bg-primary" : isPaused ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${wsProgress?.progress ?? activeJob?.progress ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Counter badges */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-muted/40 border border-border rounded-lg p-2">
                  <span className="text-2xs text-muted-foreground block">Berhasil</span>
                  <span className="text-sm font-bold text-emerald-600 font-mono">
                    {wsProgress?.success_count ?? activeJob?.success_count ?? 0}
                  </span>
                </div>
                <div className="bg-muted/40 border border-border rounded-lg p-2">
                  <span className="text-2xs text-muted-foreground block">Dilewati</span>
                  <span className="text-sm font-bold text-amber-600 font-mono">
                    {wsProgress?.skipped_count ?? activeJob?.skipped_count ?? 0}
                  </span>
                </div>
                <div className="bg-muted/40 border border-border rounded-lg p-2">
                  <span className="text-2xs text-muted-foreground block">Gagal</span>
                  <span className="text-sm font-bold text-destructive font-mono">
                    {wsProgress?.fail_count ?? activeJob?.fail_count ?? 0}
                  </span>
                </div>
                <div className="bg-muted/40 border border-border rounded-lg p-2">
                  <span className="text-2xs text-muted-foreground block">Total</span>
                  <span className="text-sm font-bold text-foreground font-mono">
                    {wsProgress?.total_tasks ?? activeJob?.total_tasks ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Logs Table */}
      {activeJobId && combinedLogs.length > 0 && (
        <div className="bg-card text-card-foreground rounded-2xl border border-border overflow-hidden shadow-xs">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary-600" />
              <h3 className="text-sm font-bold text-foreground">Log Aktivitas Real-Time</h3>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {combinedLogs.length} entri terbaru
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 text-xs">Waktu</TableHead>
                  <TableHead className="w-32 text-xs">Akun</TableHead>
                  <TableHead className="text-xs">Target</TableHead>
                  <TableHead className="w-24 text-xs">Jenis</TableHead>
                  <TableHead className="w-28 text-xs">Status</TableHead>
                  <TableHead className="text-xs">Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combinedLogs.map((row) => (
                  <TableRow key={row.key} className="text-xs font-medium">
                    <TableCell className="font-mono text-muted-foreground">{row.time}</TableCell>
                    <TableCell className="font-medium text-foreground truncate max-w-[120px]">{row.accountName}</TableCell>
                    <TableCell className="font-bold text-foreground truncate max-w-[200px]">{row.target}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-2xs uppercase font-mono">
                        {row.chatType || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.status === "success" ? (
                        <Badge variant="outline" className="text-2xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Berhasil
                        </Badge>
                      ) : row.status === "skipped" ? (
                        <Badge variant="outline" className="text-2xs bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                          <AlertCircle className="h-3 w-3" /> Dilewati
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-2xs bg-destructive/10 text-destructive border-destructive/20 gap-1">
                          <XCircle className="h-3 w-3" /> Gagal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[240px]">{row.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="bg-card text-card-foreground rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-bold text-foreground">Riwayat Auto Leave</h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetchHistory()}
            className="text-xs h-8 cursor-pointer gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Muat Ulang
          </Button>
        </div>

        {(!jobHistory || jobHistory.length === 0) ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Belum ada riwayat proses auto leave.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Job ID / Tanggal</TableHead>
                <TableHead className="text-xs">Target</TableHead>
                <TableHead className="text-xs">Akun</TableHead>
                <TableHead className="text-xs">Hasil</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="w-24 text-xs text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobHistory.map((job) => (
                <TableRow
                  key={job.id}
                  className={cn(
                    "text-xs cursor-pointer hover:bg-muted/50 transition-colors",
                    activeJobId === job.id && "bg-primary/5"
                  )}
                  onClick={() => attachJob(job.id)}
                >
                  <TableCell>
                    <div className="space-y-0.5">
                      <span className="font-mono font-bold text-foreground block truncate max-w-[120px]">
                        {job.id.slice(0, 8)}...
                      </span>
                      <span className="text-2xs text-muted-foreground font-mono block">
                        {formatDate(job.created_at)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-2xs uppercase">
                      {job.leave_type === "both" ? "Grup & Channel" : job.leave_type === "groups" ? "Grup Saja" : "Channel Saja"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {job.account_ids.length} Akun
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-2xs">
                      <span className="text-emerald-600 font-bold">✓{job.success_count}</span>
                      <span className="text-amber-600 font-bold">⊘{job.skipped_count}</span>
                      <span className="text-destructive font-bold">✕{job.fail_count}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-2xs capitalize font-semibold",
                        job.status === "completed" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                        job.status === "running" && "bg-primary/10 text-primary-600 border-primary/20",
                        job.status === "paused" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        job.status === "failed" && "bg-destructive/10 text-destructive border-destructive/20"
                      )}
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteJob(job.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
