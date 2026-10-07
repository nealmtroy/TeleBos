"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useT, useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useOrderHistory, useRefreshAllOrders, useRefreshOrderStatus } from "@/hooks/use-orders";
import { useMarketplaceHistory } from "@/hooks/use-marketplace";
import {
  RefreshCw,
  AlertCircle,
  Wallet,
  ClipboardList,
  ShoppingCart,
  User,
  Search,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter,
  Plus,
  Layers,
  Info,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
import { DateRange } from "react-day-picker";
import { DataPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DoubleBezelShell,
  ButtonInButton,
  MetricReadout,
  PriceTag,
  Chip,
  Eyebrow,
} from "@/components/layout/trade-surface";
import { useBankAccountStore } from "@/store/bank-account-store";
import { useWalletTransactions } from "@/hooks/use-wallet";

type HistoryTab = "all" | "smm" | "accounts" | "deposits" | "withdrawals" | "balance";
type StatusType = "Selesai" | "Proses" | "Menunggu" | "Dibatalkan";

interface UnifiedOrder {
  id: string;
  orderIdDisplay: string;
  type: "telegram_account" | "smm" | "deposit" | "withdraw" | "redeem" | "admin_adjustment";
  typeName: string;
  serviceName: string;
  serviceSublabel: string;
  detail: string;
  quantityDisplay: string;
  quantityRaw: number;
  priceDisplay: string;
  priceRaw: number;
  status: StatusType;
  statusRaw: string;
  progressPercent: number;
  dateRaw: Date;
  dateStr: string;
  timeStr: string;
  smmOrderId?: string | null;
  remains?: number | null;
  startCount?: number | null;
  targetUrl?: string;
  paymentMethod?: string;
  adminNote?: string;
  originalItem: any;
}

const ITEMS_PER_PAGE = 10;

// Status styling configuration according to TeleBos product design system
const STATUS_CONFIG: Record<
  StatusType,
  {
    tone: "positive" | "accent" | "caution" | "negative";
    labelId: string;
    labelEn: string;
    bgBadge: string;
    dotColor: string;
    progressColor: string;
  }
> = {
  Selesai: {
    tone: "positive",
    labelId: "Selesai",
    labelEn: "Completed",
    bgBadge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    dotColor: "bg-emerald-500",
    progressColor: "bg-emerald-500",
  },
  Proses: {
    tone: "accent",
    labelId: "Proses",
    labelEn: "Processing",
    bgBadge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    dotColor: "bg-blue-500",
    progressColor: "bg-blue-500",
  },
  Menunggu: {
    tone: "caution",
    labelId: "Menunggu",
    labelEn: "Pending",
    bgBadge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dotColor: "bg-amber-500",
    progressColor: "bg-amber-400",
  },
  Dibatalkan: {
    tone: "negative",
    labelId: "Dibatalkan",
    labelEn: "Cancelled",
    bgBadge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    dotColor: "bg-rose-500",
    progressColor: "bg-rose-500",
  },
};

// Date helpers for WIB (UTC+7)
const formatWIBDate = (dateString: string, locale: string) => {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

const formatWIBTime = (dateString: string) => {
  const d = new Date(dateString);
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
};

export default function OrderHistoryPage() {
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<HistoryTab>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [page, setPage] = useState(1);

  // Sorting
  const [sortBy, setSortBy] = useState<"date" | "status" | "price">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Inline copy feedback tracking
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Detail Modal State
  const [selectedDetail, setSelectedDetail] = useState<UnifiedOrder | null>(null);

  // Prevent body scroll and close on ESC when detail modal is open
  useEffect(() => {
    if (!selectedDetail) return;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedDetail(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedDetail]);

  // Real backend wallet transactions & local fallback
  const { data: walletData, isLoading: isWalletLoading, refetch: refetchWallet } = useWalletTransactions({ limit: 100 });
  const walletTransactions = useBankAccountStore((s) => s.transactions);
  const hydrateWallet = useBankAccountStore((s) => s.hydrate);

  useEffect(() => {
    hydrateWallet();
  }, [hydrateWallet]);

  const allWalletTxs = useMemo(() => {
    const list: any[] = [];
    if (walletData?.transactions && walletData.transactions.length > 0) {
      list.push(...walletData.transactions);
    }
    const existingIds = new Set(list.map((t) => t.id));
    if (walletTransactions) {
      for (const t of walletTransactions) {
        if (!existingIds.has(t.id)) {
          if (t.userId && user?.id && t.userId !== user.id) continue;
          list.push(t);
        }
      }
    }
    return list;
  }, [walletData?.transactions, walletTransactions, user?.id]);

  // Fetch data from real backend endpoints
  const { data: orders, isLoading: isSmmLoading, error: smmError } = useOrderHistory();
  const { data: logs, isLoading: isLogsLoading, error: logsError } = useMarketplaceHistory();
  const refreshOrder = useRefreshOrderStatus();
  const refreshAll = useRefreshAllOrders();

  // Map and unify SMM orders, account audit transactions, and wallet transactions
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
        } else if (
          order.status === "Failed" ||
          order.status === "Error" ||
          order.status === "Canceled"
        ) {
          progress = 0;
        } else if (order.status === "Processing" || order.status === "In progress") {
          if (order.quantity && order.remains !== null && order.remains !== undefined) {
            const completed = order.quantity - order.remains;
            progress = Math.min(100, Math.max(0, Math.round((completed / order.quantity) * 100)));
          } else {
            progress = 50;
          }
        }

        // Map status to Indonesian localized terms
        let statusLabel: StatusType = "Menunggu";
        if (order.status === "Success") statusLabel = "Selesai";
        else if (order.status === "Processing" || order.status === "In progress") statusLabel = "Proses";
        else if (order.status === "Pending") statusLabel = "Menunggu";
        else if (
          order.status === "Failed" ||
          order.status === "Error" ||
          order.status === "Partial" ||
          order.status === "Canceled"
        )
          statusLabel = "Dibatalkan";

        // Extract unit label based on service name
        let qtyUnit = locale === "id" ? "Layanan" : "Items";
        const nameLower = (order.service_name || "").toLowerCase();
        if (nameLower.includes("reaction")) qtyUnit = locale === "id" ? "Reaksi" : "Reactions";
        else if (nameLower.includes("view")) qtyUnit = locale === "id" ? "Tayangan" : "Views";
        else if (nameLower.includes("member") || nameLower.includes("subscriber"))
          qtyUnit = locale === "id" ? "Anggota" : "Members";
        else if (nameLower.includes("follower"))
          qtyUnit = locale === "id" ? "Pengikut" : "Followers";

        items.push({
          id: order.id,
          orderIdDisplay: displayId,
          type: "smm",
          typeName: "SMM Order",
          serviceName: order.service_name || "SMM Service",
          serviceSublabel: order.category || "General",
          detail: order.data_target || "-",
          targetUrl: order.data_target,
          quantityDisplay: `${order.quantity?.toLocaleString() || 1} ${qtyUnit}`,
          quantityRaw: order.quantity || 1,
          priceDisplay: `Rp ${(order.total_price || 0).toLocaleString()}`,
          priceRaw: order.total_price || 0,
          status: statusLabel,
          statusRaw: order.status,
          progressPercent: progress,
          dateRaw: new Date(order.created_at),
          dateStr: formatWIBDate(order.created_at, locale),
          timeStr: formatWIBTime(order.created_at),
          smmOrderId: order.smm_order_id,
          remains: order.remains,
          startCount: order.start_count,
          originalItem: order,
        });
      }
    }

    // Map Account Transactions
    if (logs) {
      const latestByAccount = new Map<string, (typeof logs)[number]>();
      for (const log of logs) {
        if (!log.account_id) continue;
        const current = latestByAccount.get(log.account_id);
        if (!current || new Date(log.created_at) > new Date(current.created_at)) {
          latestByAccount.set(log.account_id, log);
        }
      }
      const superseded = new Set(
        logs
          .filter(
            (l) => l.account_id && latestByAccount.get(l.account_id)?.id !== l.id,
          )
          .map((l) => l.id),
      );

      for (const log of logs) {
        if (superseded.has(log.id)) continue;
        const displayId = `#TB-${log.id.toString().substring(0, 8).toUpperCase()}`;

        let typeLabel = locale === "id" ? "Pembelian Akun" : "Account Purchase";
        if (log.action === "sell") typeLabel = locale === "id" ? "Penjualan Akun" : "Account Sale";
        else if (log.action === "list_for_sale")
          typeLabel = locale === "id" ? "Pendaftaran Jual" : "Listing for Sale";
        else if (log.action === "cancel_sale")
          typeLabel = locale === "id" ? "Pembatalan Jual" : "Cancelled Listing";

        let statusLabel: StatusType = "Selesai";
        if (log.action === "list_for_sale") statusLabel = "Proses";
        else if (log.action === "cancel_sale") statusLabel = "Dibatalkan";

        let progress = 100;
        if (log.action === "cancel_sale") progress = 0;

        const phoneDisplay = log.phone ? `+${log.phone.replace(/^\+/, "")}` : "-";

        items.push({
          id: log.id,
          orderIdDisplay: displayId,
          type: "telegram_account",
          typeName: locale === "id" ? "Akun Telegram" : "Telegram Account",
          serviceName: typeLabel,
          serviceSublabel: locale === "id" ? "Transaksi Akun" : "Account Trade",
          detail: phoneDisplay,
          targetUrl: phoneDisplay,
          quantityDisplay: locale === "id" ? "1 Akun" : "1 Account",
          quantityRaw: 1,
          priceDisplay: `Rp ${(log.price || 0).toLocaleString()}`,
          priceRaw: log.price || 0,
          status: statusLabel,
          statusRaw: log.action,
          progressPercent: progress,
          dateRaw: new Date(log.created_at),
          dateStr: formatWIBDate(log.created_at, locale),
          timeStr: formatWIBTime(log.created_at),
          originalItem: log,
        });
      }
    }

    // Map Wallet Transactions (Deposit, Withdraw, Redeem, Admin Adjustment)
    if (allWalletTxs && allWalletTxs.length > 0) {
      for (const tx of allWalletTxs) {
        const txUserId = (tx as any).user_id || (tx as any).userId;
        if (txUserId && user?.id && txUserId !== user.id) {
          continue;
        }

        const displayId = `#TRX-${tx.id.replace("wrn_", "").toUpperCase()}`;
        const rawCreatedAt = (tx as any).created_at || (tx as any).createdAt;
        const txDate = rawCreatedAt ? new Date(rawCreatedAt) : new Date();
        const dateStr = formatWIBDate(rawCreatedAt || txDate.toISOString(), locale);
        const timeStr = formatWIBTime(rawCreatedAt || txDate.toISOString());
        const adminNote = (tx as any).admin_note || (tx as any).adminNote;

        if (tx.type === "topup") {
          const isDone = tx.status === "approved";
          const isPending = tx.status === "pending";
          const statusLabel: StatusType = isDone
            ? "Selesai"
            : isPending
            ? "Menunggu"
            : "Dibatalkan";

          items.push({
            id: tx.id,
            orderIdDisplay: displayId,
            type: "deposit",
            typeName: locale === "id" ? "Deposit Saldo" : "Deposit",
            serviceName:
              locale === "id"
                ? `Isi Saldo via ${tx.method || "QRIS"}`
                : `Top Up via ${tx.method || "QRIS"}`,
            serviceSublabel:
              tx.note || (locale === "id" ? "Deposit Saldo Dompet" : "Wallet Balance Deposit"),
            detail: tx.method ? `${tx.method}${tx.note ? ` • ${tx.note}` : ""}` : "QRIS",
            quantityDisplay: "1 Trx",
            quantityRaw: 1,
            priceDisplay: `+Rp ${tx.amount.toLocaleString()}`,
            priceRaw: tx.amount,
            status: statusLabel,
            statusRaw: tx.status,
            progressPercent: isDone ? 100 : isPending ? 50 : 0,
            dateRaw: txDate,
            dateStr,
            timeStr,
            paymentMethod: tx.method,
            adminNote,
            originalItem: tx,
          });
        } else if (tx.type === "withdraw") {
          const isDone = tx.status === "approved";
          const isPending = tx.status === "pending";
          const statusLabel: StatusType = isDone
            ? "Selesai"
            : isPending
            ? "Menunggu"
            : "Dibatalkan";

          items.push({
            id: tx.id,
            orderIdDisplay: displayId,
            type: "withdraw",
            typeName: locale === "id" ? "Penarikan Saldo" : "Withdrawal",
            serviceName:
              locale === "id"
                ? `Penarikan (${tx.method || "Bank/E-Wallet"})`
                : `Withdrawal (${tx.method || "Bank/E-Wallet"})`,
            serviceSublabel:
              tx.note || (locale === "id" ? "Rekening Penarikan" : "Payout Destination"),
            detail: tx.note || tx.method || "-",
            quantityDisplay: "1 Trx",
            quantityRaw: 1,
            priceDisplay: `-Rp ${tx.amount.toLocaleString()}`,
            priceRaw: tx.amount,
            status: statusLabel,
            statusRaw: tx.status,
            progressPercent: isDone ? 100 : isPending ? 50 : 0,
            dateRaw: txDate,
            dateStr,
            timeStr,
            paymentMethod: tx.method,
            adminNote,
            originalItem: tx,
          });
        } else if (tx.type === "redeem") {
          items.push({
            id: tx.id,
            orderIdDisplay: displayId,
            type: "redeem",
            typeName: locale === "id" ? "Redeem Voucher" : "Voucher Redeem",
            serviceName: locale === "id" ? "Klaim Voucher Promo" : "Promo Voucher Claim",
            serviceSublabel: tx.note
              ? `Kode: ${tx.note}`
              : locale === "id"
              ? "Kupon Hadiah TeleBos"
              : "TeleBos Gift Voucher",
            detail: tx.note || "Voucher Redeem",
            quantityDisplay: "1 Kupon",
            quantityRaw: 1,
            priceDisplay: `+Rp ${tx.amount.toLocaleString()}`,
            priceRaw: tx.amount,
            status: "Selesai",
            statusRaw: "approved",
            progressPercent: 100,
            dateRaw: txDate,
            dateStr,
            timeStr,
            paymentMethod: tx.method || "Voucher",
            adminNote,
            originalItem: tx,
          });
        } else if (tx.type === "admin_adjustment") {
          const isCredit = tx.amount >= 0;
          items.push({
            id: tx.id,
            orderIdDisplay: displayId,
            type: "admin_adjustment",
            typeName: locale === "id" ? "Penyesuaian Saldo" : "Balance Adjustment",
            serviceName:
              locale === "id"
                ? isCredit
                  ? "Penambahan Saldo oleh Admin"
                  : "Pengurangan Saldo oleh Admin"
                : isCredit
                ? "Balance Credit by Admin"
                : "Balance Debit by Admin",
            serviceSublabel:
              tx.note ||
              (locale === "id" ? "Penyesuaian oleh Administrator" : "Administrator Adjustment"),
            detail: adminNote || tx.note || "Admin Adjustment",
            quantityDisplay: "1 Trx",
            quantityRaw: 1,
            priceDisplay: `${isCredit ? "+" : "-"}Rp ${Math.abs(tx.amount).toLocaleString()}`,
            priceRaw: tx.amount,
            status: "Selesai",
            statusRaw: "approved",
            progressPercent: 100,
            dateRaw: txDate,
            dateStr,
            timeStr,
            paymentMethod: "Admin System",
            adminNote,
            originalItem: tx,
          });
        }
      }
    }

    return items;
  }, [orders, logs, allWalletTxs, user?.id, locale]);

  // Executive metrics calculations
  const metrics = useMemo(() => {
    const totalOrders = unifiedItems.length;
    const totalAccounts = unifiedItems.filter((i) => i.type === "telegram_account").length;
    const totalSmm = unifiedItems.filter((i) => i.type === "smm").length;
    const totalDeposits = unifiedItems.filter((i) => i.type === "deposit").length;
    const totalWithdrawals = unifiedItems.filter((i) => i.type === "withdraw").length;
    const totalBalanceAdj = unifiedItems.filter(
      (i) => i.type === "redeem" || i.type === "admin_adjustment"
    ).length;
    const totalSpend = unifiedItems.reduce((acc, i) => acc + (i.priceRaw || 0), 0);
    const inProgressCount = unifiedItems.filter(
      (i) => i.status === "Proses" || i.status === "Menunggu"
    ).length;
    const completedCount = unifiedItems.filter((i) => i.status === "Selesai").length;
    const successRate =
      totalOrders > 0 ? ((completedCount / totalOrders) * 100).toFixed(1) : "100.0";

    return {
      totalOrders,
      totalAccounts,
      totalSmm,
      totalDeposits,
      totalWithdrawals,
      totalBalanceAdj,
      totalSpend,
      inProgressCount,
      completedCount,
      successRate,
    };
  }, [unifiedItems]);

  // Tab Filtering
  const tabFilteredItems = useMemo(() => {
    if (activeTab === "smm") {
      return unifiedItems.filter((item) => item.type === "smm");
    }
    if (activeTab === "accounts") {
      return unifiedItems.filter((item) => item.type === "telegram_account");
    }
    if (activeTab === "deposits") {
      return unifiedItems.filter((item) => item.type === "deposit");
    }
    if (activeTab === "withdrawals") {
      return unifiedItems.filter((item) => item.type === "withdraw");
    }
    if (activeTab === "balance") {
      return unifiedItems.filter(
        (item) => item.type === "redeem" || item.type === "admin_adjustment"
      );
    }
    return unifiedItems;
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
          item.serviceSublabel.toLowerCase().includes(q) ||
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
      }
      if (sortBy === "price") {
        return sortOrder === "desc" ? b.priceRaw - a.priceRaw : a.priceRaw - b.priceRaw;
      }
      const statusA = a.status.toLowerCase();
      const statusB = b.status.toLowerCase();
      if (statusA < statusB) return sortOrder === "desc" ? 1 : -1;
      if (statusA > statusB) return sortOrder === "desc" ? -1 : 1;
      return 0;
    });

    return result;
  }, [tabFilteredItems, search, statusFilter, dateRange, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    return filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  }, [filteredItems, page]);

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

  const handleExport = () => {
    const headers = [
      "Order ID",
      "Tipe Order",
      "Layanan",
      "Kategori",
      "Detail Target",
      "Jumlah",
      "Total Biaya",
      "Status",
      "Progress (%)",
      "Tanggal",
      "Waktu (WIB)",
    ];
    const rows = filteredItems.map((item) => [
      item.orderIdDisplay,
      item.typeName,
      `"${item.serviceName.replace(/"/g, '""')}"`,
      `"${item.serviceSublabel.replace(/"/g, '""')}"`,
      `"${item.detail.replace(/"/g, '""')}"`,
      item.quantityDisplay,
      item.priceRaw,
      item.status,
      item.progressPercent,
      item.dateStr,
      item.timeStr,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `telebos_order_history_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      variant: "success",
      title: locale === "id" ? "Export Berhasil" : "Export Completed",
      description:
        locale === "id"
          ? `${filteredItems.length} baris riwayat telah diunduh.`
          : `${filteredItems.length} order history rows downloaded.`,
    });
  };

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

  const isLoading = isSmmLoading || isLogsLoading;
  const isError = smmError || logsError;
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
              ? "Pantau status, progres pengerjaan, dan catatan transaksi seluruh layanan Anda secara real-time."
              : "Monitor status, fulfillment progress, and transaction records for all your services in real-time."}
          </p>
        </div>

        {/* Right Header Toolbar: Balance Card & Sync Action */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-auto">
          {/* Wallet Balance Chip */}
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card/80 px-3.5 py-2 shadow-2xs backdrop-blur-xs">
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

          {/* Quick Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredItems.length === 0}
            className="h-9 rounded-xl border-border/80 bg-card text-xs font-semibold gap-1.5 shadow-2xs hover:bg-muted"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {/* Refresh All Orders */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAll.mutate()}
            disabled={refreshAll.isPending}
            className="h-9 w-9 p-0 rounded-xl border-border/80 bg-card shadow-2xs hover:bg-muted"
            title={locale === "id" ? "Perbarui Status Semua Pesanan" : "Refresh All Orders"}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground",
                refreshAll.isPending && "animate-spin text-primary"
              )}
            />
          </Button>
        </div>
      </div>

      {/* ── 2. Executive KPI Bento Deck (4 Precision Cards) ──────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricReadout
          label={locale === "id" ? "Total Pesanan" : "Total Orders"}
          value={metrics.totalOrders.toLocaleString()}
          subtext={`${metrics.totalSmm} SMM • ${metrics.totalAccounts} ${locale === "id" ? "Akun" : "Accounts"}`}
          icon={<ClipboardList className="h-4 w-4 text-primary" />}
        />
        <MetricReadout
          label={locale === "id" ? "Total Transaksi" : "Total Spend"}
          value={<PriceTag value={metrics.totalSpend} size="lg" />}
          subtext={locale === "id" ? "Volume transaksi tercatat" : "Cumulative order volume"}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricReadout
          label={locale === "id" ? "Sedang Diproses" : "In Progress"}
          value={`${metrics.inProgressCount} ${locale === "id" ? "Pesanan" : "Orders"}`}
          subtext={
            metrics.inProgressCount > 0
              ? locale === "id"
                ? "Pengerjaan aktif & antrean"
                : "Active execution queue"
              : locale === "id"
                ? "Semua antrean rampung"
                : "Queue is all clear"
          }
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          badge={
            metrics.inProgressCount > 0 ? (
              <Chip tone="accent" dot>
                {metrics.inProgressCount} Aktif
              </Chip>
            ) : (
              <Chip tone="positive">{locale === "id" ? "Lancar" : "Clear"}</Chip>
            )
          }
        />
        <MetricReadout
          label={locale === "id" ? "Tingkat Selesai" : "Success Rate"}
          value={`${metrics.successRate}%`}
          subtext={`${metrics.completedCount} ${locale === "id" ? "dari" : "of"} ${metrics.totalOrders} ${locale === "id" ? "selesai" : "delivered"}`}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          badge={
            <Chip tone="positive" dot>
              {locale === "id" ? "Optimal" : "Healthy"}
            </Chip>
          }
        />
      </div>

      {/* ── 3. Segmented Navigation Ribbon (Machined Hardware Tabs) ─ */}
      <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="overflow-x-auto no-scrollbar py-0.5 max-w-full">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-950/80 p-1 border border-slate-200/90 dark:border-slate-800 shadow-2xs shrink-0 whitespace-nowrap">
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs select-none border transition-colors duration-150 font-semibold",
                activeTab === "all"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/30 border-primary"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
            >
              <ClipboardList className={cn("h-3.5 w-3.5", activeTab === "all" ? "text-primary-foreground" : "text-slate-400")} />
              <span>{locale === "id" ? "Semua Order" : "All Orders"}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[10px] border transition-colors duration-150",
                  activeTab === "all"
                    ? "bg-white/20 text-white font-bold border-white/20"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/60"
                )}
              >
                {metrics.totalOrders}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("smm")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs select-none border transition-colors duration-150 font-semibold",
                activeTab === "smm"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/30 border-primary"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
            >
              <ShoppingCart className={cn("h-3.5 w-3.5", activeTab === "smm" ? "text-primary-foreground" : "text-slate-400")} />
              <span>{locale === "id" ? "Layanan SMM" : "SMM"}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[10px] border transition-colors duration-150",
                  activeTab === "smm"
                    ? "bg-white/20 text-white font-bold border-white/20"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/60"
                )}
              >
                {metrics.totalSmm}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("accounts")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs select-none border transition-colors duration-150 font-semibold",
                activeTab === "accounts"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/30 border-primary"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
            >
              <User className={cn("h-3.5 w-3.5", activeTab === "accounts" ? "text-primary-foreground" : "text-slate-400")} />
              <span>{locale === "id" ? "Akun TG" : "TG Accounts"}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[10px] border transition-colors duration-150",
                  activeTab === "accounts"
                    ? "bg-white/20 text-white font-bold border-white/20"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/60"
                )}
              >
                {metrics.totalAccounts}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("deposits")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs select-none border transition-colors duration-150 font-semibold",
                activeTab === "deposits"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/30 border-primary"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
            >
              <ArrowDownLeft className={cn("h-3.5 w-3.5", activeTab === "deposits" ? "text-primary-foreground" : "text-slate-400")} />
              <span>Deposit</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[10px] border transition-colors duration-150",
                  activeTab === "deposits"
                    ? "bg-white/20 text-white font-bold border-white/20"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/60"
                )}
              >
                {metrics.totalDeposits}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("withdrawals")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs select-none border transition-colors duration-150 font-semibold",
                activeTab === "withdrawals"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/30 border-primary"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
            >
              <ArrowUpRight className={cn("h-3.5 w-3.5", activeTab === "withdrawals" ? "text-primary-foreground" : "text-slate-400")} />
              <span>{locale === "id" ? "Penarikan" : "Withdrawal"}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[10px] border transition-colors duration-150",
                  activeTab === "withdrawals"
                    ? "bg-white/20 text-white font-bold border-white/20"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/60"
                )}
              >
                {metrics.totalWithdrawals}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("balance")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs select-none border transition-colors duration-150 font-semibold",
                activeTab === "balance"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/30 border-primary"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
            >
              <Gift className={cn("h-3.5 w-3.5", activeTab === "balance" ? "text-primary-foreground" : "text-slate-400")} />
              <span>{locale === "id" ? "Voucher & Saldo" : "Voucher & Adjust"}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[10px] border transition-colors duration-150",
                  activeTab === "balance"
                    ? "bg-white/20 text-white font-bold border-white/20"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/60"
                )}
              >
                {metrics.totalBalanceAdj}
              </span>
            </button>
          </div>
        </div>

        {/* Reset Filter Button if active */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={resetFilters}
            className="h-8 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3 w-3" />
            {locale === "id" ? "Reset Filter" : "Clear Filters"}
          </Button>
        )}
      </div>

      {/* ── 4. Precision Command Filter Engine ───────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search Input with Monospace Hint */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={
              locale === "id"
                ? "Cari ID Order / Layanan / Target..."
                : "Search Order ID / Service / Target..."
            }
            className="w-full pl-9 pr-8 py-2 border border-border/90 dark:border-slate-700/80 bg-card dark:bg-slate-900/90 rounded-xl text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 focus:ring-offset-transparent focus:border-primary transition-[border-color,box-shadow] duration-150"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
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
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            >
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
            setDate={(range) => {
              setDateRange(range);
              setPage(1);
            }}
          />

          {/* Sort Selector Button */}
          <button
            type="button"
            onClick={() => toggleSort("date")}
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
      ) : filteredItems.length === 0 ? (
        <DoubleBezelShell className="text-center py-12 sm:py-16">
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.04] border border-border/60 mx-auto text-muted-foreground">
              <ShoppingCart className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-foreground">
                {hasActiveFilters
                  ? locale === "id"
                    ? "Tidak ada pesanan yang cocok"
                    : "No matching orders found"
                  : locale === "id"
                    ? "Belum ada riwayat pesanan"
                    : "No order history yet"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {hasActiveFilters
                  ? locale === "id"
                    ? "Coba sesuaikan kata kunci pencarian, status, atau rentang tanggal yang dipilih."
                    : "Try adjusting your search terms, status filters, or selected date range."
                  : locale === "id"
                    ? "Mulai eksplorasi katalog akun Telegram siap pakai atau pesan layanan optimasi SMM."
                    : "Explore ready-stock Telegram accounts or place your first SMM service order."}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="rounded-xl text-xs font-semibold"
              >
                {locale === "id" ? "Reset Semua Filter" : "Reset All Filters"}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <Link href="/orders/buy-accounts">
                  <Button size="sm" className="rounded-xl text-xs font-semibold gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {locale === "id" ? "Beli Akun" : "Buy Accounts"}
                  </Button>
                </Link>
                <Link href="/orders-services">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-semibold gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {locale === "id" ? "Layanan SMM" : "SMM Services"}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </DoubleBezelShell>
      ) : (
        <div className="space-y-4">
          {/* Desktop Precision Table */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <Table className="text-xs table-fixed w-full min-w-[1080px]">
              <TableHeader>
                <TableRow className="border-b border-border/80 bg-muted/40 hover:bg-muted/40">
                  <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[130px]">
                    Order ID
                  </TableHead>
                  <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[110px]">
                    {locale === "id" ? "Tipe" : "Type"}
                  </TableHead>
                  <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[220px]">
                    {locale === "id" ? "Layanan" : "Service"}
                  </TableHead>
                  <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[180px]">
                    Target / Detail
                  </TableHead>
                  <TableHead className="py-3 px-4 text-right font-bold uppercase tracking-wider text-muted-foreground w-[90px]">
                    {locale === "id" ? "Jumlah" : "Qty"}
                  </TableHead>
                  <TableHead
                    className="py-3 px-4 text-right font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground w-[120px]"
                    onClick={() => toggleSort("price")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{locale === "id" ? "Nominal" : "Price"}</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="py-3 px-4 text-center font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground w-[110px]"
                    onClick={() => toggleSort("status")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="py-3 px-4 text-center font-bold uppercase tracking-wider text-muted-foreground w-[100px]">
                    {locale === "id" ? "Progres" : "Progress"}
                  </TableHead>
                  <TableHead
                    className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground w-[120px]"
                    onClick={() => toggleSort("date")}
                  >
                    <div className="flex items-center gap-1">
                      <span>{locale === "id" ? "Waktu" : "Timestamp"}</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="py-3 px-4 text-center font-bold uppercase tracking-wider text-muted-foreground w-[95px]">
                    {locale === "id" ? "Aksi" : "Action"}
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-border/60">
                {paginatedItems.map((item) => {
                  const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.Menunggu;
                  const isCopied = copiedId === item.id;

                  return (
                    <TableRow
                      key={item.id}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      {/* Order ID */}
                      <TableCell className="py-3.5 px-4 font-mono whitespace-nowrap w-[130px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-foreground tracking-tight">
                            {item.orderIdDisplay}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.orderIdDisplay, item.id)}
                            className="text-muted-foreground/60 hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
                            title="Copy Order ID"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </TableCell>

                      {/* Tipe Order Badge */}
                      <TableCell className="py-3.5 px-4 whitespace-nowrap w-[110px]">
                        {item.type === "telegram_account" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            <User className="h-3 w-3" />
                            <span>{locale === "id" ? "Akun TG" : "TG Account"}</span>
                          </span>
                        ) : item.type === "smm" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                            <ShoppingCart className="h-3 w-3" />
                            <span>SMM</span>
                          </span>
                        ) : item.type === "deposit" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <ArrowDownLeft className="h-3 w-3" />
                            <span>Deposit</span>
                          </span>
                        ) : item.type === "withdraw" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            <ArrowUpRight className="h-3 w-3" />
                            <span>{locale === "id" ? "Penarikan" : "Withdraw"}</span>
                          </span>
                        ) : item.type === "redeem" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                            <Gift className="h-3 w-3" />
                            <span>Redeem</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                            <Sparkles className="h-3 w-3" />
                            <span>{locale === "id" ? "Saldo" : "Adjust"}</span>
                          </span>
                        )}
                      </TableCell>

                      {/* Layanan & Kategori */}
                      <TableCell className="py-3.5 px-4 w-[220px]">
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span
                            className="font-bold text-foreground truncate leading-snug"
                            title={item.serviceName}
                          >
                            {item.serviceName}
                          </span>
                          <span
                            className="text-[10px] text-muted-foreground truncate"
                            title={item.serviceSublabel}
                          >
                            {item.serviceSublabel}
                          </span>
                        </div>
                      </TableCell>

                      {/* Detail Target */}
                      <TableCell className="py-3.5 px-4 w-[180px]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <p
                            className="text-[11px] font-mono text-muted-foreground truncate select-all"
                            title={item.detail}
                          >
                            {item.detail}
                          </p>
                          {item.detail !== "-" && (
                            <button
                              type="button"
                              onClick={() => handleCopy(item.detail, `target-${item.id}`)}
                              className="text-muted-foreground/50 hover:text-foreground p-0.5 shrink-0"
                              title="Copy Target"
                            >
                              {copiedId === `target-${item.id}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </TableCell>

                      {/* Jumlah */}
                      <TableCell className="py-3.5 px-4 text-right font-medium text-foreground whitespace-nowrap tabular-nums w-[90px]">
                        {item.quantityDisplay}
                      </TableCell>

                      {/* Nominal / Harga */}
                      <TableCell className="py-3.5 px-4 text-right whitespace-nowrap w-[120px]">
                        {item.type === "deposit" || item.type === "redeem" ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{item.priceDisplay.replace(/^\+/, "")}
                          </span>
                        ) : item.type === "withdraw" ? (
                          <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                            -{item.priceDisplay.replace(/^-/, "")}
                          </span>
                        ) : item.type === "admin_adjustment" ? (
                          <span
                            className={cn(
                              "font-bold tabular-nums",
                              item.priceRaw >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            )}
                          >
                            {item.priceDisplay}
                          </span>
                        ) : (
                          <PriceTag value={item.priceRaw} size="sm" className="font-bold" />
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5 px-4 text-center whitespace-nowrap w-[110px]">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border",
                            statusConf.bgBadge
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              statusConf.dotColor
                            )}
                          />
                          <span>
                            {locale === "id" ? statusConf.labelId : statusConf.labelEn}
                          </span>
                        </span>
                      </TableCell>

                      {/* Progres */}
                      <TableCell className="py-3.5 px-4 w-[100px]">
                        <div className="flex flex-col items-center justify-center gap-1 w-full">
                          <span className="font-mono text-[10px] font-bold text-foreground">
                            {item.progressPercent}%
                          </span>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden border border-border/40">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-300 ease-out",
                                statusConf.progressColor
                              )}
                              style={{ width: `${item.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      {/* Waktu WIB */}
                      <TableCell className="py-3.5 px-4 whitespace-nowrap text-muted-foreground w-[120px]">
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium text-foreground text-[11px]">
                            {item.dateStr}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {item.timeStr}
                          </span>
                        </div>
                      </TableCell>

                      {/* Aksi */}
                      <TableCell className="py-3.5 px-4 text-center whitespace-nowrap w-[95px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setSelectedDetail(item)}
                            className="h-7 px-2.5 rounded-lg border-border/80 text-[11px] font-semibold hover:bg-muted"
                          >
                            Detail
                          </Button>
                          {item.type === "smm" && item.originalItem.smm_order_id && (
                            <button
                              type="button"
                              onClick={() => refreshOrder.mutate(item.id)}
                              disabled={refreshOrder.isPending}
                              className="p-1.5 text-muted-foreground hover:text-primary border border-border/80 rounded-lg hover:bg-muted transition-colors shadow-2xs"
                              title={_("orders.refreshStatus") || "Refresh"}
                            >
                              <RefreshCw
                                className={cn(
                                  "h-3 w-3",
                                  refreshOrder.isPending && "animate-spin text-primary"
                                )}
                              />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card Deck (Doppelrand Architecture) */}
          <div className="lg:hidden space-y-3">
            {paginatedItems.map((item) => {
              const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.Menunggu;
              const isCopied = copiedId === item.id;

              return (
                <DoubleBezelShell key={item.id} className="p-1">
                  <div className="space-y-3">
                    {/* Header Row: ID + Type + Status */}
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-foreground text-xs">
                          {item.orderIdDisplay}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.orderIdDisplay, item.id)}
                          className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded"
                        >
                          {isCopied ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.type === "telegram_account" ? (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            <User className="h-2.5 w-2.5" />
                            <span>Akun</span>
                          </span>
                        ) : item.type === "smm" ? (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                            <ShoppingCart className="h-2.5 w-2.5" />
                            <span>SMM</span>
                          </span>
                        ) : item.type === "deposit" ? (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <ArrowDownLeft className="h-2.5 w-2.5" />
                            <span>Deposit</span>
                          </span>
                        ) : item.type === "withdraw" ? (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            <ArrowUpRight className="h-2.5 w-2.5" />
                            <span>Tarik</span>
                          </span>
                        ) : item.type === "redeem" ? (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                            <Gift className="h-2.5 w-2.5" />
                            <span>Redeem</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                            <Sparkles className="h-2.5 w-2.5" />
                            <span>Saldo</span>
                          </span>
                        )}

                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                            statusConf.bgBadge
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              statusConf.dotColor
                            )}
                          />
                          <span>
                            {locale === "id" ? statusConf.labelId : statusConf.labelEn}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Service & Category */}
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-sm text-foreground leading-snug">
                        {item.serviceName}
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        {item.serviceSublabel}
                      </p>
                    </div>

                    {/* Key-Value Spec Sheet */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                      <div className="space-y-0.5">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          Target / Detail
                        </p>
                        <p className="font-mono text-[11px] text-foreground truncate">
                          {item.detail}
                        </p>
                      </div>

                      <div className="space-y-0.5 text-right">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          {locale === "id" ? "Total Biaya" : "Total Price"}
                        </p>
                        {item.type === "deposit" || item.type === "redeem" ? (
                          <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{item.priceDisplay.replace(/^\+/, "")}
                          </span>
                        ) : item.type === "withdraw" ? (
                          <span className="font-bold text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                            -{item.priceDisplay.replace(/^-/, "")}
                          </span>
                        ) : item.type === "admin_adjustment" ? (
                          <span
                            className={cn(
                              "font-bold text-xs tabular-nums",
                              item.priceRaw >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            )}
                          >
                            {item.priceDisplay}
                          </span>
                        ) : (
                          <PriceTag value={item.priceRaw} size="sm" className="font-bold" />
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          {locale === "id" ? "Jumlah" : "Quantity"}
                        </p>
                        <p className="font-medium text-[11px] text-foreground tabular-nums">
                          {item.quantityDisplay}
                        </p>
                      </div>

                      <div className="space-y-0.5 text-right">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          {locale === "id" ? "Waktu (WIB)" : "Time (WIB)"}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {item.dateStr} • {item.timeStr}
                        </p>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="space-y-1 pt-1 border-t border-border/40">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{locale === "id" ? "Progres Pengiriman" : "Fulfillment Progress"}</span>
                        <span className="font-mono font-bold text-foreground">
                          {item.progressPercent}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden border border-border/40">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500 ease-out",
                            statusConf.progressColor
                          )}
                          style={{ width: `${item.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                      {item.type === "smm" && item.originalItem.smm_order_id && (
                        <button
                          type="button"
                          onClick={() => refreshOrder.mutate(item.id)}
                          disabled={refreshOrder.isPending}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/80 bg-card text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <RefreshCw
                            className={cn(
                              "h-3 w-3",
                              refreshOrder.isPending && "animate-spin text-primary"
                            )}
                          />
                          <span>Refresh</span>
                        </button>
                      )}
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setSelectedDetail(item)}
                        className="h-8 px-3 rounded-lg text-xs font-semibold"
                      >
                        {locale === "id" ? "Lihat Detail" : "View Details"}
                      </Button>
                    </div>
                  </div>
                </DoubleBezelShell>
              );
            })}
          </div>

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
                  {Math.min(page * ITEMS_PER_PAGE, filteredItems.length)}
                </span>{" "}
                {locale === "id" ? "dari" : "of"}{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {filteredItems.length}
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

      {/* ── 7. Order Detail Dialog (Doppelrand Modal Architecture) ─ */}
      {selectedDetail &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setSelectedDetail(null)}
          >
            <div
              className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-gradient-to-b from-foreground/[0.04] via-foreground/[0.01] to-transparent p-1 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-[calc(1rem-2px)] sm:rounded-[calc(1rem)] bg-card text-card-foreground p-5 sm:p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] space-y-5">
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {selectedDetail.orderIdDisplay}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            selectedDetail.orderIdDisplay,
                            `modal-${selectedDetail.id}`
                          )
                        }
                        className="text-muted-foreground/60 hover:text-foreground p-1 rounded hover:bg-muted"
                        title="Copy Order ID"
                      >
                        {copiedId === `modal-${selectedDetail.id}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {locale === "id" ? "Detail Spesifikasi Pesanan" : "Order Specification Details"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDetail(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Hero Banner inside Modal */}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <h3 className="font-bold text-base text-foreground leading-snug">
                        {selectedDetail.serviceName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedDetail.serviceSublabel}
                      </p>
                    </div>
                    {selectedDetail.type === "deposit" || selectedDetail.type === "redeem" ? (
                      <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                        +{selectedDetail.priceDisplay.replace(/^\+/, "")}
                      </span>
                    ) : selectedDetail.type === "withdraw" ? (
                      <span className="font-bold text-lg text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                        -{selectedDetail.priceDisplay.replace(/^-/, "")}
                      </span>
                    ) : selectedDetail.type === "admin_adjustment" ? (
                      <span
                        className={cn(
                          "font-bold text-lg tabular-nums shrink-0",
                          selectedDetail.priceRaw >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {selectedDetail.priceDisplay}
                      </span>
                    ) : (
                      <PriceTag
                        value={selectedDetail.priceRaw}
                        size="lg"
                        className="font-bold shrink-0"
                      />
                    )}
                  </div>

                  {/* Progress Bar inside Hero */}
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">
                        {locale === "id" ? "Status Progres" : "Progress Status"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">
                          {selectedDetail.progressPercent}%
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                            STATUS_CONFIG[selectedDetail.status]?.bgBadge
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              STATUS_CONFIG[selectedDetail.status]?.dotColor
                            )}
                          />
                          <span>
                            {locale === "id"
                              ? STATUS_CONFIG[selectedDetail.status]?.labelId
                              : STATUS_CONFIG[selectedDetail.status]?.labelEn}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/40">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500 ease-out",
                          STATUS_CONFIG[selectedDetail.status]?.progressColor
                        )}
                        style={{ width: `${selectedDetail.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Detailed Spec Grid */}
                <div className="space-y-2.5 text-xs">
                  <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                    <span className="font-semibold text-muted-foreground">
                      {locale === "id" ? "Tipe Transaksi" : "Transaction Type"}
                    </span>
                    <span className="font-bold text-foreground col-span-2">
                      {selectedDetail.typeName}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                    <span className="font-semibold text-muted-foreground">
                      {locale === "id" ? "Target / Akun" : "Target / Account"}
                    </span>
                    <div className="col-span-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-foreground break-all select-all">
                        {selectedDetail.detail}
                      </span>
                      {selectedDetail.detail !== "-" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(selectedDetail.detail, "modal-target")
                          }
                          className="p-1 text-muted-foreground hover:text-foreground shrink-0 rounded hover:bg-muted"
                          title="Copy Target"
                        >
                          {copiedId === "modal-target" ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                    <span className="font-semibold text-muted-foreground">
                      {locale === "id" ? "Kuantitas" : "Quantity"}
                    </span>
                    <span className="font-bold text-foreground col-span-2 tabular-nums">
                      {selectedDetail.quantityDisplay}
                    </span>
                  </div>

                  {selectedDetail.paymentMethod && (
                    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                      <span className="font-semibold text-muted-foreground">
                        {locale === "id" ? "Metode / Kanal" : "Method / Channel"}
                      </span>
                      <span className="font-medium text-foreground col-span-2">
                        {selectedDetail.paymentMethod}
                      </span>
                    </div>
                  )}

                  {selectedDetail.adminNote && (
                    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                      <span className="font-semibold text-muted-foreground">
                        {locale === "id" ? "Catatan Admin" : "Admin Note"}
                      </span>
                      <span className="font-medium text-primary col-span-2">
                        {selectedDetail.adminNote}
                      </span>
                    </div>
                  )}

                  {selectedDetail.smmOrderId && (
                    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                      <span className="font-semibold text-muted-foreground">
                        Provider Order ID
                      </span>
                      <span className="font-mono text-foreground col-span-2">
                        #{selectedDetail.smmOrderId}
                      </span>
                    </div>
                  )}

                  {selectedDetail.remains !== undefined &&
                    selectedDetail.remains !== null && (
                      <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                        <span className="font-semibold text-muted-foreground">
                          {locale === "id" ? "Sisa Antrean" : "Remains"}
                        </span>
                        <span className="font-mono text-foreground col-span-2">
                          {selectedDetail.remains.toLocaleString()}
                        </span>
                      </div>
                    )}

                  <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
                    <span className="font-semibold text-muted-foreground">
                      {locale === "id" ? "Waktu Dibuat" : "Created At"}
                    </span>
                    <span className="font-medium text-foreground col-span-2">
                      {selectedDetail.dateStr} • {selectedDetail.timeStr}
                    </span>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const summary = [
                        `Order ID: ${selectedDetail.orderIdDisplay}`,
                        `Layanan: ${selectedDetail.serviceName}`,
                        `Target: ${selectedDetail.detail}`,
                        `Jumlah: ${selectedDetail.quantityDisplay}`,
                        `Total: ${selectedDetail.priceDisplay}`,
                        `Status: ${selectedDetail.status}`,
                        `Waktu: ${selectedDetail.dateStr} ${selectedDetail.timeStr}`,
                      ].join("\n");
                      handleCopy(summary, "modal-summary");
                    }}
                    className="h-9 rounded-xl text-xs font-semibold gap-1.5 border-border/80"
                  >
                    {copiedId === "modal-summary" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{locale === "id" ? "Salin Ringkasan" : "Copy Summary"}</span>
                  </Button>

                  <Button
                    onClick={() => setSelectedDetail(null)}
                    className="h-9 rounded-xl px-5 text-xs font-semibold"
                  >
                    {locale === "id" ? "Tutup" : "Close"}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
