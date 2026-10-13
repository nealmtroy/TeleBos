import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  UnifiedOrder,
  OrderMetrics,
  ActivityPagination,
  HistoryTab,
  StatusType,
} from "@/app/(dashboard)/orders/components/types";

export interface ActivityHistoryParams {
  tab?: HistoryTab;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: "date" | "status" | "price";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  locale?: string;
}

export interface ActivityHistoryResponseData {
  items: Array<{
    id: string;
    order_id_display: string;
    type: "telegram_account" | "smm" | "deposit" | "withdraw" | "redeem" | "admin_adjustment";
    type_name: string;
    service_name: string;
    service_sublabel: string;
    detail: string;
    quantity_display: string;
    quantity_raw: number;
    price_display: string;
    price_raw: number;
    status: StatusType;
    status_raw: string;
    created_at: string;
    date_str: string;
    time_str: string;
    telegram_id?: number | null;
    phone?: string | null;
    smm_order_id?: string | null;
    remains?: number | null;
    start_count?: number | null;
    target_url?: string | null;
    payment_method?: string | null;
    admin_note?: string | null;
  }>;
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
  metrics: {
    total_orders: number;
    total_accounts: number;
    total_smm: number;
    total_deposits: number;
    total_withdrawals: number;
    total_balance_adj: number;
    total_spend: number;
    in_progress_count: number;
    completed_count: number;
    success_rate: string;
  };
}

export interface ActivityHistoryResult {
  items: UnifiedOrder[];
  metrics: OrderMetrics;
  pagination: ActivityPagination;
}

export function useActivityHistory(params: ActivityHistoryParams = {}) {
  const {
    tab = "all",
    search = "",
    status = "all",
    startDate,
    endDate,
    sortBy = "date",
    sortOrder = "desc",
    page = 1,
    pageSize = 10,
    locale = "id",
  } = params;

  return useQuery<ActivityHistoryResult>({
    queryKey: [
      "orders",
      "activity-history",
      { tab, search, status, startDate, endDate, sortBy, sortOrder, page, pageSize, locale },
    ],
    queryFn: async () => {
      const qp = new URLSearchParams();
      if (tab) qp.set("tab", tab);
      if (search.trim()) qp.set("search", search.trim());
      if (status && status !== "all") qp.set("status", status);
      if (startDate) qp.set("start_date", startDate);
      if (endDate) qp.set("end_date", endDate);
      if (sortBy) qp.set("sort_by", sortBy);
      if (sortOrder) qp.set("sort_order", sortOrder);
      qp.set("page", String(page));
      qp.set("page_size", String(pageSize));
      qp.set("locale", locale);

      const resp = await api.get<ActivityHistoryResponseData>(
        `/orders/activity-history?${qp.toString()}`
      );
      const data: ActivityHistoryResponseData = resp.data;

      const items: UnifiedOrder[] = data.items.map((it: ActivityHistoryResponseData["items"][number]) => ({
        id: it.id,
        orderIdDisplay: it.order_id_display,
        type: it.type,
        typeName: it.type_name,
        serviceName: it.service_name,
        serviceSublabel: it.service_sublabel,
        detail: it.detail,
        quantityDisplay: it.quantity_display,
        quantityRaw: it.quantity_raw,
        priceDisplay: it.price_display,
        priceRaw: it.price_raw,
        status: it.status,
        statusRaw: it.status_raw,
        dateRaw: new Date(it.created_at),
        dateStr: it.date_str,
        timeStr: it.time_str,
        telegramId: it.telegram_id,
        phone: it.phone,
        smmOrderId: it.smm_order_id,
        remains: it.remains,
        startCount: it.start_count,
        targetUrl: it.target_url || undefined,
        paymentMethod: it.payment_method || undefined,
        adminNote: it.admin_note || undefined,
        originalItem: it,
      }));

      const metrics: OrderMetrics = {
        totalOrders: data.metrics.total_orders,
        totalAccounts: data.metrics.total_accounts,
        totalSmm: data.metrics.total_smm,
        totalDeposits: data.metrics.total_deposits,
        totalWithdrawals: data.metrics.total_withdrawals,
        totalBalanceAdj: data.metrics.total_balance_adj,
        totalSpend: data.metrics.total_spend,
        inProgressCount: data.metrics.in_progress_count,
        completedCount: data.metrics.completed_count,
        successRate: data.metrics.success_rate,
      };

      const pagination: ActivityPagination = {
        page: data.pagination.page,
        pageSize: data.pagination.page_size,
        totalItems: data.pagination.total_items,
        totalPages: data.pagination.total_pages,
      };

      return { items, metrics, pagination };
    },
    staleTime: 30 * 1000,
  });
}
