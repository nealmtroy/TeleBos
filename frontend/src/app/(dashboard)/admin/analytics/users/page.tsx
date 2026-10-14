"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Shield,
  RefreshCw,
  Radio,
  Bot,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Layers,
  Filter,
  HelpCircle,
  ArrowRight,
  Activity,
  Award,
  Zap,
  DollarSign,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  AnalyticsRange,
  useAdminUserAnalytics,
  useAdminAnalyticsTimeseries,
} from "@/hooks/use-admin-analytics";
import { useAdminUsers, AdminUser } from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { AnalyticsAreaChart } from "@/components/admin/analytics-chart";
import { cn } from "@/lib/utils";

export default function AdminUserAnalyticsPage() {
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

  return <UserAnalyticsContent />;
}

function UserAnalyticsContent() {
  const _ = useT();

  // Range and date filter state
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Table search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Query parameters formatted for backend API
  const queryParams = useMemo(
    () => ({
      range: selectedRange,
      start_date:
        selectedRange === "custom" && customRange?.from
          ? format(customRange.from, "yyyy-MM-dd")
          : undefined,
      end_date:
        selectedRange === "custom" && customRange?.to
          ? format(customRange.to, "yyyy-MM-dd")
          : undefined,
    }),
    [selectedRange, customRange]
  );

  // Data queries
  const {
    data: userAnalytics,
    isLoading: isAnalyticsLoading,
    isFetching: isAnalyticsFetching,
    refetch: refetchAnalytics,
  } = useAdminUserAnalytics(queryParams);

  const {
    data: userTrend,
    isLoading: isTrendLoading,
    refetch: refetchTrend,
  } = useAdminAnalyticsTimeseries("users", queryParams);

  // User table query (fetching first 100 for client-side search/role filtering)
  const {
    data: userListData,
    isLoading: isUsersLoading,
    refetch: refetchUsers,
  } = useAdminUsers(undefined, 100, 0);

  const isRefreshing = isAnalyticsFetching;

  const handleRefreshAll = () => {
    refetchAnalytics();
    refetchTrend();
    refetchUsers();
  };

  // Filtered users for table
  const filteredUsers = useMemo(() => {
    if (!userListData?.users) return [];
    return userListData.users.filter((u: AdminUser) => {
      // Search term
      if (searchInput.trim()) {
        const term = searchInput.toLowerCase();
        const matchesName = u.full_name?.toLowerCase().includes(term);
        const matchesEmail = u.email?.toLowerCase().includes(term);
        if (!matchesName && !matchesEmail) return false;
      }
      // Role filter
      if (roleFilter !== "all" && u.role !== roleFilter) {
        return false;
      }
      // Status filter
      if (statusFilter === "banned" && u.is_active) return false;
      if (statusFilter === "suspended") {
        const isSuspended = u.ban_expires && new Date(u.ban_expires) > new Date();
        if (!isSuspended) return false;
      }
      if (statusFilter === "active") {
        const isSuspended = u.ban_expires && new Date(u.ban_expires) > new Date();
        if (!u.is_active || isSuspended) return false;
      }
      return true;
    });
  }, [userListData?.users, searchInput, roleFilter, statusFilter]);

  // Paginated slice
  const totalUsersInFilter = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsersInFilter / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Extracted metrics
  const totalUsers = userAnalytics?.total_users ?? 0;
  const newUsers = userAnalytics?.new_users_in_period ?? 0;
  const userGrowthPct = userAnalytics?.user_growth_percentage ?? 0;
  const dau = userAnalytics?.dau ?? 0;
  const wau = userAnalytics?.wau ?? 0;
  const mau = userAnalytics?.mau ?? 0;
  const stickiness = userAnalytics?.stickiness_dau_mau_ratio ?? 0;
  const productActive = userAnalytics?.product_meaningful_active_users ?? 0;
  const productActiveRate = userAnalytics?.product_meaningful_active_rate ?? 0;
  const churned = userAnalytics?.churned_users_count ?? 0;
  const reactivated = userAnalytics?.reactivated_users_count ?? 0;

  const retention = userAnalytics?.retention;
  const adoption = userAnalytics?.feature_adoption;
  const statusBreakdown = userAnalytics?.status_breakdown;
  const roleDist = userAnalytics?.role_distribution ?? {};

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Navigation Tabs ──────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Cohort & Demographics
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Admin Intelligence
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            User Analytics & Lifecycle
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Metrik pertumbuhan pengguna, kohor retensi D1/D7/D30 yang matang, aktivitas produk bermakna, dan adopsi fitur TeleBos.
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
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs">
          <Users className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
          User Analytics
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

      {/* ── Historical Data Boundary & Methodology Note ──────────────────────── */}
      <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-xs text-foreground/80 space-y-2">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              Transparansi Pelacakan Historis & Ketentuan Kohor Retensi
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {userAnalytics?.tracking_coverage_note ||
                "Aktivitas produk dihitung dari mutasi transaksi riil, log automasi Telegram, dan riwayat pesanan SMM. Kohor retensi mengevaluasi pengguna yang telah mencapai usia batas D1 (24 jam), D7 (7 hari), dan D30 (30 hari)."}
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              *Catatan:* Event tracking mendalam diperkenalkan pada rilis sistem terkini. Data sebelum periode ini mengandalkan rekaman transaksi persisten (pesanan, mutasi ledger, dan status akun Telegram). Kohor yang belum mencapai batas waktu matang ditampilkan sebagai <span className="font-mono font-medium text-amber-600 dark:text-amber-400">N/A</span> untuk mencegah bias metrik nol persen palsu.
            </p>
          </div>
        </div>
      </div>

      {/* ── Key Metrics Deck (Top Cards) ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total & New Users */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-medium text-muted-foreground">Total & Pengguna Baru</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-foreground tracking-tight">
                {isAnalyticsLoading ? "..." : totalUsers.toLocaleString()}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-medium gap-1",
                  userGrowthPct >= 0
                    ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
                    : "text-rose-600 bg-rose-500/10 border-rose-500/20"
                )}
              >
                {userGrowthPct >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {userGrowthPct >= 0 ? `+${userGrowthPct}%` : `${userGrowthPct}%`}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
              <span>Baru di periode ini:</span>
              <span className="font-semibold text-foreground">
                +{isAnalyticsLoading ? "..." : newUsers.toLocaleString()} user
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Engagement (DAU, WAU, MAU & Stickiness) */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-medium text-muted-foreground">Keaktifan Sesi (DAU / MAU)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-foreground tracking-tight">
                {isAnalyticsLoading ? "..." : dau.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">DAU</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {stickiness}%
                </span>
                <span className="text-[10px] text-muted-foreground block">Stickiness</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
              <span>WAU: <strong className="text-foreground">{wau.toLocaleString()}</strong></span>
              <span>MAU: <strong className="text-foreground">{mau.toLocaleString()}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Meaningful Product Active Users */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Aktif Produk Bermakna</span>
              <span
                title="Pengguna yang melakukan aksi nyata: menghubungkan akun Telegram, broadcast, invite, auto-reply, order SMM, atau transaksi kasir/marketplace (bukan hanya login pasif)."
                className="cursor-help text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-3 w-3" />
              </span>
            </div>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
              <Zap className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-foreground tracking-tight">
                {isAnalyticsLoading ? "..." : productActive.toLocaleString()}
              </div>
              <Badge variant="outline" className="text-xs font-medium text-sky-600 bg-sky-500/10 border-sky-500/20">
                {productActiveRate}% Dari Total
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight pt-1 border-t border-border/50">
              Aksi riil (fleet Telegram, kampanye, atau transaksi finansial).
            </p>
          </CardContent>
        </Card>

        {/* Churn & Reactivation */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-medium text-muted-foreground">Churn & Reaktivasi</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <UserMinus className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold text-foreground tracking-tight">
                  {churned.toLocaleString()}
                </span>
                <span className="text-xs font-normal text-muted-foreground ml-1">Churn</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  +{reactivated.toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground block">Reaktif</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
              <span>Langganan habis di periode:</span>
              <span className="font-semibold text-rose-500">{churned} user</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Retention Cohorts (D1, D7, D30 with Strict Maturity Logic) ───────── */}
      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                Kohor Retensi Pengguna (D1, D7, D30)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Evaluasi tingkat retensi kohor pendaftaran dengan filter batas kedaluwarsa waktu nyata.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs self-start sm:self-auto">
              Ukuran Kohor: {retention?.cohort_total_users ?? newUsers} Pengguna Baru
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* D1 Retention */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Retensi D1 (24 Jam)</span>
                {retention?.d1_retention_rate !== null && retention?.d1_retention_rate !== undefined ? (
                  <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs">
                    {retention.d1_retention_rate}%
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-amber-600 bg-amber-500/10 border-amber-500/20">
                    Belum Matang (&lt;24 Jam)
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all rounded-full"
                    style={{ width: `${retention?.d1_retention_rate ?? 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Memenuhi Syarat: {retention?.d1_eligible_users ?? 0}</span>
                  <span>Kembali: {retention?.d1_retained_users ?? 0}</span>
                </div>
              </div>
            </div>

            {/* D7 Retention */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Retensi D7 (7 Hari)</span>
                {retention?.d7_retention_rate !== null && retention?.d7_retention_rate !== undefined ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                    {retention.d7_retention_rate}%
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-amber-600 bg-amber-500/10 border-amber-500/20">
                    Belum Matang (&lt;7 Hari)
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all rounded-full"
                    style={{ width: `${retention?.d7_retention_rate ?? 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Memenuhi Syarat: {retention?.d7_eligible_users ?? 0}</span>
                  <span>Kembali: {retention?.d7_retained_users ?? 0}</span>
                </div>
              </div>
            </div>

            {/* D30 Retention */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Retensi D30 (30 Hari)</span>
                {retention?.d30_retention_rate !== null && retention?.d30_retention_rate !== undefined ? (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                    {retention.d30_retention_rate}%
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-amber-600 bg-amber-500/10 border-amber-500/20">
                    Belum Matang (&lt;30 Hari)
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{ width: `${retention?.d30_retention_rate ?? 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Memenuhi Syarat: {retention?.d30_eligible_users ?? 0}</span>
                  <span>Kembali: {retention?.d30_retained_users ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── User Lifecycle Status & Subscription Distribution ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Status Breakdown */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-500" />
              Status Siklus Hidup Pengguna
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Klasifikasi seluruh basis pengguna platform ke dalam status operasional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block">
                  Aktif (MAU)
                </span>
                <span className="text-xl font-bold text-foreground">
                  {statusBreakdown?.active_users_count.toLocaleString() ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-[11px] font-medium text-muted-foreground block">
                  Tidak Aktif (&gt;30d)
                </span>
                <span className="text-xl font-bold text-foreground">
                  {statusBreakdown?.dormant_users_count.toLocaleString() ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 block">
                  Ditangguhkan
                </span>
                <span className="text-xl font-bold text-foreground">
                  {statusBreakdown?.suspended_users_count.toLocaleString() ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 block">
                  Diblokir Permanen
                </span>
                <span className="text-xl font-bold text-foreground">
                  {statusBreakdown?.banned_users_count.toLocaleString() ?? 0}
                </span>
              </div>
            </div>

            {/* Expiring Subscriptions Notice */}
            {(userAnalytics?.expiring_subscriptions_30d ?? 0) > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>{userAnalytics?.expiring_subscriptions_30d}</strong> langganan berbayar akan kedaluwarsa dalam 30 hari ke depan.
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 text-xs border-amber-500/30">
                  <Link href="/admin/users">Review</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Plan Distribution */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="h-4 w-4 text-sky-500" />
              Distribusi Paket Langganan
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Proporsi paket pengguna aktif di TeleBos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(
              [
                { key: "freetrial", label: "Free Trial", color: "bg-muted-foreground" },
                { key: "basic", label: "Basic", color: "bg-blue-500" },
                { key: "pro", label: "Pro", color: "bg-sky-500" },
                { key: "premium", label: "Premium VIP", color: "bg-amber-500" },
                { key: "owner", label: "Owner / Internal", color: "bg-rose-500" },
              ] as const
            ).map((plan) => {
              const count = roleDist[plan.key] ?? 0;
              const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
              return (
                <div key={plan.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">{plan.label}</span>
                    <span className="text-muted-foreground">
                      {count.toLocaleString()} user ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all rounded-full", plan.color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── Feature Adoption Bento Grid ─────────────────────────────────────── */}
      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-500" />
            Adopsi Fitur Utama Platform TeleBos
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Tingkat utilisasi kapabilitas inti oleh pengguna terdaftar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Telegram fleet */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  Armada Akun Telegram
                </span>
                <Badge variant="outline" className="text-xs font-mono font-medium">
                  {adoption?.telegram_accounts_adoption_rate ?? 0}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {adoption?.telegram_accounts_connected_users ?? 0} user telah mengkoneksikan $\ge 1$ akun MTProto.
              </p>
            </div>

            {/* Broadcast */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-emerald-500" />
                  Mesin Siaran / Broadcast
                </span>
                <Badge variant="outline" className="text-xs font-mono font-medium">
                  {adoption?.broadcast_adoption_rate ?? 0}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {adoption?.broadcast_users ?? 0} user telah meluncurkan kampanye broadcast multi-grup.
              </p>
            </div>

            {/* Member Influx */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-sky-500" />
                  Auto-Invite & Influx
                </span>
                <Badge variant="outline" className="text-xs font-mono font-medium">
                  {adoption?.invite_adoption_rate ?? 0}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {adoption?.invite_users ?? 0} user menggunakan task penambahan member otomatis.
              </p>
            </div>

            {/* Auto-Reply */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-amber-500" />
                  Bot Auto-Reply DM
                </span>
                <Badge variant="outline" className="text-xs font-mono font-medium">
                  {adoption?.auto_reply_adoption_rate ?? 0}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {adoption?.auto_reply_users ?? 0} user mengonfigurasi skrip balasan pesan otomatis.
              </p>
            </div>

            {/* SMM Buzzer */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-rose-500" />
                  Layanan SMM Buzzer
                </span>
                <Badge variant="outline" className="text-xs font-mono font-medium">
                  {adoption?.smm_order_adoption_rate ?? 0}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {adoption?.smm_order_users ?? 0} user telah memesan suntik views, members, atau reaksi.
              </p>
            </div>

            {/* Marketplace Trading */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-teal-500" />
                  Marketplace Trading
                </span>
                <Badge variant="outline" className="text-xs font-mono font-medium">
                  {adoption?.marketplace_adoption_rate ?? 0}%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {adoption?.marketplace_traders ?? 0} user terlibat dalam jual-beli akun Telegram siap pakai.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── User Growth Timeseries Trend Chart ───────────────────────────────── */}
      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Tren Registrasi & Kecepatan Pengguna
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Volume pendaftaran pengguna baru per hari pada rentang waktu terpilih.
              </CardDescription>
            </div>
            {userTrend && (
              <Badge variant="secondary" className="text-xs self-start sm:self-auto font-mono">
                Rata-rata: {userTrend.summary_average.toFixed(1)} user / hari
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <AnalyticsAreaChart
            data={userTrend?.points ?? []}
            metricLabel="Pendaftaran Baru"
            color="blue"
            height={260}
            isLoading={isTrendLoading}
            emptyMessage="Belum ada pendaftaran baru pada rentang waktu ini"
          />
        </CardContent>
      </Card>

      {/* ── Searchable & Paginated User Directory ────────────────────────────── */}
      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Daftar & Penelusuran Pengguna
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Cari, filter per peran, dan inspeksi riwayat operasional pengguna.
              </CardDescription>
            </div>

            {/* Search & Filter Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau email..."
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>

              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-2.5 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-hidden"
              >
                <option value="all">Semua Peran</option>
                <option value="freetrial">Free Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
                <option value="owner">Owner</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-2.5 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-hidden"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif Normal</option>
                <option value="suspended">Ditangguhkan</option>
                <option value="banned">Diblokir</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="py-3 px-4">Pengguna</th>
                  <th className="py-3 px-4">Paket / Peran</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Saldo Dompet</th>
                  <th className="py-3 px-4 text-center">Akun TG</th>
                  <th className="py-3 px-4 text-center">Pesanan SMM</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isUsersLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3 px-4">
                        <div className="h-4 w-32 bg-muted rounded-sm" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-4 w-16 bg-muted rounded-sm" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-4 w-12 bg-muted rounded-sm" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="h-4 w-20 bg-muted rounded-sm ml-auto" />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="h-4 w-8 bg-muted rounded-sm mx-auto" />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="h-4 w-8 bg-muted rounded-sm mx-auto" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="h-4 w-12 bg-muted rounded-sm ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Tidak ada pengguna yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user: AdminUser) => {
                    const isSuspended =
                      user.ban_expires && new Date(user.ban_expires) > new Date();

                    return (
                      <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {user.full_name || "Tanpa Nama"}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {user.email}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] uppercase font-bold",
                              user.role === "premium" && "text-amber-600 border-amber-500/30 bg-amber-500/10",
                              user.role === "pro" && "text-sky-600 border-sky-500/30 bg-sky-500/10",
                              user.role === "basic" && "text-blue-600 border-blue-500/30 bg-blue-500/10",
                              user.role === "owner" && "text-emerald-600 border-emerald-500/30 bg-emerald-500/10",
                              user.role === "freetrial" && "text-muted-foreground"
                            )}
                          >
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {!user.is_active ? (
                            <Badge variant="destructive" className="text-[10px]">
                              Banned
                            </Badge>
                          ) : isSuspended ? (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30 bg-amber-500/10">
                              Suspended
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                              Aktif
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-foreground">
                          Rp {(user.balance ?? 0).toLocaleString("id-ID")}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {user.connected_accounts ?? 0}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {user.order_count ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Link href={`/admin/users?search=${encodeURIComponent(user.email)}`}>
                              Kelola
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <div>
              Menampilkan {paginatedUsers.length} dari {totalUsersInFilter} pengguna terfilter (Total direktori: {userListData?.total ?? 0})
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-8 px-2.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Sebelumnya
              </Button>
              <span className="px-2 font-medium text-foreground">
                Halaman {currentPage} dari {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 px-2.5 text-xs"
              >
                Selanjutnya
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
