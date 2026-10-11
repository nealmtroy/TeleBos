"use client";

import React, { useState } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Radio,
  DollarSign,
  ShieldCheck,
  Shield,
  AlertTriangle,
  RefreshCw,
  Calendar,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowRight,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Zap,
  BarChart3,
  Bot,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  AnalyticsRange,
  useAdminAnalyticsOverview,
  useAdminAnalyticsTimeseries,
  useAdminAnalyticsAutomation,
} from "@/hooks/use-admin-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { AnalyticsAreaChart } from "@/components/admin/analytics-chart";
import { cn } from "@/lib/utils";

export default function AdminAnalyticsOverviewPage() {
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

  return <AnalyticsContent />;
}

function AnalyticsContent() {
  const _ = useT();
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("7d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [activeChartTab, setActiveChartTab] = useState<"revenue" | "transactions">("revenue");

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
    data: overview,
    isLoading: isOverviewLoading,
    error: overviewError,
    refetch: refetchOverview,
    isFetching: isOverviewFetching,
  } = useAdminAnalyticsOverview(queryParams);

  const {
    data: userTrend,
    isLoading: isUserTrendLoading,
    refetch: refetchUserTrend,
  } = useAdminAnalyticsTimeseries("users", queryParams);

  const {
    data: revenueTrend,
    isLoading: isRevenueTrendLoading,
    refetch: refetchRevenueTrend,
  } = useAdminAnalyticsTimeseries("revenue", queryParams);

  const {
    data: transactionsTrend,
    isLoading: isTxTrendLoading,
    refetch: refetchTxTrend,
  } = useAdminAnalyticsTimeseries("transactions", queryParams);

  const {
    data: automationData,
    isLoading: isAutomationLoading,
    refetch: refetchAutomation,
  } = useAdminAnalyticsAutomation(queryParams);

  const isRefreshing = isOverviewFetching;

  const handleRefreshAll = () => {
    refetchOverview();
    refetchUserTrend();
    refetchRevenueTrend();
    refetchTxTrend();
    refetchAutomation();
  };

  // Calculation helpers
  const userGrowthPct = overview?.user_growth_percentage ?? 0;
  const revenueGrowthPct = overview?.revenue_growth_percentage ?? 0;
  const deliveryRate = overview?.broadcast_delivery_rate ?? 100;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Controls ──────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Analytics Overview
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Analytics Overview
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Real-time business performance, user growth, telegram fleet operations, and financial metrics.
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
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs">
          <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
          Analytics Overview
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

      {/* ── Error Banner ────────────────────────────────────────────────────── */}
      {overviewError && (
        <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>Gagal memuat metrik analytics dari server. Pastikan backend aktif.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            className="border-destructive/30 hover:bg-destructive/20 h-8"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ── 1. Top Executive KPI Cards ──────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Total Users & Growth */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Users</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isOverviewLoading ? "..." : (overview?.total_registered_users ?? 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span
                  className={cn(
                    "inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-md",
                    userGrowthPct >= 0
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/15 text-destructive"
                  )}
                >
                  {userGrowthPct >= 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
                  )}
                  {userGrowthPct > 0 ? `+${userGrowthPct}%` : `${userGrowthPct}%`}
                </span>
                <span className="text-[11px] text-muted-foreground">vs prev period</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>DAU: {overview?.dau ?? 0}</span>
              <span>WAU: {overview?.wau ?? 0}</span>
              <span>MAU: {overview?.mau ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Paid Subscriptions */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Paid Subscriptions</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isOverviewLoading ? "..." : (overview?.active_paid_subscriptions ?? 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  Pro & Premium Active
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Conversion Rate</span>
              <span className="font-semibold text-foreground font-mono">
                {overview?.total_registered_users
                  ? (
                      ((overview.active_paid_subscriptions ?? 0) /
                        overview.total_registered_users) *
                      100
                    ).toFixed(1)
                  : "0.0"}
                %
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Connected Telegram Accounts */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Telegram Fleet</span>
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isOverviewLoading ? "..." : (overview?.total_telegram_accounts ?? 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {overview?.active_telegram_accounts ?? 0} Aktif
                </span>
                {Boolean(overview?.spam_limited_accounts) && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {overview?.spam_limited_accounts} Limited
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Fleet Health</span>
              <span className="font-semibold text-foreground font-mono">
                {overview?.total_telegram_accounts
                  ? Math.round(
                      ((overview.active_telegram_accounts ?? 0) /
                        overview.total_telegram_accounts) *
                        100
                    )
                  : 100}
                %
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Platform Gross Revenue */}
        <Card className="rounded-2xl border-border bg-card shadow-xs border-emerald-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Gross Platform Revenue
              </span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {isOverviewLoading
                  ? "..."
                  : `Rp ${(overview?.gross_revenue ?? 0).toLocaleString("id-ID")}`}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span
                  className={cn(
                    "inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-md",
                    revenueGrowthPct >= 0
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/15 text-destructive"
                  )}
                >
                  {revenueGrowthPct >= 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
                  )}
                  {revenueGrowthPct > 0 ? `+${revenueGrowthPct}%` : `${revenueGrowthPct}%`}
                </span>
                <span className="text-[11px] text-muted-foreground">vs prev period</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Net Platform Margin</span>
              <span className="font-semibold text-foreground font-mono">
                Rp {(overview?.net_platform_margin ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Automation Success Rate */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Automation Delivery</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Radio className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {isOverviewLoading ? "..." : `${deliveryRate}%`}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                <span>{(overview?.total_broadcast_messages_sent ?? 0).toLocaleString()} terkirim</span>
                <span>•</span>
                <span className="text-destructive">
                  {(overview?.total_broadcast_messages_failed ?? 0).toLocaleString()} gagal
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Period Volume</span>
              <span className="font-semibold text-foreground font-mono">
                {(
                  (overview?.total_broadcast_messages_sent ?? 0) +
                  (overview?.total_broadcast_messages_failed ?? 0)
                ).toLocaleString()}{" "}
                msges
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── 2. Interactive Charts Section ───────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Pertumbuhan Pengguna Baru
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Registrasi akun harian selama rentang waktu terpilih
                </CardDescription>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Total Penambahan</span>
                <div className="text-lg font-bold text-foreground">
                  {isUserTrendLoading ? "..." : `+${userTrend?.summary_total ?? 0}`}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <AnalyticsAreaChart
              data={userTrend?.points ?? []}
              metricLabel="Pengguna Baru"
              color="blue"
              height={220}
              isLoading={isUserTrendLoading}
              emptyMessage="Belum ada pendaftaran akun pada periode ini"
            />
          </CardContent>
        </Card>

        {/* Revenue & Transactions Chart */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  Tren Finansial & Transaksi
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Gross revenue platform dan volume transaksi harian
                </CardDescription>
              </div>
              <Tabs
                value={activeChartTab}
                onValueChange={(v) => setActiveChartTab(v as "revenue" | "transactions")}
              >
                <TabsList className="h-8 p-0.5 bg-muted">
                  <TabsTrigger value="revenue" className="text-xs px-2.5 h-7">
                    Revenue
                  </TabsTrigger>
                  <TabsTrigger value="transactions" className="text-xs px-2.5 h-7">
                    Transaksi
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {activeChartTab === "revenue" ? (
              <AnalyticsAreaChart
                data={revenueTrend?.points ?? []}
                metricLabel="Gross Revenue"
                formatValue={(v) => `Rp ${v.toLocaleString("id-ID")}`}
                color="emerald"
                height={220}
                isLoading={isRevenueTrendLoading}
                emptyMessage="Tidak ada transaksi pendapatan pada periode ini"
              />
            ) : (
              <AnalyticsAreaChart
                data={transactionsTrend?.points ?? []}
                metricLabel="Total Transaksi"
                formatValue={(v) => `${v.toLocaleString()} orders`}
                color="indigo"
                height={220}
                isLoading={isTxTrendLoading}
                emptyMessage="Tidak ada volume order pada periode ini"
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 3. Operational Reliability & Financial Health Bento Grid ────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Financial Flow & Liability */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              Kesehatan Kas & Liabilitas Saldo
            </CardTitle>
            <CardDescription className="text-xs">
              Aliran deposit pengguna vs penarikan dan liabilitas platform
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Top-up Disetujui</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                Rp {(overview?.topup_approved_volume ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Withdraw Disetujui</span>
              <span className="font-semibold text-destructive font-mono">
                Rp {(overview?.withdraw_approved_volume ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
              <span className="font-medium text-foreground">Net Cashflow Periode Ini</span>
              <span
                className={cn(
                  "font-bold font-mono",
                  (overview?.net_cashflow ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                )}
              >
                Rp {(overview?.net_cashflow ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-muted/60 border border-border/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">User Balance Liability</span>
                <span className="font-bold text-foreground font-mono">
                  Rp {(overview?.current_balance_liability ?? 0).toLocaleString("id-ID")}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Total saldo riil pengguna aktif yang belum dibelanjakan (kewajiban platform).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Automation Failures & System Health */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-500" />
                Reliability & Error Breakdown
              </CardTitle>
              <Badge
                variant={(overview?.system_errors_count ?? 0) === 0 ? "outline" : "destructive"}
                className="text-[11px]"
              >
                {(overview?.system_errors_count ?? 0) === 0 ? "System Healthy" : "Errors Logged"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Ringkasan kendala limitasi Telegram dan kegagalan job
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {[
              {
                label: "Telegram FloodWait",
                count: overview?.top_failure_reasons?.flood_wait ?? 0,
                color: "bg-amber-500",
              },
              {
                label: "Banned / Deactivated Account",
                count: overview?.top_failure_reasons?.banned ?? 0,
                color: "bg-destructive",
              },
              {
                label: "Group SlowMode Limit",
                count: overview?.top_failure_reasons?.slowmode ?? 0,
                color: "bg-indigo-500",
              },
              {
                label: "Admin-Only Restrictions",
                count: overview?.top_failure_reasons?.admin_only ?? 0,
                color: "bg-purple-500",
              },
            ].map((f) => (
              <div key={f.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-mono font-medium text-foreground">{f.count}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", f.color)}
                    style={{
                      width: `${Math.min(
                        100,
                        (f.count /
                          Math.max(1, overview?.total_broadcast_messages_failed ?? 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>System Error Events:</span>
              <span className="font-semibold text-foreground font-mono">
                {overview?.system_errors_count ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Active Operations Pulse */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              Operasional Otomasi & Layanan
            </CardTitle>
            <CardDescription className="text-xs">
              Aktivitas modul worker pada periode yang dipilih
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Broadcast Jobs Diproses</span>
              <span className="font-mono font-semibold text-foreground">
                {automationData?.total_broadcast_jobs ?? 0} jobs
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Member Invite Berhasil</span>
              <span className="font-mono font-semibold text-foreground">
                {(automationData?.total_members_invited ?? 0).toLocaleString()} users
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Auto-Join Succeeded</span>
              <span className="font-mono font-semibold text-foreground">
                {(automationData?.total_auto_joins_succeeded ?? 0).toLocaleString()} groups
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Auto-Replies Terkirim</span>
              <span className="font-mono font-semibold text-foreground">
                {(automationData?.total_auto_replies_sent ?? 0).toLocaleString()} replies
              </span>
            </div>
            <div className="pt-2 border-t border-border/40 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Audit Raw Telemetry</span>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2">
                <Link href="/admin/dashboard">
                  Buka Console <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
