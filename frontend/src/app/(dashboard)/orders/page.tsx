"use client";

import { useState, useMemo } from "react";
import { useT, useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useOrderHistory, useRefreshAllOrders, useRefreshOrderStatus } from "@/hooks/use-orders";
import { useMarketplaceHistory } from "@/hooks/use-marketplace";
import {
  RefreshCw,
  AlertCircle,
  Wallet,
  ClipboardList,
  History,
  ShoppingCart,
  User,
  Search,
  Calendar,
  Download,
  ArrowUpDown,
  X,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { DateRange } from "react-day-picker";

type HistoryTab = "all" | "accounts" | "smm";

interface UnifiedOrder {
  id: string;
  orderIdDisplay: string;
  type: "telegram_account" | "smm";
  typeName: "Akun Telegram" | "SMM Order";
  serviceName: string;
  serviceSublabel: string;
  detail: string;
  quantityDisplay: string;
  priceDisplay: string;
  priceRaw: number;
  status: "Selesai" | "Proses" | "Menunggu" | "Dibatalkan";
  statusRaw: string;
  progressPercent: number;
  dateRaw: Date;
  dateStr: string;
  timeStr: string;
  originalItem: any;
}

const ITEMS_PER_PAGE = 10;

const STATUS_COLORS: Record<string, string> = {
  Selesai: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Proses: "bg-blue-50 text-blue-700 border-blue-200",
  Menunggu: "bg-amber-50 text-amber-700 border-amber-200",
  Dibatalkan: "bg-rose-50 text-rose-700 border-rose-200",
};

// Date helpers for WIB (UTC+7)
const formatWIBDate = (dateString: string) => {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

const formatWIBTime = (dateString: string) => {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d) + " WIB";
};

export default function OrderHistoryPage() {
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<HistoryTab>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [page, setPage] = useState(1);

  // Sorting
  const [sortBy, setSortBy] = useState<"date" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Detail Modal
  const [selectedDetail, setSelectedDetail] = useState<UnifiedOrder | null>(null);

  // Fetch data
  const { data: orders, isLoading: isSmmLoading, error: smmError } = useOrderHistory();
  const { data: logs, isLoading: isLogsLoading, error: logsError } = useMarketplaceHistory();
  const refreshOrder = useRefreshOrderStatus();
  const refreshAll = useRefreshAllOrders();

  const tabs = [
    { id: "all" as HistoryTab, label: locale === "id" ? "Semua Order" : "All Orders", icon: ClipboardList },
    { id: "accounts" as HistoryTab, label: locale === "id" ? "Order Akun Telegram" : "Telegram Account", icon: User },
    { id: "smm" as HistoryTab, label: locale === "id" ? "Order SMM" : "SMM Order", icon: ShoppingCart },
  ];

  // Map and unify data
  const unifiedItems = useMemo(() => {
    const items: UnifiedOrder[] = [];

    // Map SMM Orders
    if (orders) {
      for (const order of orders) {
        const displayId = `#TB-${order.id.toString().substring(0, 8).toUpperCase()}`;

        // Calculate progress percentage
        let progress = 0;
        if (order.status === "Success") {
          progress = 100;
        } else if (order.status === "Pending") {
          progress = 0;
        } else if (order.status === "Failed" || order.status === "Error") {
          progress = 0;
        } else if (order.status === "Processing" || order.status === "In progress") {
          if (order.quantity && order.remains !== null && order.remains !== undefined) {
            const completed = order.quantity - order.remains;
            progress = Math.min(100, Math.max(0, Math.round((completed / order.quantity) * 100)));
          } else {
            progress = 50;
          }
        }

        // Map status labels to Indonesian localized terms
        let statusLabel: "Selesai" | "Proses" | "Menunggu" | "Dibatalkan" = "Menunggu";
        if (order.status === "Success") statusLabel = "Selesai";
        else if (order.status === "Processing" || order.status === "In progress") statusLabel = "Proses";
        else if (order.status === "Pending") statusLabel = "Menunggu";
        else if (order.status === "Failed" || order.status === "Error" || order.status === "Partial") statusLabel = "Dibatalkan";

        // Extract unit label based on name
        let qtyUnit = locale === "id" ? "Layanan" : "Items";
        const nameLower = order.service_name.toLowerCase();
        if (nameLower.includes("reaction")) qtyUnit = locale === "id" ? "Reaksi" : "Reactions";
        else if (nameLower.includes("view")) qtyUnit = locale === "id" ? "Tayangan" : "Views";
        else if (nameLower.includes("member") || nameLower.includes("subscriber")) qtyUnit = locale === "id" ? "Anggota" : "Members";
        else if (nameLower.includes("follower")) qtyUnit = locale === "id" ? "Pengikut" : "Followers";

        items.push({
          id: order.id,
          orderIdDisplay: displayId,
          type: "smm",
          typeName: "SMM Order",
          serviceName: order.service_name,
          serviceSublabel: order.category,
          detail: `Link/Username: ${order.data_target}`,
          quantityDisplay: `${order.quantity.toLocaleString()} ${qtyUnit}`,
          priceDisplay: `Rp ${order.total_price.toLocaleString()}`,
          priceRaw: order.total_price,
          status: statusLabel,
          statusRaw: order.status,
          progressPercent: progress,
          dateRaw: new Date(order.created_at),
          dateStr: formatWIBDate(order.created_at),
          timeStr: formatWIBTime(order.created_at),
          originalItem: order,
        });
      }
    }

    // Map Account Transactions
    if (logs) {
      for (const log of logs) {
        const displayId = `#TB-${log.id.toString().substring(0, 8).toUpperCase()}`;

        let typeLabel = "Pembelian Akun";
        if (log.action === "sell") typeLabel = "Penjualan Akun";
        else if (log.action === "list_for_sale") typeLabel = "Pendaftaran Jual";
        else if (log.action === "cancel_sale") typeLabel = "Pembatalan Jual";

        let statusLabel: "Selesai" | "Proses" | "Menunggu" | "Dibatalkan" = "Selesai";
        if (log.action === "list_for_sale") statusLabel = "Proses";
        else if (log.action === "cancel_sale") statusLabel = "Dibatalkan";

        let progress = 100;
        if (log.action === "cancel_sale") progress = 0;

        items.push({
          id: log.id,
          orderIdDisplay: displayId,
          type: "telegram_account",
          typeName: "Akun Telegram",
          serviceName: typeLabel,
          serviceSublabel: "Transaksi Akun",
          detail: `Username: @${log.phone ? log.phone.substring(0, 8) : "user"}_owner\nPhone: ${log.phone || "-"}`,
          quantityDisplay: "1 Akun",
          priceDisplay: `Rp ${log.price.toLocaleString()}`,
          priceRaw: log.price,
          status: statusLabel,
          statusRaw: log.action,
          progressPercent: progress,
          dateRaw: new Date(log.created_at),
          dateStr: formatWIBDate(log.created_at),
          timeStr: formatWIBTime(log.created_at),
          originalItem: log,
        });
      }
    }

    return items;
  }, [orders, logs, locale]);

  // Tab Filtering
  const tabFilteredItems = useMemo(() => {
    if (activeTab === "smm") {
      return unifiedItems.filter((item) => item.type === "smm");
    }
    if (activeTab === "accounts") {
      return unifiedItems.filter((item) => item.type === "telegram_account");
    }
    return unifiedItems; // Semua Order
  }, [unifiedItems, activeTab]);

  // Search & Filters & Sorting
  const filteredItems = useMemo(() => {
    let result = [...tabFilteredItems];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.orderIdDisplay.toLowerCase().includes(q) ||
          item.serviceName.toLowerCase().includes(q) ||
          item.detail.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    // Date range filter
    if (dateRange?.from) {
      const start = new Date(dateRange.from);
      start.setHours(0, 0, 0, 0);
      result = result.filter((item) => item.dateRaw >= start);
    }
    if (dateRange?.to) {
      const end = new Date(dateRange.to);
      end.setHours(23, 59, 59, 999);
      result = result.filter((item) => item.dateRaw <= end);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "date") {
        const timeA = a.dateRaw.getTime();
        const timeB = b.dateRaw.getTime();
        return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
      } else {
        const statusA = a.status.toLowerCase();
        const statusB = b.status.toLowerCase();
        if (statusA < statusB) return sortOrder === "desc" ? 1 : -1;
        if (statusA > statusB) return sortOrder === "desc" ? -1 : 1;
        return 0;
      }
    });

    return result;
  }, [tabFilteredItems, search, statusFilter, dateRange, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    return filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  }, [filteredItems, page]);

  // Reset page when filters change
  const handleTabChange = (newTab: HistoryTab) => {
    setActiveTab(newTab);
    setPage(1);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      variant: "success",
      title: locale === "id" ? "Disalin!" : "Copied!",
      description: `${text} ${locale === "id" ? "berhasil disalin ke papan klip." : "copied to clipboard."}`,
    });
  };

  const handleExport = () => {
    const headers = ["Order ID", "Tipe Order", "Layanan", "Detail", "Jumlah", "Harga", "Status", "Progress", "Waktu"];
    const rows = filteredItems.map((item) => [
      item.orderIdDisplay,
      item.typeName,
      item.serviceName,
      item.detail.replace(/\n/g, " | "),
      item.quantityDisplay,
      item.priceDisplay,
      item.status,
      `${item.progressPercent}%`,
      `${item.dateStr} ${item.timeStr}`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `telebos_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: "date" | "status") => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const isLoading = isSmmLoading || isLogsLoading;
  const isError = smmError || logsError;

  return (
    <div className="space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-250 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("orders.history") || "Order History"}</h1>
          <p className="text-gray-550 mt-1 text-sm">
            {locale === "id" ? "Riwayat semua pesanan yang pernah kamu buat." : "History of all orders you have made."}
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl self-start sm:self-auto shadow-sm">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-sm font-bold text-emerald-700 ml-1">Rp {user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tabs Menu (Underline style) */}
      <div className="border-b border-gray-200 w-full">
        <div className="flex gap-6 -mb-px overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                "flex items-center gap-2 pb-3.5 px-1 text-sm font-semibold transition-all border-b-2 whitespace-nowrap focus:outline-none",
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Area */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={locale === "id" ? "Cari ID Order / Layanan / Username..." : "Search Order ID / Service / Username..."}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap gap-2.5 items-center">
          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">{locale === "id" ? "Semua Status" : "All Status"}</option>
            <option value="Selesai">{locale === "id" ? "Selesai" : "Completed"}</option>
            <option value="Proses">{locale === "id" ? "Proses" : "Processing"}</option>
            <option value="Menunggu">{locale === "id" ? "Menunggu" : "Pending"}</option>
            <option value="Dibatalkan">{locale === "id" ? "Dibatalkan" : "Cancelled"}</option>
          </select>

          {/* Date Picker Range */}
          <DatePickerWithRange
            date={dateRange}
            setDate={(range) => {
              setDateRange(range);
              setPage(1);
            }}
          />

          {/* Export */}
          <Button
            variant="outline"
            onClick={handleExport}
            className="rounded-xl border-gray-200 text-xs font-semibold h-9 px-3.5 bg-white hover:bg-gray-50 text-gray-800 flex items-center gap-1.5 shadow-sm"
          >
            <Download className="h-4 w-4" /> Export
          </Button>

          {/* Refresh all */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAll.mutate()}
            disabled={refreshAll.isPending}
            className="rounded-xl border-gray-200 text-xs font-semibold h-9 px-3 bg-white hover:bg-gray-50 text-gray-800"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshAll.isPending && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">Failed to load order history</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <h3 className="font-semibold text-gray-900 text-sm mb-1">{locale === "id" ? "Tidak ada pesanan ditemukan" : "No orders found"}</h3>
          <p className="text-xs text-gray-550">{locale === "id" ? "Coba ganti kata kunci pencarian atau filter Anda." : "Try changing your search query or filters."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop View Table */}
          <div className="hidden lg:block overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/75 text-gray-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Order</th>
                  <th className="py-3.5 px-4 text-center">Tipe Order</th>
                  <th className="py-3.5 px-4">Layanan</th>
                  <th className="py-3.5 px-4">Detail</th>
                  <th className="py-3.5 px-4 text-right">Jumlah</th>
                  <th className="py-3.5 px-4 text-right">Harga</th>
                  <th className="py-3.5 px-4 text-center cursor-pointer select-none hover:bg-gray-100 transition-colors" onClick={() => toggleSort("status")}>
                    <div className="flex items-center justify-center gap-1">
                      Status
                      <ArrowUpDown className="h-3 w-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center">Progress</th>
                  <th className="py-3.5 px-4 cursor-pointer select-none hover:bg-gray-100 transition-colors" onClick={() => toggleSort("date")}>
                    <div className="flex items-center gap-1">
                      Tanggal
                      <ArrowUpDown className="h-3 w-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors bg-white text-gray-800">
                    {/* Order ID */}
                    <td className="py-4 px-4 whitespace-nowrap font-mono text-gray-900">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-bold">{item.orderIdDisplay}</span>
                        <button
                          onClick={() => handleCopy(item.orderIdDisplay)}
                          className="text-gray-400 hover:text-gray-650 transition-colors p-0.5 rounded hover:bg-gray-100"
                          title="Copy Order ID"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>

                    {/* Tipe Order */}
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {item.type === "telegram_account" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-150 rounded-xl">
                          <User className="h-3 w-3" />
                          Akun Telegram
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-150 rounded-xl">
                          <ShoppingCart className="h-3 w-3" />
                          SMM Order
                        </span>
                      )}
                    </td>

                    {/* Layanan */}
                    <td className="py-4 px-4 max-w-[200px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate font-bold text-gray-900" title={item.serviceName}>
                          {item.serviceName}
                        </span>
                        <span className="text-[10px] text-gray-400 truncate" title={item.serviceSublabel}>
                          {item.serviceSublabel}
                        </span>
                      </div>
                    </td>

                    {/* Detail */}
                    <td className="py-4 px-4 max-w-[180px]">
                      <p className="text-[11px] text-gray-600 leading-relaxed font-mono whitespace-pre-line truncate" title={item.detail}>
                        {item.detail}
                      </p>
                    </td>

                    {/* Jumlah */}
                    <td className="py-4 px-4 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {item.quantityDisplay}
                    </td>

                    {/* Harga */}
                    <td className="py-4 px-4 text-right font-extrabold text-gray-900 whitespace-nowrap">
                      {item.priceDisplay}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {item.status === "Selesai" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Selesai
                        </span>
                      )}
                      {item.status === "Proses" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          Proses
                        </span>
                      )}
                      {item.status === "Menunggu" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Menunggu
                        </span>
                      )}
                      {item.status === "Dibatalkan" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Dibatalkan
                        </span>
                      )}
                    </td>

                    {/* Progress */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col items-center justify-center min-w-[70px]">
                        <span className="font-bold text-[10px] text-gray-800 mb-1">{item.progressPercent}%</span>
                        <div className="w-full bg-gray-100 border border-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={cn(
                              "h-1.5 rounded-full transition-all duration-500",
                              item.status === "Selesai" ? "bg-emerald-500" :
                              item.status === "Proses" ? "bg-blue-500" :
                              item.status === "Menunggu" ? "bg-amber-400" : "bg-rose-500"
                            )}
                            style={{ width: `${item.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Date Time */}
                    <td className="py-4 px-4 whitespace-nowrap text-gray-650 font-medium">
                      <div className="flex flex-col">
                        <span>{item.dateStr}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">{item.timeStr}</span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDetail(item)}
                          className="h-8 px-2.5 rounded-lg border-gray-200 text-[11px] font-bold text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Detail
                        </Button>
                        {item.type === "smm" && item.originalItem.smm_order_id && (
                          <button
                            onClick={() => refreshOrder.mutate(item.id)}
                            disabled={refreshOrder.isPending}
                            className="p-1 text-gray-400 hover:text-primary hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors shadow-sm"
                            title={_("orders.refreshStatus")}
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Card List */}
          <div className="lg:hidden space-y-3">
            {paginatedItems.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm text-gray-950">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-gray-900 text-sm">{item.orderIdDisplay}</span>
                    <button
                      onClick={() => handleCopy(item.orderIdDisplay)}
                      className="text-gray-400 hover:text-gray-650 transition-colors p-0.5 rounded"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {item.type === "telegram_account" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-150 rounded-xl">
                      <User className="h-3 w-3" />
                      Akun Telegram
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-150 rounded-xl">
                      <ShoppingCart className="h-3 w-3" />
                      SMM Order
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-sm text-gray-900 leading-snug">{item.serviceName}</p>
                  <p className="text-[10px] text-gray-450">{item.serviceSublabel}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-1.5 border-t border-gray-55">
                  <span className="font-semibold text-gray-500">Detail:</span>
                  <span className="text-gray-800 font-mono text-[11px] text-right truncate" title={item.detail}>{item.detail.replace(/\n/g, " | ")}</span>

                  <span className="font-semibold text-gray-500">Jumlah:</span>
                  <span className="text-gray-850 font-bold text-right">{item.quantityDisplay}</span>

                  <span className="font-semibold text-gray-500">Harga:</span>
                  <span className="text-primary-600 font-bold text-right">{item.priceDisplay}</span>

                  <span className="font-semibold text-gray-500">Status:</span>
                  <span className="text-right">
                    {item.status === "Selesai" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 rounded-full">
                        Selesai
                      </span>
                    )}
                    {item.status === "Proses" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-150 rounded-full">
                        Proses
                      </span>
                    )}
                    {item.status === "Menunggu" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-150 rounded-full">
                        Menunggu
                      </span>
                    )}
                    {item.status === "Dibatalkan" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.2 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-150 rounded-full">
                        Dibatalkan
                      </span>
                    )}
                  </span>

                  <span className="font-semibold text-gray-500">Progress:</span>
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-bold text-[10px] text-gray-800">{item.progressPercent}%</span>
                    <div className="w-16 bg-gray-100 border border-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-500",
                          item.status === "Selesai" ? "bg-emerald-500" :
                          item.status === "Proses" ? "bg-blue-500" :
                          item.status === "Menunggu" ? "bg-amber-400" : "bg-rose-500"
                        )}
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <span className="font-semibold text-gray-500">Waktu (WIB):</span>
                  <span className="text-gray-700 font-medium text-right">{item.dateStr} {item.timeStr}</span>
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-100 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDetail(item)}
                    className="h-8 px-3 rounded-xl border-gray-200 text-xs font-semibold bg-white text-gray-700"
                  >
                    Detail
                  </Button>
                  {item.type === "smm" && item.originalItem.smm_order_id && (
                    <button
                      onClick={() => refreshOrder.mutate(item.id)}
                      disabled={refreshOrder.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-gray-50 border border-gray-200 rounded-xl shadow-sm bg-white"
                    >
                      <RefreshCw className={cn("h-3 w-3", refreshOrder.isPending && "animate-spin")} />
                      Refresh
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Component */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border border-gray-200 bg-white px-4 py-3 rounded-2xl sm:px-6 shadow-sm">
              <div className="flex flex-1 justify-between sm:hidden">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-xl border-gray-200"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-xl border-gray-200"
                >
                  Next
                </Button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-gray-550">
                    {locale === "id" ? "Menampilkan" : "Showing"}{" "}
                    <span className="font-bold text-gray-900">{((page - 1) * ITEMS_PER_PAGE) + 1}</span>{" "}
                    {locale === "id" ? "sampai" : "to"}{" "}
                    <span className="font-bold text-gray-900">{Math.min(page * ITEMS_PER_PAGE, filteredItems.length)}</span>{" "}
                    {locale === "id" ? "dari" : "of"}{" "}
                    <span className="font-bold text-gray-900">{filteredItems.length}</span>{" "}
                    {locale === "id" ? "order" : "orders"}
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm gap-1" aria-label="Pagination">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-xl border-gray-200 px-3"
                    >
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pNum = idx + 1;
                      if (totalPages > 5 && pNum !== 1 && pNum !== totalPages && Math.abs(pNum - page) > 1) {
                        if (pNum === 2 && page > 3) {
                          return <span key={pNum} className="px-2 text-gray-400">...</span>;
                        }
                        if (pNum === totalPages - 1 && page < totalPages - 2) {
                          return <span key={pNum} className="px-2 text-gray-400">...</span>;
                        }
                        return null;
                      }
                      return (
                        <Button
                          key={pNum}
                          variant={page === pNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(pNum)}
                          className={cn(
                            "rounded-xl px-3",
                            page === pNum ? "bg-primary text-white hover:bg-primary/90" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          {pNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-xl border-gray-200 px-3"
                    >
                      Next
                    </Button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedDetail(null)}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl border border-gray-250 w-full max-w-lg p-6 z-10 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-150 pb-3.5 mb-4">
              <div>
                <span className="font-mono text-sm font-bold text-gray-900">{selectedDetail.orderIdDisplay}</span>
                <h3 className="text-base font-bold text-gray-900 mt-1">{selectedDetail.serviceName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-gray-700">
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Tipe Order</span>
                <span className="font-bold text-gray-900 col-span-2">{selectedDetail.typeName}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Kategori</span>
                <span className="font-bold text-gray-900 col-span-2">{selectedDetail.serviceSublabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Detail Target</span>
                <span className="font-mono text-gray-900 col-span-2 whitespace-pre-line leading-relaxed">{selectedDetail.detail}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Jumlah</span>
                <span className="font-bold text-gray-900 col-span-2">{selectedDetail.quantityDisplay}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Harga</span>
                <span className="font-extrabold text-primary-600 col-span-2">{selectedDetail.priceDisplay}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Status</span>
                <span className="col-span-2">
                  <Badge variant="outline" className={cn("px-2 py-0.2 text-[10px] font-bold uppercase tracking-wide bg-white", STATUS_COLORS[selectedDetail.status] || "bg-gray-50 text-gray-700 border-gray-200")}>
                    {selectedDetail.status}
                  </Badge>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-50">
                <span className="font-semibold text-gray-500 col-span-1">Progress</span>
                <span className="font-bold text-gray-900 col-span-2">{selectedDetail.progressPercent}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="font-semibold text-gray-500 col-span-1">Waktu Transaksi</span>
                <span className="font-bold text-gray-900 col-span-2">{selectedDetail.dateStr} pukul {selectedDetail.timeStr}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setSelectedDetail(null)}
                className="rounded-xl px-5 font-bold"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
