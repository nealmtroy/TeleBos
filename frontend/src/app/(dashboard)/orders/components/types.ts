export type HistoryTab = "all" | "smm" | "accounts" | "deposits" | "withdrawals" | "balance";
export type StatusType = "Selesai" | "Proses" | "Menunggu" | "Dibatalkan";

export interface UnifiedOrder {
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
  dateRaw: Date;
  dateStr: string;
  timeStr: string;
  telegramId?: number | string | null;
  phone?: string | null;
  smmOrderId?: string | null;
  remains?: number | null;
  startCount?: number | null;
  targetUrl?: string | null;
  paymentMethod?: string | null;
  adminNote?: string | null;
  originalItem?: any;
}

export interface OrderMetrics {
  totalOrders: number;
  totalAccounts: number;
  totalSmm: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBalanceAdj: number;
  totalSpend: number;
  inProgressCount: number;
  completedCount: number;
  successRate: string;
}

export interface ActivityPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const ITEMS_PER_PAGE = 10;

// Status styling configuration according to TeleBos product design system
export const STATUS_CONFIG: Record<
  StatusType,
  {
    tone: "positive" | "accent" | "caution" | "negative";
    labelId: string;
    labelEn: string;
    bgBadge: string;
    dotColor: string;
  }
> = {
  Selesai: {
    tone: "positive",
    labelId: "Selesai",
    labelEn: "Completed",
    bgBadge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    dotColor: "bg-emerald-500",
  },
  Proses: {
    tone: "accent",
    labelId: "Proses",
    labelEn: "Processing",
    bgBadge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  Menunggu: {
    tone: "caution",
    labelId: "Menunggu",
    labelEn: "Pending",
    bgBadge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dotColor: "bg-amber-500",
  },
  Dibatalkan: {
    tone: "negative",
    labelId: "Dibatalkan",
    labelEn: "Cancelled",
    bgBadge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    dotColor: "bg-rose-500",
  },
};

// Date helpers for WIB (UTC+7)
export const formatWIBDate = (dateString: string | Date, locale: string) => {
  const d = typeof dateString === "string" ? new Date(dateString) : dateString;
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

export const formatWIBTime = (dateString: string | Date) => {
  const d = typeof dateString === "string" ? new Date(dateString) : dateString;
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
};
