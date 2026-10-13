"use client";

import {
  ClipboardList,
  ShoppingCart,
  User,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Search,
  X,
  ArrowUpDown,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { DateRange } from "react-day-picker";
import { HistoryTab, OrderMetrics } from "./types";

interface OrderFilterToolbarProps {
  activeTab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
  metrics: OrderMetrics;
  search: string;
  onSearchChange: (search: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  sortBy: "date" | "status" | "price";
  sortOrder: "asc" | "desc";
  onToggleSort: (field: "date" | "status" | "price") => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  locale: string;
}

export function OrderFilterToolbar({
  activeTab,
  onTabChange,
  metrics,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  dateRange,
  onDateRangeChange,
  sortBy,
  sortOrder,
  onToggleSort,
  hasActiveFilters,
  onResetFilters,
  locale,
}: OrderFilterToolbarProps) {
  return (
    <div className="space-y-4">
      {/* ── Segmented Navigation Ribbon (Machined Hardware Tabs) ─ */}
      <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="overflow-x-auto no-scrollbar py-0.5 max-w-full">
          <Tabs value={activeTab} onValueChange={(val) => onTabChange(val as HistoryTab)}>
            <TabsList className="h-auto rounded-xl bg-slate-100 dark:bg-slate-950/80 p-1 border border-slate-200/90 dark:border-slate-800 shadow-2xs shrink-0 whitespace-nowrap gap-1">
              <TabsTrigger
                value="all"
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>{locale === "id" ? "Semua Order" : "All Orders"}</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-inherit bg-black/10 dark:bg-white/10">
                  {metrics.totalOrders}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="smm"
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>{locale === "id" ? "Layanan SMM" : "SMM"}</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-inherit bg-black/10 dark:bg-white/10">
                  {metrics.totalSmm}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="accounts"
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <User className="h-3.5 w-3.5" />
                <span>{locale === "id" ? "Akun TG" : "TG Accounts"}</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-inherit bg-black/10 dark:bg-white/10">
                  {metrics.totalAccounts}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="deposits"
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
                <span>Deposit</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-inherit bg-black/10 dark:bg-white/10">
                  {metrics.totalDeposits}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="withdrawals"
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>{locale === "id" ? "Penarikan" : "Withdrawal"}</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-inherit bg-black/10 dark:bg-white/10">
                  {metrics.totalWithdrawals}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="balance"
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <Gift className="h-3.5 w-3.5" />
                <span>{locale === "id" ? "Voucher & Saldo" : "Voucher & Adjust"}</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-inherit bg-black/10 dark:bg-white/10">
                  {metrics.totalBalanceAdj}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Reset Filter Button if active */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onResetFilters}
            className="h-8 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3 w-3" />
            {locale === "id" ? "Reset Filter" : "Clear Filters"}
          </Button>
        )}
      </div>

      {/* ── Precision Command Filter Engine ───────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search Input with Clear Button */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="orders-search"
            name="ordersSearch"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={
              locale === "id"
                ? "Cari ID Order, Layanan, atau Target"
                : "Search Order ID, Service, or Target"
            }
            placeholder={
              locale === "id"
                ? "Cari ID Order / Layanan / Target..."
                : "Search Order ID / Service / Target..."
            }
            className="w-full pl-9 pr-8 py-2 border border-border/90 dark:border-slate-700/80 bg-card dark:bg-slate-900/90 rounded-xl text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 focus:ring-offset-transparent focus:border-primary transition-[border-color,box-shadow] duration-150"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls Group */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5 items-center">
          {/* Status Dropdown */}
          <div className="w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="w-full sm:w-[150px] h-9 text-xs font-semibold rounded-xl bg-card dark:bg-slate-900/90 border-border/90">
                <SelectValue placeholder={locale === "id" ? "Semua Status" : "All Statuses"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {locale === "id" ? "Semua Status" : "All Statuses"}
                </SelectItem>
                <SelectItem value="Selesai">
                  {locale === "id" ? "● Selesai" : "● Completed"}
                </SelectItem>
                <SelectItem value="Proses">
                  {locale === "id" ? "● Proses" : "● Processing"}
                </SelectItem>
                <SelectItem value="Menunggu">
                  {locale === "id" ? "● Menunggu" : "● Pending"}
                </SelectItem>
                <SelectItem value="Dibatalkan">
                  {locale === "id" ? "● Dibatalkan" : "● Cancelled"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Picker Range with Presets */}
          <DatePickerWithRange
            id="orders-date-range"
            className="col-span-2 sm:col-span-1"
            triggerClassName="h-9 rounded-xl border-border/80 bg-card text-xs font-medium shadow-2xs hover:bg-muted"
            presets={true}
            date={dateRange}
            setDate={onDateRangeChange}
          />

          {/* Sort Selector Button */}
          <button
            type="button"
            onClick={() => onToggleSort("date")}
            className="col-span-1 sm:col-span-auto inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-border/80 bg-card text-xs font-semibold text-foreground hover:bg-muted shadow-2xs select-none transition-all"
            title="Sort by Date"
          >
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            <span className="hidden sm:inline">
              {sortBy === "date"
                ? sortOrder === "desc"
                  ? locale === "id"
                    ? "Terbaru"
                    : "Newest"
                  : locale === "id"
                    ? "Terlama"
                    : "Oldest"
                : locale === "id"
                  ? "Urutkan"
                  : "Sort"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
