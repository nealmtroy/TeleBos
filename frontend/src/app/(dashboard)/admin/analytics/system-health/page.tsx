"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Network,
  Radio,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Zap,
  Clock,
  Layers,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Users,
  Bot,
  DollarSign,
  TrendingUp,
  Percent,
  Timer,
  Terminal,
  ArrowRight,
  Wifi,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSystemHealthAnalytics,
  SystemIncidentItem,
} from "@/hooks/use-admin-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnalyticsAreaChart } from "@/components/admin/analytics-chart";
import { cn } from "@/lib/utils";

/**
 * Format raw bytes into human readable binary units.
 */
function formatBytes(bytes: number | null | undefined): string {
  const b = bytes ?? 0;
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(b) / Math.log(k)));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function AdminSystemHealthAnalyticsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Strict Authorization Guard: Only Owner can access system health telemetry
  if (currentUser?.role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="w-full max-w-md p-8 text-center bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-destructive/10 text-destructive mb-2">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {_("admin.accessDenied") || "Akses Ditolak"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {_("admin.accessDeniedDesc") ||
              "Hanya akun dengan peran Owner yang memiliki akses ke Panel Admin."}
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/dashboard">
              {_("admin.backToDashboard") || "Kembali ke Dashboard"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <SystemHealthContent />;
}

function SystemHealthContent() {
  // Auto-refresh interval (Off, 5s, 15s, 30s)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number | undefined>(15_000);

  // Trend chart metric selection
  const [chartMetric, setChartMetric] = useState<"requests" | "latency" | "cpu" | "errors">("latency");

  // Query system health
  const {
    data: healthData,
    isLoading: isHealthLoading,
    isFetching: isHealthFetching,
    error: healthError,
    refetch: refetchHealth,
  } = useAdminSystemHealthAnalytics(autoRefreshInterval);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchHealth();
    setIsRefreshing(false);
  };

  const resources = healthData?.resources;
  const apiTraffic = healthData?.api_traffic;
  const database = healthData?.database;
  const queueWorkers = healthData?.queue_workers;
  const realtime = healthData?.realtime;
  const uptimeIncidents = healthData?.uptime_incidents;
  const timeseries = healthData?.timeseries || [];

  // Transform timeseries for AnalyticsAreaChart
  const chartPoints = timeseries.map((pt) => ({
    date: pt.timestamp,
    value:
      chartMetric === "requests"
        ? pt.request_volume
        : chartMetric === "latency"
        ? pt.latency_p95_ms
        : chartMetric === "cpu"
        ? pt.cpu_percent
        : pt.error_count,
  }));

  const overallStatus = healthData?.overall_status ?? "healthy";

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Controls ──────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                overallStatus === "healthy"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : overallStatus === "degraded"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full animate-pulse",
                  overallStatus === "healthy"
                    ? "bg-emerald-500"
                    : overallStatus === "degraded"
                    ? "bg-amber-500"
                    : "bg-destructive"
                )}
              />
              Live System Telemetry
            </span>
            <Badge variant="outline" className="text-xs font-normal capitalize">
              Status: {overallStatus}
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            System Health Analytics
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Telemetri throughput API, latensi respons p50/p95/p99, utilisasi CPU/RAM/Disk, koneksi database PostgreSQL, antrean Redis worker, dan audit insiden.
          </p>
        </div>

        {/* Polling Interval & Refresh Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 bg-muted/70 border border-border/80 rounded-xl text-xs">
            <span className="px-2 text-muted-foreground font-medium">Auto-Refresh:</span>
            {(
              [
                { id: undefined, label: "Mati" },
                { id: 5_000, label: "5 dtk" },
                { id: 15_000, label: "15 dtk" },
                { id: 30_000, label: "30 dtk" },
              ] as const
            ).map((item) => (
              <button
                key={String(item.id)}
                type="button"
                onClick={() => setAutoRefreshInterval(item.id)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                  autoRefreshInterval === item.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isHealthFetching}
            className="h-9 px-3 gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4 text-muted-foreground", (isRefreshing || isHealthFetching) && "animate-spin")}
            />
            <span className="text-xs font-medium">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto">
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Analytics Overview
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/users">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            User Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/telegram-accounts">
            <Radio className="h-3.5 w-3.5 mr-1.5" />
            Telegram Account Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/automation">
            <Bot className="h-3.5 w-3.5 mr-1.5" />
            Automation Analytics
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/financial">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Revenue & Saldo
          </Link>
        </Button>
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs shrink-0">
          <Activity className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
          Kesehatan Sistem
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/security">
            <Shield className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
            Keamanan & Audit
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/users">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Manajemen Pengguna
          </Link>
        </Button>
      </div>

      {/* ── Operational Transparency & Limitations Banner ───────────────────────── */}
      <div className="p-4 rounded-2xl bg-muted/40 border border-border/70 text-xs text-foreground/80 space-y-2">
        <div className="flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-2">
              Transparansi Instrumentasi Telemetri & Batasan Pengukuran
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {uptimeIncidents?.measurement_limitations_note ||
                "Metrik telemetri dikumpulkan secara langsung (real-time) sejak proses backend TeleBos dimulai. Uptime jangka panjang / SLA historis sebelum deployment aktif saat ini memerlukan persistent time-series monitoring eksternal."}
              <br />
              Waktu Pengukuran Terakhir: <strong>{healthData?.measured_at ? new Date(healthData.measured_at).toLocaleString("id-ID") : "-"}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ── Top Deck Primary KPI Cards (6 cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: System Status & Uptime */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Uptime Aplikasi</span>
              <Timer className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isHealthLoading ? "..." : uptimeIncidents?.uptime_human || "0 dtk"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Uptime Proses</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 capitalize",
                overallStatus === "healthy"
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : overallStatus === "degraded"
                  ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                  : "border-destructive text-destructive"
              )}
            >
              {overallStatus}
            </Badge>
          </CardContent>
        </Card>

        {/* Card 2: API Throughput */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">API Request Volume</span>
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isHealthLoading ? "..." : (apiTraffic?.total_requests ?? 0).toLocaleString("id-ID")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{apiTraffic?.requests_per_minute ?? 0} req/menit</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {apiTraffic?.status_2xx_count ?? 0} 2xx
            </span>
          </CardContent>
        </Card>

        {/* Card 3: Latency Percentiles (p95) */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Latency (p95 / p50)</span>
              <Clock className="h-4 w-4 text-sky-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isHealthLoading ? "..." : `${apiTraffic?.latency_p95_ms ?? 0} ms`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>p50: {apiTraffic?.latency_p50_ms ?? 0} ms</span>
            <span className="text-[10px] text-muted-foreground">
              p99: {apiTraffic?.latency_p99_ms ?? 0} ms
            </span>
          </CardContent>
        </Card>

        {/* Card 4: HTTP Error Rates */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">HTTP Error Rates</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isHealthLoading ? "..." : `${apiTraffic?.error_5xx_rate ?? 0}% (5xx)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>4xx: {apiTraffic?.error_4xx_rate ?? 0}%</span>
            <span className="text-[10px] text-destructive">
              {apiTraffic?.status_5xx_count ?? 0} error 5xx
            </span>
          </CardContent>
        </Card>

        {/* Card 5: Host CPU & Memory */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">CPU & Memory Host</span>
              <Cpu className="h-4 w-4 text-blue-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isHealthLoading ? "..." : `${resources?.cpu_percent ?? 0}% CPU`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>RAM: {resources?.memory_percent ?? 0}%</span>
            <span className="text-[10px] text-muted-foreground">
              {formatBytes(resources?.process_memory_rss_bytes)} RSS
            </span>
          </CardContent>
        </Card>

        {/* Card 6: Database & Queue Probe */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Database & Redis</span>
              <Database className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1 flex items-center gap-1.5">
              {isHealthLoading ? (
                "..."
              ) : database?.is_connected && queueWorkers?.is_redis_connected ? (
                <span className="text-emerald-600 dark:text-emerald-400">Terhubung</span>
              ) : (
                <span className="text-destructive">Gangguan</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>DB Ping: {database?.query_ping_latency_ms ?? 0} ms</span>
            <span className="text-[10px] text-muted-foreground">
              Pool: {database?.checked_out_connections ?? 0}/{database?.pool_size ?? 30}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ── Subsystem Details Grid (4 Cards) ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Host Resource Utilization */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-blue-500" />
                  Utilisasi Server & Sumber Daya Host
                </CardTitle>
                <CardDescription className="text-xs">
                  Penggunaan CPU, konsumsi memori fisik, ruang penyimpanan disk, dan trafik jaringan.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {resources?.cpu_cores ?? 1} Logical Cores
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* CPU Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Utilisasi CPU Keseluruhan</span>
                <span className="font-semibold text-foreground">{resources?.cpu_percent ?? 0}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, resources?.cpu_percent ?? 0))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>CPU Proses TeleBos: {resources?.process_cpu_percent ?? 0}%</span>
                <span>Cores: {resources?.cpu_cores ?? 1} Cores</span>
              </div>
            </div>

            {/* Memory Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Konsumsi RAM Server</span>
                <span className="font-semibold text-foreground">
                  {resources?.memory_percent ?? 0}% ({formatBytes(resources?.memory_used_bytes)} / {formatBytes(resources?.memory_total_bytes)})
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, resources?.memory_percent ?? 0))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>Tersedia: {formatBytes(resources?.memory_available_bytes)}</span>
                <span>Proses Python RSS: {formatBytes(resources?.process_memory_rss_bytes)}</span>
              </div>
            </div>

            {/* Disk & Network Summary */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  Penyimpanan Disk
                </span>
                <span className="text-sm font-bold text-foreground block">
                  {resources?.disk_percent ?? 0}% Terpakai
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Sisa {formatBytes(resources?.disk_free_bytes)} dari {formatBytes(resources?.disk_total_bytes)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1">
                  <Network className="h-3.5 w-3.5 text-muted-foreground" />
                  Network I/O Akumulatif
                </span>
                <span className="text-sm font-bold text-foreground block">
                  ↑ {formatBytes(resources?.network_bytes_sent)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  ↓ {formatBytes(resources?.network_bytes_recv)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Database Connection Pool & Query Latency */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-500" />
                  Koneksi Database & Latensi Kueri
                </CardTitle>
                <CardDescription className="text-xs">
                  Status pool SQLAlchemy asyncpg, kueri probe, dan pemantauan slow queries.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  database?.is_connected
                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "border-destructive text-destructive"
                )}
              >
                {database?.is_connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* Pool Utilization Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Utilisasi Connection Pool</span>
                <span className="font-semibold text-foreground">
                  {database?.checked_out_connections ?? 0} aktif / {database?.pool_size ?? 30} base pool
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, database?.pool_utilization_percent ?? 0))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>Idle/Tersedia: {database?.checked_in_connections ?? 0}</span>
                <span>Overflow: {database?.overflow_connections ?? 0} (Max: {database?.max_overflow ?? 30})</span>
              </div>
            </div>

            {/* Probe Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Query Latency Probe</span>
                <span className="text-sm font-bold text-foreground">
                  {database?.query_ping_latency_ms ?? 0} ms
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  Round-trip SELECT 1
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Kueri Lambat Terdeteksi</span>
                <span className="text-sm font-bold text-foreground">
                  {database?.slow_queries_count ?? 0} kueri
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Ambang batas &gt; 500ms
                </span>
              </div>
            </div>

            {/* Slow Queries List or Clean State */}
            {database?.slow_queries && database.slow_queries.length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground block">Kueri Lambat Terbaru</span>
                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                  {database.slow_queries.map((sq, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-muted/30 border border-border/50 text-[11px] font-mono">
                      <div className="flex justify-between text-muted-foreground mb-0.5">
                        <span className="text-destructive font-semibold">{sq.duration_ms} ms</span>
                        <span>{new Date(sq.timestamp).toLocaleTimeString("id-ID")}</span>
                      </div>
                      <div className="text-foreground truncate">{sq.query}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>Performa kueri optimal. Tidak ada kueri lambat yang melampaui batas ambang.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Queue Backlog & Worker Infrastructure */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Bot className="h-4 w-4 text-sky-500" />
                  Antrean Tugas Redis & Kesehatan Worker
                </CardTitle>
                <CardDescription className="text-xs">
                  Status antrean asynchronous broadcast, invite, autojoin, dan memori Redis.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs capitalize",
                  queueWorkers?.worker_health_status === "healthy"
                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/30 text-amber-600 dark:text-amber-400"
                )}
              >
                Worker: {queueWorkers?.worker_health_status ?? "healthy"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Status Redis</span>
                <span className="text-sm font-bold text-foreground block mt-0.5">
                  {queueWorkers?.is_redis_connected ? "Terhubung" : "Offline"}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Ping: {queueWorkers?.redis_ping_latency_ms ?? 0} ms
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Memori Redis</span>
                <span className="text-sm font-bold text-foreground block mt-0.5">
                  {queueWorkers?.redis_used_memory_human ?? "0B"}
                </span>
                <span className="text-[10px] text-muted-foreground block">Alokasi RAM</span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Total Backlog</span>
                <span className="text-sm font-bold text-foreground block mt-0.5">
                  {queueWorkers?.queue_backlog_total ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground block">Menunggu antrean</span>
              </div>
            </div>

            {/* Queue breakdown */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">Distribusi Antrean Pekerjaan</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(queueWorkers?.queue_backlog_by_name || {}).map(([qName, count]) => {
                  const shortName = qName.replace("telebos:queue:", "");
                  return (
                    <div key={qName} className="p-2.5 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-between">
                      <span className="text-xs font-mono capitalize">{shortName}</span>
                      <Badge variant="secondary" className="text-xs font-mono font-bold">
                        {count}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Realtime Connections & WebSocket Health */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-emerald-500" />
                  Koneksi Realtime & WebSocket Bridge
                </CardTitle>
                <CardDescription className="text-xs">
                  Soket frontend aktif, channel pub/sub, dan bridge relay event TeleBos.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {realtime?.active_websocket_connections ?? 0} Soket Aktif
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[11px] text-muted-foreground block">Koneksi Klien WebSocket</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 block mt-1">
                  {realtime?.active_websocket_connections ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Soket dua arah aktif</span>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <span className="text-[11px] text-muted-foreground block">Saluran / Channels Terdaftar</span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400 block mt-1">
                  {realtime?.active_channels_count ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Topic subscription</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
              <div>
                <span className="text-muted-foreground">Redis Pub/Sub WebSocket Bridge:</span>
                <strong className="ml-1 text-foreground capitalize">{realtime?.redis_pubsub_bridge_status ?? "healthy"}</strong>
              </div>
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                Asyncio Loop OK
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Status Code Breakdown & Top Failing Routes ─────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-500" />
                Distribusi Status HTTP & Titik Akhir (Endpoints) Bermasalah
              </CardTitle>
              <CardDescription className="text-xs">
                Pemecahan kode respons HTTP dan rute dengan tingkat kegagalan tertinggi.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {/* Status Badges */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground">Distribusi Status Kode HTTP</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(apiTraffic?.status_code_breakdown || {}).length > 0 ? (
                Object.entries(apiTraffic?.status_code_breakdown || {}).map(([code, count]) => {
                  const num = parseInt(code, 10);
                  const isSuccess = num >= 200 && num < 300;
                  const isWarn = num >= 400 && num < 500;
                  const isErr = num >= 500;
                  return (
                    <Badge
                      key={code}
                      variant="outline"
                      className={cn(
                        "text-xs px-2.5 py-1 font-mono",
                        isSuccess
                          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                          : isWarn
                          ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                          : isErr
                          ? "border-destructive/30 text-destructive bg-destructive/5"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      HTTP {code}: <strong className="ml-1 text-foreground">{count}</strong>
                    </Badge>
                  );
                })
              ) : (
                <span className="text-xs text-muted-foreground">Belum ada data status HTTP tercatat.</span>
              )}
            </div>
          </div>

          {/* Top Failing Routes Table */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground">Titik Akhir dengan Error Tertinggi</span>
            {apiTraffic?.top_failing_routes && apiTraffic.top_failing_routes.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-medium">
                      <th className="py-2.5 px-3">Metode & Rute API</th>
                      <th className="py-2.5 px-3 text-right">Permintaan</th>
                      <th className="py-2.5 px-3 text-right">Total Error</th>
                      <th className="py-2.5 px-3 text-right">Tingkat Error</th>
                      <th className="py-2.5 px-3 text-right">Durasi Rata-rata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {apiTraffic.top_failing_routes.map((rt, idx) => (
                      <tr key={idx} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-medium text-foreground">{rt.route}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{rt.requests}</td>
                        <td className="py-2.5 px-3 text-right text-destructive font-semibold">{rt.errors}</td>
                        <td className="py-2.5 px-3 text-right text-destructive">{rt.error_rate}%</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{rt.avg_duration_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>Seluruh rute API berjalan bersih tanpa kegagalan terdeteksi.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Historical Telemetry Chart ─────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Tren Telemetri Real-Time
              </CardTitle>
              <CardDescription className="text-xs">
                Riwayat per menit volume request, latensi respons p95, dan beban sistem.
              </CardDescription>
            </div>

            {/* Metric Switcher */}
            <div className="inline-flex items-center p-1 bg-muted/70 border border-border/80 rounded-xl">
              {(
                [
                  { id: "latency", label: "Latensi p95 (ms)" },
                  { id: "requests", label: "Volume Request" },
                  { id: "cpu", label: "CPU Host (%)" },
                  { id: "errors", label: "Jumlah Error" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartMetric(tab.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                    chartMetric === tab.id
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <AnalyticsAreaChart
            data={chartPoints}
            metricLabel={
              chartMetric === "latency"
                ? "Latensi Respons p95 (ms)"
                : chartMetric === "requests"
                ? "Volume Permintaan API"
                : chartMetric === "cpu"
                ? "Beban CPU (%)"
                : "Total Error HTTP"
            }
            color={
              chartMetric === "latency"
                ? "amber"
                : chartMetric === "requests"
                ? "blue"
                : chartMetric === "cpu"
                ? "sky"
                : "rose"
            }
            formatValue={(v) =>
              chartMetric === "latency"
                ? `${v} ms`
                : chartMetric === "cpu"
                ? `${v}%`
                : v.toLocaleString("id-ID")
            }
            isLoading={isHealthLoading}
            height={260}
          />
        </CardContent>
      </Card>

      {/* ── Incident History & Degradation Audit Log ───────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Riwayat Insiden & Audit Degradasi Operasional
              </CardTitle>
              <CardDescription className="text-xs">
                Log kegagalan server HTTP 5xx, pemutusan koneksi infrastruktur, dan anomali sistem.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {uptimeIncidents?.recent_incidents?.length ?? 0} Insiden Tercatat
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground font-medium">
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Keparahan</th>
                  <th className="py-3 px-4">Subsistem</th>
                  <th className="py-3 px-4">Status / Rute</th>
                  <th className="py-3 px-4">Ringkasan Insiden</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {!uptimeIncidents?.recent_incidents || uptimeIncidents.recent_incidents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                      <span className="font-medium text-foreground block">
                        Tidak ada insiden operasional tercatat
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Seluruh subsistem TeleBos beroperasi secara stabil tanpa kegagalan kritis.
                      </span>
                    </td>
                  </tr>
                ) : (
                  uptimeIncidents.recent_incidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground font-mono">
                        {new Date(inc.timestamp).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            inc.severity === "critical"
                              ? "border-destructive text-destructive bg-destructive/5"
                              : inc.severity === "warning"
                              ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {inc.severity}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                          {inc.subsystem}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {inc.status_code ? `HTTP ${inc.status_code}` : "-"}
                        {inc.route && <span className="text-muted-foreground ml-1">({inc.route})</span>}
                      </td>
                      <td className="py-3 px-4 text-foreground max-w-md truncate">
                        {inc.summary}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
