"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT, useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useActivityHistory } from "@/hooks/use-activity-history";
import { AlertCircle, Wallet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { DateRange } from "react-day-picker";
import { DataPagination } from "@/components/ui/pagination";
import {
  HistoryTab,
  UnifiedOrder,
  OrderMetrics,
  ITEMS_PER_PAGE,
} from "./components/types";
import { OrderKpiDeck } from "./components/order-kpi-deck";
import { OrderFilterToolbar } from "./components/order-filter-toolbar";
import { OrderDesktopTable } from "./components/order-desktop-table";
import { OrderMobileDeck } from "./components/order-mobile-deck";
import { OrderEmptyState } from "./components/order-empty-state";
import { OrderDetailDialog } from "./components/order-detail-dialog";

const DEFAULT_METRICS: OrderMetrics = {
  totalOrders: 0,
  totalAccounts: 0,
  totalSmm: 0,
  totalDeposits: 0,
  totalWithdrawals: 0,
  totalBalanceAdj: 0,
  totalSpend: 0,
  inProgressCount: 0,
  completedCount: 0,
  successRate: "100.0",
};

function OrderHistoryContent() {
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const orderIdParam = searchParams.get("order_id") || searchParams.get("id");
  const searchParam = searchParams.get("search");

  const [activeTab, setActiveTab] = useState<HistoryTab>(
    tabParam && ["all", "smm", "accounts", "deposits", "withdrawals", "balance"].includes(tabParam)
      ? (tabParam as HistoryTab)
      : "all"
  );
  const [search, setSearch] = useState(searchParam || "");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"date" | "status" | "price">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<UnifiedOrder | null>(null);

  // Sync tab & search whenever URL params change
  useEffect(() => {
    if (tabParam && ["all", "smm", "accounts", "deposits", "withdrawals", "balance"].includes(tabParam)) {
      setActiveTab(tabParam as HistoryTab);
    }
    if (searchParam) {
      setSearch(searchParam);
    }
  }, [tabParam, searchParam]);

  // Server-side activity history query
  const { data, isLoading, isError } = useActivityHistory({
    tab: activeTab,
    search,
    status: statusFilter,
    startDate: dateRange?.from ? dateRange.from.toISOString() : undefined,
    endDate: dateRange?.to ? dateRange.to.toISOString() : undefined,
    sortBy,
    sortOrder,
    page,
    pageSize: ITEMS_PER_PAGE,
    locale,
  });

  const items = data?.items || [];
  const metrics = data?.metrics || DEFAULT_METRICS;
  const totalPages = data?.pagination?.totalPages || 1;
  const totalItems = data?.pagination?.totalItems || 0;

  // Auto-select and open order detail dialog if requested via URL
  useEffect(() => {
    if (!orderIdParam || items.length === 0) return;
    const cleanId = orderIdParam.trim().toLowerCase();
    const found = items.find((it) => {
      const idMatch = it.id.toLowerCase() === cleanId;
      const displayMatch = it.orderIdDisplay.toLowerCase().includes(cleanId);
      const smmMatch = it.smmOrderId && String(it.smmOrderId).toLowerCase() === cleanId;
      const phoneMatch = it.phone && it.phone.toLowerCase().includes(cleanId);
      const tgMatch = it.telegramId && String(it.telegramId).toLowerCase() === cleanId;
      return idMatch || displayMatch || smmMatch || phoneMatch || tgMatch;
    });

    if (found) {
      setSelectedDetail(found);
    }
  }, [orderIdParam, items]);

  const handleTabChange = (newTab: HistoryTab) => {
    setActiveTab(newTab);
    setPage(1);
  };

  const handleCopy = useCallback(
    (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
      toast({
        variant: "success",
        title: locale === "id" ? "Disalin ke Clipboard" : "Copied to Clipboard",
        description: text,
      });
    },
    [locale, toast]
  );

  const toggleSort = (field: "date" | "status" | "price") => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    dateRange?.from !== undefined;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateRange(undefined);
    setPage(1);
  };

  const balance = user?.balance ?? 0;

  return (
    <div className="space-y-6 pb-12">
      {/* ── 1. Executive Terminal Header ────────────────────────── */}
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {_("orders.history") || (locale === "id" ? "Riwayat Pesanan" : "Order History")}
            </h1>
            <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              {metrics.totalOrders} {locale === "id" ? "Total Entri" : "Total Entries"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {locale === "id"
              ? "Pantau status dan catatan transaksi seluruh layanan Anda secara real-time."
              : "Monitor status and transaction records for all your services in real-time."}
          </p>
        </div>

        {/* Right Header Toolbar: Balance Card & Sync Action */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-auto">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2 shadow-none">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {_("orders.yourBalance") || (locale === "id" ? "Saldo Anda" : "Balance")}
              </p>
              <p className="text-sm font-bold tabular-nums text-foreground tracking-tight">
                Rp {balance.toLocaleString()}
              </p>
            </div>
            <Link href="/wallet" className="ml-1">
              <Button
                variant="outline"
                size="xs"
                className="h-7 rounded-lg text-[11px] font-semibold gap-1 px-2 border-border/80 hover:bg-muted"
              >
                <Plus className="h-3 w-3" />
                Top Up
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── 2. Executive KPI Bento Deck (4 Precision Cards) ──────── */}
      <OrderKpiDeck metrics={metrics} locale={locale} />

      {/* ── 3 & 4. Filter Toolbar & Navigation Ribbon ───────────── */}
      <OrderFilterToolbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        metrics={metrics}
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(val) => {
          setStatusFilter(val);
          setPage(1);
        }}
        dateRange={dateRange}
        onDateRangeChange={(range) => {
          setDateRange(range);
          setPage(1);
        }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onToggleSort={toggleSort}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        locale={locale}
      />

      {/* ── 5. Main Content Area (Desktop Grid & Mobile Deck) ───── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl border border-border/60 bg-card/60 animate-pulse shadow-2xs"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold">
              {locale === "id"
                ? "Gagal memuat riwayat pesanan"
                : "Failed to load order history"}
            </p>
            <p className="text-[11px] opacity-80">
              {locale === "id"
                ? "Silakan periksa koneksi backend atau coba refresh kembali."
                : "Please verify backend connectivity or trigger a fresh reload."}
            </p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <OrderEmptyState
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          locale={locale}
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Precision Table */}
          <OrderDesktopTable
            items={items}
            copiedId={copiedId}
            onCopy={handleCopy}
            onSelectDetail={setSelectedDetail}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            locale={locale}
          />

          {/* Mobile Card Deck */}
          <OrderMobileDeck
            items={items}
            copiedId={copiedId}
            onCopy={handleCopy}
            onSelectDetail={setSelectedDetail}
            locale={locale}
          />

          {/* ── 6. Pagination Bar ───────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-3 sm:px-6 shadow-2xs">
              <p className="text-xs text-muted-foreground">
                {locale === "id" ? "Menampilkan" : "Showing"}{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {(page - 1) * ITEMS_PER_PAGE + 1}
                </span>{" "}
                –{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {Math.min(page * ITEMS_PER_PAGE, totalItems)}
                </span>{" "}
                {locale === "id" ? "dari" : "of"}{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {totalItems}
                </span>{" "}
                {locale === "id" ? "pesanan" : "orders"}
              </p>

              <DataPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                labels={{
                  prev: locale === "id" ? "Sebelumnya" : "Prev",
                  next: locale === "id" ? "Berikutnya" : "Next",
                }}
                className="w-auto mx-0"
              />
            </div>
          )}
        </div>
      )}

      {/* ── 7. Order Detail Dialog ────────────────────────────── */}
      <OrderDetailDialog
        item={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        copiedId={copiedId}
        onCopy={handleCopy}
        locale={locale}
      />
    </div>
  );
}

export default function OrderHistoryPage() {
  return (
    <Suspense fallback={null}>
      <OrderHistoryContent />
    </Suspense>
  );
}
