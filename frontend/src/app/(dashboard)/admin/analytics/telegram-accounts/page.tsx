"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  Radio,
  Smartphone,
  CheckCircle2,
  XCircle,
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
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
  Lock,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Bot,
  ShoppingCart,
  UserCheck,
  HelpCircle,
  Database,
  SlidersHorizontal,
  DollarSign,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  AnalyticsRange,
  useAdminTelegramAccountsAnalytics,
  useAdminTelegramAccountsDirectory,
  useAdminAnalyticsTimeseries,
  AccountDirectoryItem,
  AccountStatusHistoryItem,
} from "@/hooks/use-admin-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { AnalyticsAreaChart } from "@/components/admin/analytics-chart";
import { cn } from "@/lib/utils";

export default function AdminTelegramAccountAnalyticsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Authorization Guard: Owner role strictly required
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
          <p className="text-sm text-muted-foreground leading-relaxed">
            {_("admin.accessDeniedDesc") ||
              "Only users with the Owner role are authorized to access TeleBos Analytics."}
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">
                {_("admin.backToDashboard") || "Return to Dashboard"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <TelegramAccountAnalyticsContent />;
}

function TelegramAccountAnalyticsContent() {
  const _ = useT();

  // Period / Date filter state
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Timeseries trend view toggle
  const [trendMetric, setTrendMetric] = useState<"accounts_added" | "accounts_deleted">("accounts_added");

  // Table search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Build query params for analytics
  const queryParams = useMemo(() => {
    return {
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
  }, [selectedRange, customRange]);

  // Queries
  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    isFetching: isAnalyticsFetching,
    refetch: refetchAnalytics,
  } = useAdminTelegramAccountsAnalytics(queryParams);

  const {
    data: trendData,
    isLoading: isTrendLoading,
    refetch: refetchTrend,
  } = useAdminAnalyticsTimeseries(trendMetric, queryParams);

  const {
    data: directoryData,
    isLoading: isDirectoryLoading,
    isFetching: isDirectoryFetching,
    refetch: refetchDirectory,
  } = useAdminTelegramAccountsDirectory({
    search: searchInput.trim() || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    role: roleFilter !== "all" ? roleFilter : undefined,
    page: currentPage,
    page_size: pageSize,
  });

  const isRefreshing = isAnalyticsFetching || isDirectoryFetching;

  const handleRefreshAll = () => {
    refetchAnalytics();
    refetchTrend();
    refetchDirectory();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    refetchDirectory();
  };

  // Safe metrics references
  const statusCounts = analyticsData?.status_counts;
  const connMetrics = analyticsData?.connection_metrics;
  const planDist = analyticsData?.plan_distribution;

  const totalRegistered = analyticsData?.total_registered_accounts ?? 0;
  const activeConnected = statusCounts?.active_connected ?? 0;
  const disconnectedIdle = statusCounts?.disconnected_idle ?? 0;
  const expiredNeedsReauth = statusCounts?.expired_needs_reauth ?? 0;
  const sellingMarketplace = statusCounts?.selling_marketplace ?? 0;
  const spamLimited = statusCounts?.spam_limited ?? 0;

  const connSuccessRate = connMetrics?.connection_success_rate ?? 100;
  const reconnectSuccessRate = connMetrics?.reconnect_success_rate ?? 100;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Navigation Tabs ──────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
              Live Fleet Intelligence
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Admin Intelligence
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Telegram Account Analytics
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Status koneksi aktual sistem, keandalan koneksi, kegagalan autentikasi, distribusi per paket langganan, dan pemantauan akun tanpa membocorkan kredensial.
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
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs">
          <Radio className="h-3.5 w-3.5 mr-1.5 text-cyan-500" />
          Telegram Account Analytics
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Link href="/admin/analytics/automation">
            <Bot className="h-3.5 w-3.5 mr-1.5" />
            Automation Analytics
          </Link>
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
            <Shield className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
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

      {/* ── System Definition & Privacy Integrity Banner ─────────────────────── */}
      <div className="p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 text-xs text-foreground/80 space-y-2">
        <div className="flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-2">
              Integritas Privasi, Status Koneksi Riil, dan Batasan Telegram
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                Zero Credential Leak Guarantee
              </span>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {analyticsData?.tracking_coverage_note ||
                "Metrik status dihitung langsung dari basis data dan socket aktif Telethon in-memory. Sesi autentikasi, OTP, dan token tidak pernah diekspos maupun disimpan dalam log analytics."}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground/90">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Status koneksi diverifikasi dari status database & soket runtime.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Kegagalan jaringan tidak disimpulkan sebagai blokir Telegram.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                <span>Nomor telepon disamarkan (misal: +6281****1234).</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Deck KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Registered Accounts */}
        <Card className="bg-card border-border shadow-xs hover:border-border/80 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Akun Terdaftar
            </CardTitle>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Database className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tracking-tight">
              {totalRegistered.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                +{analyticsData?.new_accounts_in_period ?? 0} baru
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                -{analyticsData?.deleted_accounts_in_period ?? 0} dihapus
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Active & Connected Sockets */}
        <Card className="bg-card border-border shadow-xs hover:border-border/80 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Aktif & Terhubung
            </CardTitle>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {activeConnected.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 truncate">
              {disconnectedIdle} akun berstatus idle di sistem
            </p>
          </CardContent>
        </Card>

        {/* Connection Success Rate */}
        <Card className="bg-card border-border shadow-xs hover:border-border/80 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Connection Success Rate
            </CardTitle>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tracking-tight">
              {connSuccessRate.toFixed(1)}%
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
              <span>Reconnect Rate:</span>
              <span className="font-semibold text-foreground">
                {reconnectSuccessRate.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Expired / Needs Reauth */}
        <Card className="bg-card border-border shadow-xs hover:border-border/80 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Butuh Re-Autentikasi
            </CardTitle>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold tracking-tight",
              expiredNeedsReauth > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
            )}>
              {expiredNeedsReauth.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 truncate">
              Sesi terputus / SessionRevokedError
            </p>
          </CardContent>
        </Card>

        {/* Spam Limited & Marketplace */}
        <Card className="bg-card border-border shadow-xs hover:border-border/80 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Spam Limited & Dijual
            </CardTitle>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tracking-tight">
              {spamLimited.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 truncate">
              {sellingMarketplace} akun listing di marketplace
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Operational Diagnostics & Fleet Health ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Koneksi & Kondisi Akun Riil */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-cyan-500" />
                Status Koneksi Aktual
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-normal">
                {totalRegistered} Akun
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Distribusi status operasional sesuai data riil yang disimpan TeleBos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="space-y-3">
              {/* Aktif & Terhubung */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Aktif & Terhubung (Active)
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {activeConnected} (
                    {totalRegistered > 0
                      ? ((activeConnected / totalRegistered) * 100).toFixed(1)
                      : "0"}
                    %)
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${totalRegistered > 0 ? (activeConnected / totalRegistered) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Idle Disconnected */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Idle / Disconnected
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {disconnectedIdle} (
                    {totalRegistered > 0
                      ? ((disconnectedIdle / totalRegistered) * 100).toFixed(1)
                      : "0"}
                    %)
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-400 rounded-full transition-all duration-500"
                    style={{
                      width: `${totalRegistered > 0 ? (disconnectedIdle / totalRegistered) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Butuh Re-autentikasi */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Sesi Berakhir / Butuh Reauth
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {expiredNeedsReauth} (
                    {totalRegistered > 0
                      ? ((expiredNeedsReauth / totalRegistered) * 100).toFixed(1)
                      : "0"}
                    %)
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${totalRegistered > 0 ? (expiredNeedsReauth / totalRegistered) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Listing Marketplace */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                    Dijual di Marketplace
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {sellingMarketplace} (
                    {totalRegistered > 0
                      ? ((sellingMarketplace / totalRegistered) * 100).toFixed(1)
                      : "0"}
                    %)
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${totalRegistered > 0 ? (sellingMarketplace / totalRegistered) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Spam Limited Spambot */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Spam Limited (@Spambot)
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {spamLimited} (
                    {totalRegistered > 0
                      ? ((spamLimited / totalRegistered) * 100).toFixed(1)
                      : "0"}
                    %)
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${totalRegistered > 0 ? (spamLimited / totalRegistered) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border/60 text-[11px] text-muted-foreground flex justify-between items-center">
              <span>Spambot Verified Normal:</span>
              <span className="font-mono font-medium text-foreground">
                {statusCounts?.spam_normal ?? 0} akun
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Keandalan Koneksi & Diagnostik Error Autentikasi */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Diagnostik Koneksi & Error
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-normal">
                {connMetrics?.total_connection_attempts ?? 0} Percobaan
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Catatan kegagalan koneksi Telethon dan alasan error autentikasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
              <div>
                <span className="text-muted-foreground">Percobaan Berhasil:</span>
                <p className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {connMetrics?.successful_connections ?? 0}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Percobaan Gagal:</span>
                <p className="font-mono font-bold text-base text-rose-600 dark:text-rose-400 mt-0.5">
                  {connMetrics?.failed_connections ?? 0}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Total Reconnect:</span>
                <p className="font-mono font-semibold text-foreground mt-0.5">
                  {connMetrics?.total_reconnect_attempts ?? 0}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Reconnect Berhasil:</span>
                <p className="font-mono font-semibold text-foreground mt-0.5">
                  {connMetrics?.successful_reconnects ?? 0}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                Alasan Kegagalan Paling Sering:
              </p>
              {connMetrics?.top_failure_reasons &&
              Object.keys(connMetrics.top_failure_reasons).length > 0 ? (
                <div className="space-y-1.5">
                  {Object.entries(connMetrics.top_failure_reasons).map(([reason, count]) => (
                    <div
                      key={reason}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40 text-xs"
                    >
                      <span className="font-mono text-[11px] text-foreground truncate max-w-[200px]" title={reason}>
                        {reason}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0">
                        {count} kali
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500/60 mx-auto mb-1.5" />
                  Tidak ada error koneksi atau sesi tercatat pada periode ini.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Distribusi Akun per Paket & Kepemilikan User */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-500" />
                Distribusi Paket & Kepemilikan
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-normal">
                {planDist?.users_with_accounts_count ?? 0} User
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Sebaran kepemilikan akun Telegram berdasarkan subscription tier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs">
              <span className="text-muted-foreground">Rata-rata Akun per User:</span>
              <span className="font-mono font-bold text-base text-purple-600 dark:text-purple-400">
                {(planDist?.average_accounts_per_user ?? 0).toFixed(2)} akun
              </span>
            </div>

            {/* Plan distribution */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Distribusi per Subscription Plan:</p>
              {planDist?.plan_distribution && Object.keys(planDist.plan_distribution).length > 0 ? (
                <div className="space-y-1.5">
                  {Object.entries(planDist.plan_distribution).map(([plan, count]) => (
                    <div key={plan} className="flex justify-between items-center text-xs">
                      <span className="capitalize font-medium text-foreground">{plan}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">{count} akun</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{
                              width: `${totalRegistered > 0 ? (count / totalRegistered) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Belum ada data distribusi plan.</p>
              )}
            </div>

            {/* Depth distribution */}
            <div className="pt-3 border-t border-border/60 space-y-2">
              <p className="text-xs font-semibold text-foreground">Kedalaman Kepemilikan User:</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-muted-foreground">1 Akun:</span>
                  <p className="font-mono font-bold text-foreground">
                    {planDist?.depth_distribution?.["1"] ?? 0} user
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-muted-foreground">2 - 5 Akun:</span>
                  <p className="font-mono font-bold text-foreground">
                    {planDist?.depth_distribution?.["2_to_5"] ?? 0} user
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-muted-foreground">6 - 10 Akun:</span>
                  <p className="font-mono font-bold text-foreground">
                    {planDist?.depth_distribution?.["6_to_10"] ?? 0} user
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                  <span className="text-muted-foreground">&gt; 10 Akun:</span>
                  <p className="font-mono font-bold text-foreground">
                    {planDist?.depth_distribution?.["more_than_10"] ?? 0} user
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Timeseries Growth & Lifecycle Trend ─────────────────────────────── */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-500" />
                Tren Penambahan & Penghapusan Akun
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Frekuensi akun baru yang dihubungkan ke platform TeleBos dari waktu ke waktu.
              </CardDescription>
            </div>
            <div className="inline-flex items-center p-1 bg-muted/70 border border-border/80 rounded-xl">
              <button
                type="button"
                onClick={() => setTrendMetric("accounts_added")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all",
                  trendMetric === "accounts_added"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Penambahan Akun
              </button>
              <button
                type="button"
                onClick={() => setTrendMetric("accounts_deleted")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all",
                  trendMetric === "accounts_deleted"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Penghapusan Akun
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isTrendLoading ? (
            <div className="h-[260px] flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
          ) : trendData?.points && trendData.points.length > 0 ? (
            <div className="h-[260px] w-full">
              <AnalyticsAreaChart
                data={trendData.points.map((p) => ({
                  date: p.date,
                  value: p.value,
                }))}
                metricLabel={trendMetric === "accounts_added" ? "Akun Baru" : "Akun Dihapus"}
                color={trendMetric === "accounts_added" ? "blue" : "rose"}
              />
            </div>
          ) : (
            <div className="h-[260px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/60 rounded-xl">
              <Radio className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-foreground">
                Belum ada data tren tercatat
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Data tren diakumulasikan setiap kali ada akun baru yang didaftarkan atau dihapus oleh user.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Status Change & Connection Audit Trail Stream ────────────────────── */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-500" />
                Riwayat Perubahan Status & Log Koneksi
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Audit event perubahan status sesi dan koneksi akun (sanitasi ketat tanpa kredensial).
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-normal">
              Audit Event Stream
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {analyticsData?.recent_status_events && analyticsData.recent_status_events.length > 0 ? (
            <div className="divide-y divide-border/50 border border-border/60 rounded-xl overflow-hidden">
              {analyticsData.recent_status_events.map((evt: AccountStatusHistoryItem) => (
                <div
                  key={evt.id}
                  className="p-3 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className={cn(
                      "p-1.5 rounded-lg shrink-0",
                      evt.event_name.includes("failed") || evt.event_name.includes("expired")
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : evt.event_name.includes("disconnected") || evt.event_name.includes("deleted")
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}>
                      {evt.event_name.includes("failed") || evt.event_name.includes("expired") ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : evt.event_name.includes("deleted") ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <Radio className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{evt.event_name}</span>
                        {evt.status_change && (
                          <Badge variant="secondary" className="text-[10px] py-0 font-mono">
                            {evt.status_change}
                          </Badge>
                        )}
                        {evt.phone_masked && (
                          <span className="font-mono text-muted-foreground text-[11px] flex items-center gap-1">
                            <Lock className="h-3 w-3 text-cyan-500" />
                            {evt.phone_masked}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {evt.user_email && <span>User: {evt.user_email}</span>}
                        {evt.error_reason && (
                          <span className="text-rose-500 font-medium">
                            Error: {evt.error_reason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap pl-9 sm:pl-0">
                    {format(new Date(evt.timestamp), "dd MMM yyyy, HH:mm:ss")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center border border-dashed border-border/60 rounded-xl text-xs text-muted-foreground">
              <Clock className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              Belum ada riwayat audit status akun tercatat pada basis data audit event.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Paginated Telegram Account Directory Table ───────────────────────── */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-500" />
                Direktori Akun Telegram
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Daftar akun lengkap dengan status koneksi, timestamp pembaruan, dan status spam.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                Total: {directoryData?.total ?? 0} Akun
              </Badge>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="sm:col-span-6 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor HP, username, nama, atau email pemilik..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </form>

            {/* Status Filter */}
            <div className="sm:col-span-3">
              <select
                aria-label="Filter Status Akun"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 text-xs rounded-lg border border-input bg-background px-3 py-1 shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Status</option>
                <option value="active">Active (Aktif)</option>
                <option value="expired">Expired (Butuh Reauth)</option>
                <option value="limited">Spam Limited</option>
                <option value="selling">Dijual di Marketplace</option>
              </select>
            </div>

            {/* Role Filter */}
            <div className="sm:col-span-3">
              <select
                aria-label="Filter Paket Langganan User"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 text-xs rounded-lg border border-input bg-background px-3 py-1 shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Paket User</option>
                <option value="freetrial">Free Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-y border-border/80 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Akun Telegram</th>
                  <th className="py-3 px-4">Pemilik (User)</th>
                  <th className="py-3 px-4">Status Koneksi</th>
                  <th className="py-3 px-4">Status Spam</th>
                  <th className="py-3 px-4">Fitur</th>
                  <th className="py-3 px-4">Terakhir Diperbarui</th>
                  <th className="py-3 px-4">Terdaftar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isDirectoryLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                      Memuat daftar akun Telegram...
                    </td>
                  </tr>
                ) : directoryData?.accounts && directoryData.accounts.length > 0 ? (
                  directoryData.accounts.map((acc: AccountDirectoryItem) => (
                    <tr key={acc.id} className="hover:bg-muted/30 transition-colors">
                      {/* Akun Telegram */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span>{acc.first_name || "Tanpa Nama"}</span>
                            {acc.is_premium && (
                              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[9px] py-0 px-1">
                                TG Premium
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                            <span className="flex items-center gap-1">
                              <Lock className="h-3 w-3 text-cyan-500 shrink-0" />
                              {acc.phone_masked}
                            </span>
                            {acc.username && (
                              <span className="text-primary font-normal">@{acc.username}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Pemilik (User) */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-medium text-foreground block truncate max-w-[150px]" title={acc.user_email}>
                            {acc.user_email}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0 capitalize">
                            {acc.user_role}
                          </Badge>
                        </div>
                      </td>

                      {/* Status Koneksi */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {acc.is_active ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] py-0 font-medium">
                              Aktif
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] py-0 font-medium">
                              Butuh Reauth
                            </Badge>
                          )}
                          {acc.in_memory_connected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Socket Live
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              Idle
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Spam */}
                      <td className="py-3 px-4">
                        {acc.spam_status === "limited" ? (
                          <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] py-0">
                            Spam Limited
                          </Badge>
                        ) : acc.spam_status === "normal" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] py-0">
                            Normal
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] py-0 text-muted-foreground">
                            Belum Cek
                          </Badge>
                        )}
                      </td>

                      {/* Fitur */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {acc.for_sale && (
                            <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[9px] py-0 px-1">
                              Dijual
                            </Badge>
                          )}
                          {acc.auto_reply_enabled && (
                            <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[9px] py-0 px-1">
                              Auto-Reply
                            </Badge>
                          )}
                          {!acc.for_sale && !acc.auto_reply_enabled && (
                            <span className="text-muted-foreground text-[10px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Terakhir Diperbarui */}
                      <td className="py-3 px-4 text-muted-foreground text-[11px] whitespace-nowrap">
                        <div>
                          {acc.last_sync_at ? (
                            <span>Sync: {format(new Date(acc.last_sync_at), "dd/MM/yy HH:mm")}</span>
                          ) : acc.updated_at ? (
                            <span>Upd: {format(new Date(acc.updated_at), "dd/MM/yy HH:mm")}</span>
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                        {acc.spam_last_checked_at && (
                          <div className="text-[10px] text-muted-foreground/70">
                            Spam: {format(new Date(acc.spam_last_checked_at), "dd/MM/yy")}
                          </div>
                        )}
                      </td>

                      {/* Terdaftar */}
                      <td className="py-3 px-4 text-muted-foreground text-[11px] whitespace-nowrap">
                        {format(new Date(acc.created_at), "dd MMM yyyy")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Tidak ada akun Telegram yang sesuai dengan kriteria filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {directoryData && directoryData.total_pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border/80 text-xs">
              <span className="text-muted-foreground">
                Halaman <span className="font-semibold text-foreground">{directoryData.page}</span> dari{" "}
                <span className="font-semibold text-foreground">{directoryData.total_pages}</span> (Total {directoryData.total} akun)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || isDirectoryLoading}
                  className="h-8 px-2.5 gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(directoryData.total_pages, p + 1))}
                  disabled={currentPage >= directoryData.total_pages || isDirectoryLoading}
                  className="h-8 px-2.5 gap-1 text-xs"
                >
                  Berikutnya
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
