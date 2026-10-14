"use client";

import React, { useState } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Clock,
  Users,
  BarChart3,
  Layers,
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  Lock,
  Shield,
  Zap,
  TrendingUp,
  RotateCw,
  Radio,
  Send,
  UserPlus,
  LogIn,
  MessageSquare,
  Eye,
  Server,
  Terminal,
  DollarSign,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  AnalyticsRange,
  useAdminAnalyticsAutomation,
  useAdminAnalyticsTimeseries,
  useAdminAutomationTasksDirectory,
  AutomationTaskHistoryItem,
} from "@/hooks/use-admin-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { AnalyticsAreaChart } from "@/components/admin/analytics-chart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function AdminAutomationAnalyticsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Authorization Guard: Owner role required
  if (currentUser?.role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="w-full max-w-md p-8 text-center bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-destructive/10 text-destructive mb-2">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {_("admin.accessDenied") || "Access Denied"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Akses ke Telemetri & Analitik Automasi hanya diberikan kepada pemilik sistem (Owner).
          </p>
          <Button asChild variant="default" className="mt-4">
            <Link href="/dashboard">Kembali ke Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <AutomationAnalyticsContent />;
}

function AutomationAnalyticsContent() {
  // Time range filters
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("7d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  // Table directory filter & pagination state
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [automationTypeFilter, setAutomationTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Timeseries chart metric toggle
  const [chartMetric, setChartMetric] = useState<
    "automation_executions" | "broadcasts" | "invites" | "autojoins"
  >("automation_executions");

  // Task details modal state
  const [selectedTask, setSelectedTask] = useState<AutomationTaskHistoryItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Query parameters formatted for backend API
  const queryParams = {
    range: selectedRange,
    start_date:
      selectedRange === "custom" && customRange?.from
        ? format(customRange.from, "yyyy-MM-dd")
        : undefined,
    end_date:
      selectedRange === "custom" && customRange?.to
        ? format(customRange.to, "yyyy-MM-dd")
        : undefined,
  };

  // Queries
  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
    isFetching: isAnalyticsFetching,
  } = useAdminAnalyticsAutomation(queryParams);

  const {
    data: timeseriesData,
    isLoading: isTimeseriesLoading,
    refetch: refetchTimeseries,
  } = useAdminAnalyticsTimeseries(chartMetric, queryParams);

  const {
    data: directoryData,
    isLoading: isDirectoryLoading,
    error: directoryError,
    refetch: refetchDirectory,
    isFetching: isDirectoryFetching,
  } = useAdminAutomationTasksDirectory({
    search: activeSearch || undefined,
    automation_type: automationTypeFilter !== "all" ? automationTypeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    page_size: 10,
  });

  const isRefreshing = isAnalyticsFetching || isDirectoryFetching;

  const handleRefreshAll = () => {
    refetchAnalytics();
    refetchTimeseries();
    refetchDirectory();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchInput.trim());
    setPage(1);
  };

  const handleViewTaskDetail = (task: AutomationTaskHistoryItem) => {
    setSelectedTask(task);
    setIsDetailOpen(true);
  };

  // Metrics extraction
  const perfMetrics = analyticsData?.performance;
  const totalExecutions = perfMetrics?.total_execution_attempts ?? 0;
  const totalLogicalJobs = perfMetrics?.total_logical_jobs ?? 0;
  const successfulTasks = perfMetrics?.successful_executions ?? 0;
  const failedTasks = perfMetrics?.failed_executions ?? 0;
  const cancelledTasks = perfMetrics?.cancelled_executions ?? 0;
  const pendingTasks = perfMetrics?.pending_executions ?? 0;
  const successRate = perfMetrics?.success_rate ?? 100;
  const failureRate = perfMetrics?.failure_rate ?? 0;

  const retryRate = perfMetrics?.retry_rate ?? 0;
  const timeoutRate = perfMetrics?.timeout_rate ?? 0;
  const retriedJobsCount = perfMetrics?.retried_executions_count ?? 0;
  const avgDuration = perfMetrics?.average_duration_seconds ?? 0;
  const p95Duration = perfMetrics?.p95_duration_seconds ?? 0;

  const queueHealth = analyticsData?.queue_worker;
  const queueBacklog = queueHealth?.queue_backlog_count ?? 0;
  const avgQueueWait = queueHealth?.average_queue_wait_seconds ?? 0;
  const isQueueConnected = queueHealth?.is_queue_connected ?? true;
  const workerStatus = queueHealth?.worker_health_status ?? "healthy";
  const workerFailures = queueHealth?.worker_failures_count ?? 0;
  const activeRunningTasks = queueHealth?.active_running_tasks_count ?? 0;

  const statusBreakdown = analyticsData?.status_breakdown;
  const usageByType = analyticsData?.usage_by_type;
  const errorBreakdown = analyticsData?.error_breakdown;

  // Format seconds to human readable
  const formatSeconds = (sec: number | null | undefined) => {
    const s = sec ?? 0;
    if (s <= 0) return "0 dtk";
    if (s < 60) return `${s.toFixed(1)} dtk`;
    const mins = Math.floor(s / 60);
    const remSec = Math.round(s % 60);
    return `${mins}m ${remSec}d`;
  };

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Controls ──────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
              Live Task Telemetry
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Admin Automation Operations
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Automation & Worker Analytics
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Sistem eksekusi tugas asynchronous, antrean Redis, performa worker TeleBos, durasi p95, rasio retry, dan isolasi kegagalan.
          </p>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 bg-muted/70 border border-border/80 rounded-xl">
            {(
              [
                { id: "24h", label: "24 Jam" },
                { id: "7d", label: "7 Hari" },
                { id: "30d", label: "30 Hari" },
                { id: "90d", label: "90 Hari" },
                { id: "custom", label: "Kustom" },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setSelectedRange(btn.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  selectedRange === btn.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {selectedRange === "custom" && (
            <div className="w-[240px]">
              <DatePickerWithRange
                date={customRange}
                setDate={(range) => setCustomRange(range)}
                placeholder="Pilih rentang tanggal"
                className="w-full"
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="h-9 px-3 gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4 text-muted-foreground", isRefreshing && "animate-spin")}
            />
            <span className="text-xs font-medium">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Analytics Overview
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics/users">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            User Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics/telegram-accounts">
            <Radio className="h-3.5 w-3.5 mr-1.5" />
            Telegram Account Analytics
          </Link>
        </Button>
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs">
          <Bot className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
          Automation Analytics
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics/financial">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Revenue & Saldo
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics/system-health">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Kesehatan Sistem
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics/security">
            <Shield className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
            Keamanan & Audit
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/users">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Manajemen Pengguna
          </Link>
        </Button>
      </div>

      {/* ── Architectural & Retry Invariant Banner ────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 text-xs text-foreground/80 space-y-2">
        <div className="flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-2">
              Integritas Eksekusi: Pemisahan Logical Jobs vs Execution Attempts & Perlindungan Idempotensi
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-mono">
                Safe Worker Standard
              </span>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Sistem membedakan secara tegas antara pesanan pekerjaan bisnis (<em>Logical Jobs</em>) dengan jumlah percobaan eksekusi aktual (<em>Execution Attempts</em>). Retry tidak dihitung sebagai task bisnis baru. Otomatisasi retry tidak dilakukan secara membabi buta guna mencegah duplikasi pesan Telegram dan pemblokiran akun.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground/90">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Percobaan retry dicatat sebagai attempt dari job ID yang sama.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Anti-blind retry: kegagalan izin admin/privasi tidak di-retry berulang.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span>Zero Leak: session string, OTP, dan token tidak tercatat di ringkasan error.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error Alert ───────────────────────────────────────────────────────── */}
      {analyticsError && (
        <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>Gagal memuat telemetri automasi dari backend. Pastikan service worker dan Redis aktif.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAnalytics()}
            className="border-destructive/30 hover:bg-destructive/20 text-destructive text-xs"
          >
            Coba Lagi
          </Button>
        </div>
      )}

      {/* ── Top Deck KPI Cards (6 Grid Items) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Total Executions & Logical Jobs */}
        <Card className="bg-card border-border shadow-xs hover:border-sky-500/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                Total Percobaan & Logical Jobs
              </CardDescription>
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Bot className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl lg:text-3xl font-bold font-mono text-foreground">
                {totalExecutions.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">percobaan</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Logical Jobs (Tugas Bisnis):</span>
              <span className="font-mono font-semibold text-foreground">
                {totalLogicalJobs.toLocaleString()} jobs
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Rasio Percobaan / Job:</span>
              <span className="font-mono font-medium text-sky-600 dark:text-sky-400">
                {totalLogicalJobs > 0 ? (totalExecutions / totalLogicalJobs).toFixed(2) : "1.00"}x
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Success Rate & Failure Rate */}
        <Card className="bg-card border-border shadow-xs hover:border-emerald-500/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                Success Rate & Failure Rate
              </CardDescription>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl lg:text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {successRate.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">berhasil</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Failure Rate:</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {failureRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Rincian:</span>
              <span className="font-mono">
                {successfulTasks.toLocaleString()} sukses / {failedTasks.toLocaleString()} gagal
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Retry Rate & Timeout Rate */}
        <Card className="bg-card border-border shadow-xs hover:border-amber-500/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                Rasio Retry & Timeout
              </CardDescription>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <RotateCw className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl lg:text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {retryRate.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">retry rate</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Timeout Rate:</span>
              <span className="font-mono font-semibold text-foreground">
                {timeoutRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Tugas Mengalami Retry:</span>
              <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                {retriedJobsCount.toLocaleString()} job
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Execution Duration (Avg & p95) */}
        <Card className="bg-card border-border shadow-xs hover:border-blue-500/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                Durasi Eksekusi: Avg & p95
              </CardDescription>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl lg:text-3xl font-bold font-mono text-foreground">
                {formatSeconds(avgDuration)}
              </span>
              <span className="text-xs text-muted-foreground">rata-rata</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>p95 Duration (Latency Spike):</span>
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                {formatSeconds(p95Duration)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Total Percobaan Selesai:</span>
              <span className="font-mono">
                {successfulTasks + failedTasks} tugas
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Queue Backlog & Waiting Time */}
        <Card className="bg-card border-border shadow-xs hover:border-sky-500/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                Antrean Redis & Waktu Tunggu
              </CardDescription>
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl lg:text-3xl font-bold font-mono text-sky-600 dark:text-sky-400">
                {queueBacklog.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">pending queue</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Rata-rata Waktu Antre:</span>
              <span className="font-mono font-semibold text-foreground">
                {formatSeconds(avgQueueWait)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Koneksi Antrean Redis:</span>
              <span className={cn(
                "font-medium flex items-center gap-1",
                isQueueConnected ? "text-emerald-500" : "text-rose-500"
              )}>
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isQueueConnected ? "bg-emerald-500" : "bg-rose-500"
                )} />
                {isQueueConnected ? "Terkoneksi" : "Terputus"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 6: Worker Health & Active Tasks */}
        <Card className="bg-card border-border shadow-xs hover:border-emerald-500/40 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                Kesehatan Worker & Tugas Aktif
              </CardDescription>
              <div className={cn(
                "p-2 rounded-xl",
                workerStatus === "healthy"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              )}>
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className={cn(
                "text-2xl lg:text-3xl font-bold uppercase",
                workerStatus === "healthy"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              )}>
                {workerStatus}
              </span>
              <span className="text-xs text-muted-foreground">runtime state</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Tugas Memori Aktif:</span>
              <span className="font-mono font-semibold text-foreground">
                {activeRunningTasks} tasks berjalan
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Kegagalan Worker Terdeteksi:</span>
              <span className="font-mono font-medium text-rose-500">
                {workerFailures} error
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Operational Analytics Grid (2x2 Cards) ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Logical Job Status Breakdown */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Distribusi Status Logical Jobs
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-normal">
                {statusBreakdown?.total_jobs ?? totalLogicalJobs} Total Jobs
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Distribusi status pekerjaan automasi dari database operasional TeleBos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 pt-1">
            {/* Completed */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Selesai (Completed)
                </span>
                <span className="font-mono text-muted-foreground">
                  {statusBreakdown?.successful_completed ?? 0} (
                  {totalLogicalJobs > 0
                    ? (((statusBreakdown?.successful_completed ?? 0) / totalLogicalJobs) * 100).toFixed(1)
                    : "0"}
                  %)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalLogicalJobs > 0 ? ((statusBreakdown?.successful_completed ?? 0) / totalLogicalJobs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Running */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Sedang Berjalan (Running)
                </span>
                <span className="font-mono text-muted-foreground">
                  {statusBreakdown?.running ?? 0} (
                  {totalLogicalJobs > 0
                    ? (((statusBreakdown?.running ?? 0) / totalLogicalJobs) * 100).toFixed(1)
                    : "0"}
                  %)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalLogicalJobs > 0 ? ((statusBreakdown?.running ?? 0) / totalLogicalJobs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Pending / Queued */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  Tertunda / Antre (Pending)
                </span>
                <span className="font-mono text-muted-foreground">
                  {statusBreakdown?.pending ?? 0} (
                  {totalLogicalJobs > 0
                    ? (((statusBreakdown?.pending ?? 0) / totalLogicalJobs) * 100).toFixed(1)
                    : "0"}
                  %)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalLogicalJobs > 0 ? ((statusBreakdown?.pending ?? 0) / totalLogicalJobs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Paused */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Dijeda (Paused)
                </span>
                <span className="font-mono text-muted-foreground">
                  {statusBreakdown?.paused ?? 0} (
                  {totalLogicalJobs > 0
                    ? (((statusBreakdown?.paused ?? 0) / totalLogicalJobs) * 100).toFixed(1)
                    : "0"}
                  %)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalLogicalJobs > 0 ? ((statusBreakdown?.paused ?? 0) / totalLogicalJobs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Cancelled */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  Dibatalkan (Cancelled)
                </span>
                <span className="font-mono text-muted-foreground">
                  {statusBreakdown?.cancelled ?? 0} (
                  {totalLogicalJobs > 0
                    ? (((statusBreakdown?.cancelled ?? 0) / totalLogicalJobs) * 100).toFixed(1)
                    : "0"}
                  %)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalLogicalJobs > 0 ? ((statusBreakdown?.cancelled ?? 0) / totalLogicalJobs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Failed */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Gagal (Failed)
                </span>
                <span className="font-mono text-muted-foreground">
                  {statusBreakdown?.failed ?? 0} (
                  {totalLogicalJobs > 0
                    ? (((statusBreakdown?.failed ?? 0) / totalLogicalJobs) * 100).toFixed(1)
                    : "0"}
                  %)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalLogicalJobs > 0 ? ((statusBreakdown?.failed ?? 0) / totalLogicalJobs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Worker Health & Queue Telemetry */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-sky-500" />
                Telemetri Antrean & Runtime Worker
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-mono">
                telebos:jobs:queue
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Pemantauan koneksi Redis, BLPOP consumer worker, dan tugas aktif di memori runtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
              <div>
                <span className="text-muted-foreground">Live Redis Backlog:</span>
                <p className="font-mono font-bold text-base text-primary mt-0.5">
                  {queueBacklog} jobs
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Worker Status:</span>
                <p className={cn(
                  "font-mono font-bold text-base mt-0.5 uppercase",
                  workerStatus === "healthy"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}>
                  {workerStatus}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Waktu Tunggu Antre:</span>
                <p className="font-mono font-semibold text-foreground mt-0.5">
                  {formatSeconds(avgQueueWait)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Worker Failure Events:</span>
                <p className="font-mono font-semibold text-destructive mt-0.5">
                  {workerFailures} error
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-primary" />
                Status Konsumen Worker & Antrean:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-center">
                  <span className="text-[11px] text-muted-foreground block">Active Consumers</span>
                  <span className="font-mono font-bold text-base text-primary">
                    {queueHealth?.active_worker_consumers ?? 1} worker
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-[11px] text-muted-foreground block">Tugas Berjalan</span>
                  <span className="font-mono font-bold text-base text-foreground">
                    {activeRunningTasks} tasks
                  </span>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center justify-between">
                <span>Consumer Worker:</span>
                <span className="font-mono text-foreground">AsyncWorker (BLPOP 2.0s)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Control Channel:</span>
                <span className="font-mono text-foreground">telebos:jobs:control</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Usage Trends Across Automation Types */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Tren Penggunaan Tiap Jenis Automation
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-normal">
                4 Modul
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Volume jobs bisnis dan percobaan eksekusi aktual untuk masing-masing modul automasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {[
              {
                id: "broadcast",
                label: "Broadcast Pesan",
                icon: Send,
                color: "text-blue-500",
                jobs: usageByType?.broadcast_jobs_count ?? 0,
                attempts: usageByType?.broadcast_executions_count ?? 0,
              },
              {
                id: "invite",
                label: "Invite Member Grup",
                icon: UserPlus,
                color: "text-sky-500",
                jobs: usageByType?.invite_jobs_count ?? 0,
                attempts: usageByType?.invite_executions_count ?? 0,
              },
              {
                id: "autojoin",
                label: "Auto Join Kanal/Grup",
                icon: LogIn,
                color: "text-blue-500",
                jobs: usageByType?.autojoin_jobs_count ?? 0,
                attempts: usageByType?.autojoin_executions_count ?? 0,
              },
              {
                id: "autoreply",
                label: "Auto Reply AI / Bot",
                icon: MessageSquare,
                color: "text-emerald-500",
                jobs: usageByType?.autoreply_executions_count ?? 0,
                attempts: usageByType?.autoreply_executions_count ?? 0,
              },
            ].map((module) => {
              const Icon = module.icon;
              return (
                <div
                  key={module.id}
                  className="p-3 rounded-xl bg-muted/30 border border-border/40 hover:border-border transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", module.color)} />
                      <span className="font-semibold text-xs text-foreground">{module.label}</span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {module.jobs} Jobs
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <span>Logical Jobs Dibuat:</span>
                      <p className="font-mono font-semibold text-foreground">{module.jobs.toLocaleString()}</p>
                    </div>
                    <div>
                      <span>Percobaan Eksekusi:</span>
                      <p className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                        {module.attempts.toLocaleString()} attempts
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Section 4: Error Breakdown by Category & Top Messages */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                Rincian Error & Kategori Kegagalan
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-normal">
                {Object.values(errorBreakdown?.by_error_category ?? {}).reduce((a, b) => a + b, 0)} Teridentifikasi
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Klasifikasi error Telegram API dan kegagalan sistem yang aman tanpa kebocoran data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {/* Categories */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Distribusi Kategori Error:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <span className="text-[11px] text-muted-foreground block">FloodWait / Rate Limit</span>
                  <span className="font-mono font-bold text-foreground">
                    {errorBreakdown?.by_error_category?.["FloodWait / Rate Limit"] ?? errorBreakdown?.by_error_category?.["flood_wait"] ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-sky-500/5 border border-sky-500/20">
                  <span className="text-[11px] text-muted-foreground block">Privasi Telegram</span>
                  <span className="font-mono font-bold text-foreground">
                    {errorBreakdown?.by_error_category?.["Privacy Restriction"] ?? errorBreakdown?.by_error_category?.["privacy_restricted"] ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <span className="text-[11px] text-muted-foreground block">Izin Admin Kurang</span>
                  <span className="font-mono font-bold text-foreground">
                    {errorBreakdown?.by_error_category?.["Admin Permissions Required"] ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
                  <span className="text-[11px] text-muted-foreground block">Sesi Mati / Expired</span>
                  <span className="font-mono font-bold text-foreground">
                    {errorBreakdown?.by_error_category?.["Dead / Expired Session"] ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <span className="text-[11px] text-muted-foreground block">Eksekusi Timeout</span>
                  <span className="font-mono font-bold text-foreground">
                    {errorBreakdown?.by_error_category?.["Timeout"] ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-500/5 border border-slate-500/20">
                  <span className="text-[11px] text-muted-foreground block">Error Lain / Sistem</span>
                  <span className="font-mono font-bold text-foreground">
                    {errorBreakdown?.by_error_category?.["Other / System Error"] ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Top failure messages (sanitized) */}
            <div className="pt-2 border-t border-border/60">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                Pesan Error Paling Sering (Sanitized):
              </p>
              {errorBreakdown?.top_error_messages && errorBreakdown.top_error_messages.length > 0 ? (
                <div className="space-y-1.5">
                  {errorBreakdown.top_error_messages.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40 text-xs"
                    >
                      <span className="font-mono text-[11px] text-foreground truncate max-w-[280px]" title={item.message}>
                        {item.message}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0">
                        {item.count}x
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500/60 mx-auto mb-1" />
                  Tidak ada error tercatat pada periode ini.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Timeseries Historical Trend Chart ───────────────────────────────── */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-sky-500" />
                Grafik Tren Eksekusi Automasi
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Pola beban kerja eksekusi tugas per waktu sepanjang periode pengamatan.
              </CardDescription>
            </div>

            {/* Metric Toggle Buttons */}
            <div className="inline-flex items-center p-1 bg-muted/60 border border-border/60 rounded-xl">
              {[
                { id: "automation_executions", label: "Semua Task" },
                { id: "broadcasts", label: "Broadcast" },
                { id: "invites", label: "Invite" },
                { id: "autojoins", label: "Auto Join" },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setChartMetric(btn.id as any)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                    chartMetric === btn.id
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AnalyticsAreaChart
            data={timeseriesData?.points ?? []}
            metricLabel={
              chartMetric === "automation_executions"
                ? "Total Eksekusi Automasi"
                : chartMetric === "broadcasts"
                ? "Broadcast Dijalankan"
                : chartMetric === "invites"
                ? "Invite Dijalankan"
                : "Auto Join Dijalankan"
            }
            color={
              chartMetric === "broadcasts"
                ? "blue"
                : chartMetric === "invites"
                ? "sky"
                : chartMetric === "autojoins"
                ? "amber"
                : "emerald"
            }
            height={260}
            isLoading={isTimeseriesLoading}
            emptyMessage="Belum ada data eksekusi automasi pada rentang waktu ini."
          />
        </CardContent>
      </Card>

      {/* ── Paginated Execution History Table ─────────────────────────────────── */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-500" />
                Riwayat Eksekusi Tugas Automasi
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Daftar eksekusi tugas lengkap dengan status, durasi, retries, dan detail audit.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                Total: {directoryData?.total ?? 0} Tugas
              </Badge>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="sm:col-span-6 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari ID tugas, email pengguna..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </form>

            {/* Automation Type Filter */}
            <div className="sm:col-span-3">
              <select
                aria-label="Filter Jenis Automation"
                value={automationTypeFilter}
                onChange={(e) => {
                  setAutomationTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">Semua Jenis Automation</option>
                <option value="broadcast">Broadcast</option>
                <option value="invite">Invite Member</option>
                <option value="autojoin">Auto Join</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="sm:col-span-3">
              <select
                aria-label="Filter Status Tugas"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">Semua Status</option>
                <option value="completed">Completed (Selesai)</option>
                <option value="running">Running (Berjalan)</option>
                <option value="failed">Failed (Gagal)</option>
                <option value="paused">Paused (Dijeda)</option>
                <option value="cancelled">Cancelled (Dibatalkan)</option>
                <option value="pending">Pending (Antre)</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-y border-border/80 bg-muted/30 text-muted-foreground">
                  <th className="py-3 px-4 font-medium">Task ID</th>
                  <th className="py-3 px-4 font-medium">Jenis</th>
                  <th className="py-3 px-4 font-medium">User</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Progres</th>
                  <th className="py-3 px-4 font-medium">Mulai</th>
                  <th className="py-3 px-4 font-medium">Durasi</th>
                  <th className="py-3 px-4 font-medium text-center">Retries</th>
                  <th className="py-3 px-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isDirectoryLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-sky-500" />
                      Memuat direktori tugas automasi...
                    </td>
                  </tr>
                ) : directoryData?.tasks && directoryData.tasks.length > 0 ? (
                  directoryData.tasks.map((task: AutomationTaskHistoryItem) => (
                    <tr
                      key={task.task_id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        <span className="truncate max-w-[120px] inline-block" title={task.task_id}>
                          {task.task_id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize text-[10px] py-0",
                            task.automation_type === "broadcast" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                            task.automation_type === "invite" && "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
                            task.automation_type === "autojoin" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}
                        >
                          {task.automation_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {task.user_email || "System/Owner"}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] py-0 capitalize",
                            task.status === "completed" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                            task.status === "running" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
                            task.status === "failed" && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
                            task.status === "paused" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                            task.status === "cancelled" && "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
                            task.status === "pending" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          )}
                        >
                          {task.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{task.successful_items}</span>
                        {" / "}
                        <span className="text-rose-500 font-semibold">{task.failed_items}</span>
                        {task.total_items > 0 && ` (tot: ${task.total_items})`}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                        {task.started_at
                          ? format(new Date(task.started_at), "dd MMM, HH:mm")
                          : "-"}
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground whitespace-nowrap">
                        {formatSeconds(task.duration_seconds)}
                      </td>
                      <td className="py-3 px-4 font-mono text-center">
                        {task.retry_count > 0 ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
                            {task.retry_count}x
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewTaskDetail(task)}
                          className="h-7 px-2.5 rounded-lg border-slate-300 dark:border-slate-700 bg-card shadow-2xs text-[11px] font-semibold hover:bg-muted cursor-pointer gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detail
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      <Bot className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                      Tidak ada tugas automasi yang sesuai kriteria pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          {directoryData && directoryData.total_pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border/60 text-xs">
              <span className="text-muted-foreground">
                Halaman {directoryData.page} dari {directoryData.total_pages} ({directoryData.total} total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5 gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= directoryData.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 px-2.5 gap-1"
                >
                  Selanjutnya
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Task Details Modal / Dialog ───────────────────────────────────────── */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Bot className="h-4 w-4 text-sky-500" />
              Detail Tugas Automasi
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Task ID: {selectedTask?.task_id}
            </DialogDescription>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4 py-2 text-xs">
              {/* Top metadata grid */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border/60">
                <div>
                  <span className="text-muted-foreground">Jenis Automation:</span>
                  <p className="font-semibold capitalize text-foreground mt-0.5">
                    {selectedTask.automation_type}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status Eksekusi:</span>
                  <div className="mt-0.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] py-0 capitalize",
                        selectedTask.status === "completed" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                        selectedTask.status === "running" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
                        selectedTask.status === "failed" && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
                        selectedTask.status === "paused" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                        selectedTask.status === "cancelled" && "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
                        selectedTask.status === "pending" && "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                      )}
                    >
                      {selectedTask.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Pengguna (Owner):</span>
                  <p className="font-medium text-foreground mt-0.5 truncate">
                    {selectedTask.user_email || "System"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Percobaan Retry:</span>
                  <p className="font-mono font-semibold text-foreground mt-0.5">
                    {selectedTask.retry_count} kali
                  </p>
                </div>
              </div>

              {/* Progress & duration */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">Item Berhasil</span>
                  <span className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                    {selectedTask.successful_items}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">Item Gagal</span>
                  <span className="font-mono font-bold text-base text-rose-600 dark:text-rose-400">
                    {selectedTask.failed_items}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">Durasi Total</span>
                  <span className="font-mono font-bold text-base text-blue-600 dark:text-blue-400">
                    {formatSeconds(selectedTask.duration_seconds)}
                  </span>
                </div>
              </div>

              {/* Timestamp details */}
              <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Waktu Mulai Eksekusi:</span>
                  <span className="font-mono text-foreground">
                    {selectedTask.started_at ? format(new Date(selectedTask.started_at), "dd MMM yyyy, HH:mm:ss") : "-"}
                  </span>
                </div>
                {selectedTask.completed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Waktu Selesai:</span>
                    <span className="font-mono text-foreground">
                      {format(new Date(selectedTask.completed_at), "dd MMM yyyy, HH:mm:ss")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Waktu Tunggu Antrean:</span>
                  <span className="font-mono text-foreground">
                    {formatSeconds(selectedTask.queue_wait_seconds)}
                  </span>
                </div>
              </div>

              {/* Error Summary */}
              {selectedTask.error_summary ? (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Ringkasan Error (Sanitized):</span>
                  </div>
                  <p className="font-mono text-[11px] leading-relaxed break-words">
                    {selectedTask.error_summary}
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Tidak ada error tercatat untuk tugas ini.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDetailOpen(false)}
              className="text-xs"
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
