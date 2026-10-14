"use client";

import React, { useState } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  BarChart3,
  Users,
  Radio,
  Bot,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Receipt,
  Scale,
  Calendar,
  Copy,
  Check,
  Lock,
  Percent,
  Activity,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  AnalyticsRange,
  useAdminFinancialAnalytics,
  useAdminAnalyticsTimeseries,
  useAdminFinancialTransactionsDirectory,
  AdminFinancialTransactionItem,
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

/**
 * Currency formatter for IDR amounts.
 */
function formatRupiah(val: number | null | undefined): string {
  const num = val ?? 0;
  return `Rp ${num.toLocaleString("id-ID")}`;
}

export default function AdminFinancialAnalyticsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  // Strict Authorization Guard: Only Owner can access financial analytics
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
              "Halaman informasi keuangan dan rekonsiliasi buku besar hanya dapat diakses oleh peran Pemilik (Owner)."}
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

  return <FinancialAnalyticsContent />;
}

function FinancialAnalyticsContent() {
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
  const [txTypeFilter, setTxTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Timeseries chart metric toggle
  const [chartMetric, setChartMetric] = useState<
    "revenue" | "topups" | "balance_consumed" | "subscriptions"
  >("revenue");

  // Transaction details modal state
  const [selectedTx, setSelectedTx] = useState<AdminFinancialTransactionItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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
  } = useAdminFinancialAnalytics(queryParams);

  const {
    data: timeseriesData,
    isLoading: isTimeseriesLoading,
    refetch: refetchTimeseries,
  } = useAdminAnalyticsTimeseries(chartMetric, queryParams);

  const {
    data: tableData,
    isLoading: isTableLoading,
    refetch: refetchTable,
  } = useAdminFinancialTransactionsDirectory({
    search: activeSearch || undefined,
    tx_type: txTypeFilter,
    status: statusFilter,
    page,
    page_size: 15,
  });

  // Handle Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchInput.trim());
    setPage(1);
  };

  // Handle Refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchAnalytics(), refetchTimeseries(), refetchTable()]);
    setIsRefreshing(false);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Destructure sub-models with safe defaults
  const revenue = analyticsData?.revenue;
  const subscriptions = analyticsData?.subscriptions;
  const payments = analyticsData?.payments;
  const balance = analyticsData?.balance;
  const reconciliation = analyticsData?.reconciliation;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Controls ──────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Verified Financial Ledger
            </span>
            <Badge variant="outline" className="text-xs font-normal">
              Audited Platform Margins
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Revenue & Balance Analytics
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Gross & net revenue, MRR/ARR, saldo tersimpan (user liabilities), rekonsiliasi matematis buku besar (double-entry ledger), dan audit transaksi.
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
            disabled={isRefreshing || isAnalyticsFetching}
            className="h-9 px-3 gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4 text-muted-foreground", (isRefreshing || isAnalyticsFetching) && "animate-spin")}
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
        <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold shadow-xs shrink-0">
          <DollarSign className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
          Revenue & Saldo
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <Link href="/admin/analytics/system-health">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Kesehatan Sistem
          </Link>
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

      {/* ── Strict Accounting Invariants Banner ────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-foreground/80 space-y-2">
        <div className="flex items-start gap-2.5">
          <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-2">
              Prinsip Akuntansi Finansial TeleBos: Isolasi Liabilitas & Rekonsiliasi Double-Entry
            </p>
            <p className="text-muted-foreground leading-relaxed">
              1. <strong>Top-Up Saldo adalah Liabilitas Pengguna</strong>: Setoran top-up (QRIS) dicatat sebagai kewajiban simpanan pengguna (unearned customer liability) dan <em>tidak pernah</em> dihitung sebagai revenue hingga dibelanjakan untuk layanan.
              <br />
              2. <strong>Gross vs Net Revenue</strong>: Gross revenue mencerminkan total volume layanan yang terealisasi (Subscription + SMM Order GMV + Marketplace Account GMV). Net revenue adalah pendapatan setelah deduksi langsung biaya pokok penyedia (BuzzerPanel SMM API cost & payout penjual akun marketplace).
              <br />
              3. <strong>Rekonsiliasi Matematis Buku Besar</strong>: Integritas saldo pengguna diaudit terhadap jurnal kredit/debit <code>wallet_ledgers</code> secara berkelanjutan. Tidak ada mutasi saldo atau tindakan finansial yang dapat dieksekusi dari antarmuka analytics ini (read-only guard).
            </p>
          </div>
        </div>
      </div>

      {/* ── Top Deck Primary KPI Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Gross Revenue */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Gross Revenue</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : formatRupiah(revenue?.gross_revenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Net: {formatRupiah(revenue?.net_revenue)}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              Realisasi
            </Badge>
          </CardContent>
        </Card>

        {/* MRR & ARR */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">MRR / ARR</span>
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : formatRupiah(subscriptions?.mrr)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>ARR: {formatRupiah(subscriptions?.arr)}</span>
            <span className="text-[10px] text-muted-foreground/80">
              {subscriptions?.active_paid_subscriptions ?? 0} aktif
            </span>
          </CardContent>
        </Card>

        {/* Stored User Balance Liability */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Saldo User Tersimpan</span>
              <Wallet className="h-4 w-4 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1 text-amber-600 dark:text-amber-400">
              {isAnalyticsLoading ? "..." : formatRupiah(balance?.current_user_balance_liability)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Liabilitas Simpanan</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              Bukan Revenue
            </Badge>
          </CardContent>
        </Card>

        {/* Top-Up vs Saldo Digunakan */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Top-Up Disetujui</span>
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : formatRupiah(balance?.topup_approved_volume)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Terpakai: {formatRupiah(balance?.balance_consumed_burned)}</span>
            <span className="text-[10px] text-muted-foreground/80">Arus Kas Masuk</span>
          </CardContent>
        </Card>

        {/* Payment Reliability */}
        <Card className="border-border/60 hover:border-border transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Payment Success Rate</span>
              <CreditCard className="h-4 w-4 text-sky-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1">
              {isAnalyticsLoading ? "..." : `${payments?.payment_success_rate.toFixed(1)}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{payments?.successful_payments ?? 0} sukses</span>
            <span className="text-[10px] text-destructive">
              {payments?.failed_payments ?? 0} gagal
            </span>
          </CardContent>
        </Card>

        {/* Double-Entry Ledger Reconciliation */}
        <Card className={cn(
          "border-border/60 hover:border-border transition-all",
          reconciliation?.is_reconciled
            ? "border-emerald-500/30 bg-emerald-500/[0.02]"
            : "border-destructive/40 bg-destructive/[0.02]"
        )}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Audit Rekonsiliasi</span>
              {reconciliation?.is_reconciled ? (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              )}
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-1 flex items-center gap-1.5">
              {isAnalyticsLoading ? (
                "..."
              ) : reconciliation?.is_reconciled ? (
                <span className="text-emerald-600 dark:text-emerald-400">Cocok (100%)</span>
              ) : (
                <span className="text-destructive">Selisih Ditemukan</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Selisih: {formatRupiah(reconciliation?.discrepancy)}</span>
            <span className="text-[10px] text-muted-foreground/80">
              {reconciliation?.total_users_checked ?? 0} akun
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ── 4 In-Depth Operational Breakdown Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Revenue Streams & Cost Structure */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-emerald-500" />
                  Aliran Pendapatan & Struktur Beban Pokok
                </CardTitle>
                <CardDescription className="text-xs">
                  Rincian GMV kotor, potongan provider langsung, dan laba bersih platform.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                Margin Realistis
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Paket Langganan</span>
                <span className="text-sm font-bold text-foreground">
                  {formatRupiah(revenue?.subscription_revenue)}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  100% Margin Software
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">GMV Pesanan SMM</span>
                <span className="text-sm font-bold text-foreground">
                  {formatRupiah(revenue?.gross_smm_revenue)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Beban: {formatRupiah(revenue?.estimated_smm_provider_cost)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Margin Bersih SMM</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupiah(revenue?.net_smm_margin)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Spread markup pesanan
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">GMV Marketplace Akun</span>
                <span className="text-sm font-bold text-foreground">
                  {formatRupiah(revenue?.marketplace_gmv)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Payout: {formatRupiah(revenue?.marketplace_seller_payout)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Spread Marketplace</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupiah(revenue?.marketplace_spread_margin)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Komisi perantara akun
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Total Beban Pokok</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {formatRupiah(revenue?.direct_provider_costs)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  BuzzerPanel + Penjual
                </span>
              </div>
            </div>

            {/* Refund & Tax Footnote */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  Pengembalian Dana (Refunds): <strong>{formatRupiah(revenue?.refunded_volume)}</strong> ({revenue?.refund_count ?? 0} transaksi, {revenue?.refund_rate_percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="text-muted-foreground shrink-0">
                Pajak/Fee Eksternal: <strong>{formatRupiah(revenue?.estimated_taxes)}</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Subscription Lifecycle & Retention Dynamics */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  Dinamika Siklus Langganan (SaaS Metrics)
                </CardTitle>
                <CardDescription className="text-xs">
                  Pertumbuhan pelanggan berbayar, churn, ARPU, dan distribusi per tier.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {subscriptions?.active_paid_subscriptions ?? 0} Pelanggan Aktif
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Langganan Baru</span>
                <span className="text-lg font-bold text-foreground block">
                  {subscriptions?.new_subscriptions_in_period ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Perpanjangan</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 block">
                  {subscriptions?.renewals_in_period ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Kedaluwarsa</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400 block">
                  {subscriptions?.expirations_in_period ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Up / Downgrade</span>
                <span className="text-lg font-bold text-foreground block">
                  {subscriptions?.upgrades_in_period ?? 0} / {subscriptions?.downgrades_in_period ?? 0}
                </span>
              </div>
            </div>

            {/* Plan Distribution: Pro vs Premium */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Distribusi Revenue per Plan</span>
                <span className="text-[10px] text-muted-foreground">Yearly Hemat 16,7% (2 Bulan Gratis)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Starter */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-foreground">Paket Starter</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {(subscriptions?.active_users_by_plan?.["starter"] ?? subscriptions?.active_users_by_plan?.["basic"] ?? 0)} aktif
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      1 Akun
                    </Badge>
                  </div>
                  <div className="text-right mt-2">
                    <span className="text-xs font-bold text-foreground block">
                      {formatRupiah(subscriptions?.revenue_by_plan?.["starter"] ?? subscriptions?.revenue_by_plan?.["basic"] ?? 0)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Rp 5.000/bln (Rp 50k/thn)
                    </span>
                  </div>
                </div>

                {/* Pro */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-foreground">Paket Pro</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {(subscriptions?.active_users_by_plan?.["pro"] ?? 0)} aktif
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-normal text-blue-600 dark:text-blue-400">
                      3 Akun
                    </Badge>
                  </div>
                  <div className="text-right mt-2">
                    <span className="text-xs font-bold text-foreground block">
                      {formatRupiah(subscriptions?.revenue_by_plan?.["pro"] ?? 0)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Rp 10.000/bln (Rp 100k/thn)
                    </span>
                  </div>
                </div>

                {/* Business / Premium */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-foreground">Paket Business</span>
                      <span className="text-[10px] text-muted-foreground block">
                        <span>Paket Premium</span> ({(subscriptions?.active_users_by_plan?.["business"] ?? subscriptions?.active_users_by_plan?.["premium"] ?? 0)} aktif)
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                      5 Akun
                    </Badge>
                  </div>
                  <div className="text-right mt-2">
                    <span className="text-xs font-bold text-foreground block">
                      {formatRupiah(subscriptions?.revenue_by_plan?.["business"] ?? subscriptions?.revenue_by_plan?.["premium"] ?? 0)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Rp 20.000/bln (Rp 200k/thn)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ARPU & Churn Methodology Note */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">ARPU: </span>
                <strong className="text-foreground">{formatRupiah(Math.round(subscriptions?.arpu ?? 0))} / user</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Churn Rate: </span>
                <strong className="text-foreground">{subscriptions?.churn_rate_percentage.toFixed(1)}%</strong>
              </div>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Resmi: Starter / Pro / Business
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Payment Gateway Reliability & Diagnostics */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-sky-500" />
                  Keandalan Pembayaran & Gateway Gateway
                </CardTitle>
                <CardDescription className="text-xs">
                  Rasio keberhasilan transaksi pembayaran, pending, kegagalan, dan chargeback.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {payments?.total_payment_transactions ?? 0} Total Transaksi
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* Success Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Payment Success Ratio</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">
                  {payments?.payment_success_rate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                <div
                  className="bg-sky-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, payments?.payment_success_rate ?? 0))}%` }}
                />
                <div
                  className="bg-destructive h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, payments?.payment_failure_rate ?? 0))}%` }}
                />
              </div>
            </div>

            {/* Diagnostic counts */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[11px] text-muted-foreground block">Sukses / Approved</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {payments?.successful_payments ?? 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <span className="text-[11px] text-muted-foreground block">Pending / Menunggu</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                  {payments?.pending_payments ?? 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                <span className="text-[11px] text-muted-foreground block">Gagal / Ditolak</span>
                <span className="text-base font-bold text-destructive">
                  {payments?.failed_payments ?? 0}
                </span>
              </div>
            </div>

            {/* Method Breakdown & Chargebacks */}
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <span className="text-xs font-semibold text-foreground block">Distribusi Metode Pembayaran</span>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(payments?.methods_breakdown || {}).length > 0 ? (
                  Object.entries(payments?.methods_breakdown || {}).map(([method, count]) => (
                    <Badge key={method} variant="secondary" className="text-xs py-1 px-2.5">
                      {method}: <strong className="ml-1 text-foreground">{count}</strong>
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Belum ada transaksi di periode ini.</span>
                )}
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <span>Chargebacks / Dispute: <strong>{payments?.chargebacks_count ?? 0}</strong></span>
                <span>Volume Sengketa: <strong>{formatRupiah(payments?.chargebacks_volume)}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Balance Ledger & Live Mathematical Reconciliation */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-500" />
                  Rekonsiliasi Matematis Buku Besar
                </CardTitle>
                <CardDescription className="text-xs">
                  Audit live antara saldo tertera pengguna dan jurnal debit/kredit double-entry.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  reconciliation?.is_reconciled
                    ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                    : "border-destructive text-destructive"
                )}
              >
                {reconciliation?.is_reconciled ? "Tervalidasi Cocok" : "Selisih Terdeteksi"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* Live Formula Check */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">1. Total Saldo Agregat Tabel Pengguna:</span>
                <strong className="text-foreground">{formatRupiah(reconciliation?.users_total_balance)}</strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">2. Komputasi Jurnal (Total Kredit − Total Debit):</span>
                <strong className="text-foreground">{formatRupiah(reconciliation?.computed_ledger_balance)}</strong>
              </div>
              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Discrepancy / Selisih Matematis:</span>
                <strong className={cn(
                  "font-bold text-sm",
                  reconciliation?.discrepancy === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                )}>
                  {formatRupiah(reconciliation?.discrepancy)}
                </strong>
              </div>
            </div>

            {/* Period Ledger Credit/Debit Activity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[11px] text-muted-foreground block">Inflow Kredit Periode Ini</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupiah(balance?.total_ledger_credits_period)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Top-up, refund, sell</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <span className="text-[11px] text-muted-foreground block">Outflow Debit Periode Ini</span>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                  {formatRupiah(balance?.total_ledger_debits_period)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">SMM, marketplace, sub</span>
              </div>
            </div>

            {/* Reconciliation Metadata */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Diaudit pada: {reconciliation?.reconciliation_timestamp ? new Date(reconciliation.reconciliation_timestamp).toLocaleString("id-ID") : "-"}</span>
              <span>Akun diperiksa: {reconciliation?.total_users_checked ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Historical Timeseries Trend Chart ──────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Tren Finansial & Volume Historis
              </CardTitle>
              <CardDescription className="text-xs">
                Visualisasi dinamika pendapatan, arus kas masuk (top-up), dan konsumsi saldo harian.
              </CardDescription>
            </div>

            {/* Metric Switcher */}
            <div className="inline-flex items-center p-1 bg-muted/70 border border-border/80 rounded-xl">
              {(
                [
                  { id: "revenue", label: "Gross Revenue" },
                  { id: "topups", label: "Top-Up Saldo" },
                  { id: "balance_consumed", label: "Saldo Terpakai" },
                  { id: "subscriptions", label: "Langganan" },
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
            data={timeseriesData?.points || []}
            metricLabel={
              chartMetric === "revenue"
                ? "Gross Revenue"
                : chartMetric === "topups"
                ? "Top-Up Disetujui"
                : chartMetric === "balance_consumed"
                ? "Saldo Dikonsumsi"
                : "Volume Langganan"
            }
            secondaryLabel={chartMetric === "revenue" ? "Net Platform Margin" : undefined}
            color={
              chartMetric === "revenue"
                ? "emerald"
                : chartMetric === "topups"
                ? "blue"
                : chartMetric === "balance_consumed"
                ? "amber"
                : "sky"
            }
            formatValue={(v) => `Rp ${v.toLocaleString("id-ID")}`}
            isLoading={isTimeseriesLoading}
            height={260}
          />
        </CardContent>
      </Card>

      {/* ── Paginated Financial Transactions & Ledger Directory Table ─────────── */}
      <Card className="border-border/60">
        <CardHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-500" />
                Direktori Transaksi & Jurnal Finansial
              </CardTitle>
              <CardDescription className="text-xs">
                Audit trail seluruh transaksi dompet, top-up QRIS, langganan, dan mutasi saldo pengguna.
              </CardDescription>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <form onSubmit={handleSearchSubmit} className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Cari ID, email, referensi..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-lg"
                />
              </form>

              {/* Type Filter */}
              <select
                value={txTypeFilter}
                onChange={(e) => {
                  setTxTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground"
              >
                <option value="all">Semua Jenis</option>
                <option value="topup">Top-up QRIS</option>
                <option value="subscription">Langganan</option>
                <option value="order_smm">Pesanan SMM</option>
                <option value="marketplace_buy">Beli Akun</option>
                <option value="marketplace_sell">Jual Akun</option>
                <option value="withdraw">Penarikan</option>
                <option value="redeem">Redeem Voucher</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground"
              >
                <option value="all">Semua Status</option>
                <option value="approved">Approved / Sukses</option>
                <option value="pending">Pending</option>
                <option value="rejected">Ditolak / Gagal</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground font-medium">
                  <th className="py-3 px-4">Transaction ID & Ref</th>
                  <th className="py-3 px-4">Pengguna</th>
                  <th className="py-3 px-4">Kategori / Tipe</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4">Metode</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isTableLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                      Memuat data transaksi finansial...
                    </td>
                  </tr>
                ) : !tableData?.transactions || tableData.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Tidak ada transaksi finansial yang cocok dengan filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  tableData.transactions.map((tx) => (
                    <tr key={tx.transaction_id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono text-[11px] font-medium text-foreground">
                          {tx.transaction_id.slice(0, 16)}...
                        </div>
                        {tx.reference_id && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            Ref: {tx.reference_id}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{tx.user_email}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          ID: {tx.user_id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] font-normal capitalize">
                          {tx.category_or_type.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={cn(
                            "font-semibold text-xs",
                            tx.entry_type === "CREDIT"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                          )}
                        >
                          {tx.entry_type === "CREDIT" ? "+" : "-"}
                          {formatRupiah(tx.amount)}
                        </span>
                        <div className="text-[10px] text-muted-foreground font-mono uppercase">
                          {tx.entry_type}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                          {tx.payment_method}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            tx.status === "approved" || tx.status === "settled"
                              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                              : tx.status === "pending"
                              ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                              : "border-destructive/40 text-destructive bg-destructive/5"
                          )}
                        >
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTx(tx);
                            setIsDetailOpen(true);
                          }}
                          className="h-7 px-2.5 text-[11px]"
                        >
                          Detail
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {tableData && tableData.total_pages > 1 && (
            <div className="p-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Menampilkan hal <strong>{tableData.page}</strong> dari <strong>{tableData.total_pages}</strong> ({tableData.total} transaksi)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(tableData.total_pages, p + 1))}
                  disabled={page >= tableData.total_pages}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Transaction Detail Modal / Dialog ─────────────────────────────────── */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-500" />
              Detail Audit Transaksi Finansial
            </DialogTitle>
            <DialogDescription className="text-xs">
              Audit trail lengkap dan metadata transaksi dompet TeleBos.
            </DialogDescription>
          </DialogHeader>

          {selectedTx && (
            <div className="space-y-3.5 py-2 text-xs">
              {/* ID Bar */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Transaction ID</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {selectedTx.transaction_id}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyId(selectedTx.transaction_id)}
                  className="h-7 px-2"
                >
                  {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {/* Data Rows */}
              <div className="space-y-2 rounded-xl bg-muted/20 border border-border/40 p-3.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pengguna:</span>
                  <span className="font-medium text-foreground">{selectedTx.user_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kategori Transaksi:</span>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {selectedTx.category_or_type.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Type:</span>
                  <span className="font-mono font-semibold uppercase">{selectedTx.entry_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal:</span>
                  <span className="font-bold text-sm text-foreground">
                    {formatRupiah(selectedTx.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Metode Pembayaran:</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {selectedTx.payment_method}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] capitalize",
                      selectedTx.status === "approved" || selectedTx.status === "settled"
                        ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                        : selectedTx.status === "pending"
                        ? "text-amber-600 dark:text-amber-400 border-amber-500/40"
                        : "text-destructive border-destructive/40"
                    )}
                  >
                    {selectedTx.status}
                  </Badge>
                </div>
                {selectedTx.reference_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Referensi Provider:</span>
                    <span className="font-mono text-[11px] text-foreground">{selectedTx.reference_id}</span>
                  </div>
                )}
                {selectedTx.description && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Keterangan:</span>
                    <span className="text-foreground text-right max-w-[200px]">{selectedTx.description}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-border/40">
                  <span className="text-muted-foreground">Waktu Dibuat:</span>
                  <span className="text-muted-foreground">
                    {new Date(selectedTx.created_at).toLocaleString("id-ID")}
                  </span>
                </div>
                {selectedTx.processed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Waktu Diproses:</span>
                    <span className="text-muted-foreground">
                      {new Date(selectedTx.processed_at).toLocaleString("id-ID")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDetailOpen(false)}
              className="w-full text-xs"
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
