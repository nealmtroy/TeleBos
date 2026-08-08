import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { t } from "@/lib/i18n";
import { type NotificationKind, useNotificationStore } from "@/store/notification-store";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SMMService {
  id: number;
  name: string;
  price: number;
  min: number;
  max: number;
  note: string;
  category: string;
  speed?: string;
}

export interface Order {
  id: string;
  smm_order_id: string | null;
  service_id: number;
  service_name: string;
  category: string;
  data_target: string;
  quantity: number;
  price: number;
  total_price: number;
  status: string;
  start_count: number | null;
  remains: number | null;
  is_mass_order: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderCreatePayload {
  service_id: number;
  data_target: string;
  quantity: number;
  comments?: string;
  usernames?: string;
}

interface MassOrderItem {
  service_id: number;
  data_target: string;
  quantity: number;
  comments?: string;
  usernames?: string;
}

function addOrderNotification(kind: NotificationKind, title: string, message: string, orderId?: string) {
  useNotificationStore.getState().addNotification({
    kind,
    title,
    message,
    href: orderId ? "/orders" : undefined,
  });
}

function getOrderStatusKind(status: string): NotificationKind {
  const normalizedStatus = status.toLowerCase();
  if (["failed", "error", "partial", "canceled", "cancelled"].includes(normalizedStatus)) return "error";
  if (["success", "completed"].includes(normalizedStatus)) return "success";
  if (["processing", "in progress"].includes(normalizedStatus)) return "info";
  return "warning";
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useTelegramServices() {
  return useQuery<SMMService[]>({
    queryKey: ["smm-services", "telegram"],
    queryFn: async () => {
      const { data } = await api.get("/orders/services");
      const svcs = data.services || [];
      return svcs.map((s: any) => ({
        ...s,
        id: Number(s.id),
        price: Number(s.price),
        min: Number(s.min),
        max: Number(s.max),
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useAllServices() {
  return useQuery<SMMService[]>({
    queryKey: ["smm-services", "all"],
    queryFn: async () => {
      const { data } = await api.get("/orders/services/all");
      const svcs = data.services || [];
      return svcs.map((s: any) => ({
        ...s,
        id: Number(s.id),
        price: Number(s.price),
        min: Number(s.min),
        max: Number(s.max),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrderHistory(limit = 50, offset = 0, category?: string) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (category) params.set("category", category);

  return useQuery<Order[]>({
    queryKey: ["orders", "history", { limit, offset, category }],
    queryFn: async () => {
      const { data } = await api.get(`/orders?${params.toString()}`);
      return data;
    },
  });
}

export function useOrderDetail(orderId: string) {
  return useQuery<Order>({
    queryKey: ["orders", orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`);
      return data;
    },
    enabled: !!orderId,
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OrderCreatePayload) => {
      const { data } = await api.post("/orders", payload);
      return data as Order;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      addOrderNotification(
        "success",
        t("orders.notificationCreatedTitle"),
        t("orders.notificationCreatedMessage", { service: order.service_name }),
        order.id
      );
    },
    onError: () => {
      addOrderNotification("error", t("orders.notificationFailedTitle"), t("orders.notificationFailedMessage"));
    },
  });
}

export function usePlaceMassOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orders: MassOrderItem[]) => {
      const { data } = await api.post("/orders/mass", { orders });
      return data as Order[];
    },
    onSuccess: (orders) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      addOrderNotification(
        "success",
        t("orders.notificationMassCreatedTitle"),
        t("orders.notificationMassCreatedMessage", { count: orders.length })
      );
    },
    onError: () => {
      addOrderNotification("error", t("orders.notificationFailedTitle"), t("orders.notificationFailedMessage"));
    },
  });
}

export function useRefreshOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post(`/orders/${orderId}/refresh`);
      return data as Order;
    },
    onMutate: (orderId) => {
      const cachedOrders = queryClient.getQueriesData<Order[]>({ queryKey: ["orders", "history"] });
      const previousOrder = cachedOrders
        .flatMap(([, orders]) => orders ?? [])
        .find((order) => order.id === orderId);
      return { previousStatus: previousOrder?.status };
    },
    onSuccess: (order, _orderId, context) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      if (context?.previousStatus && context.previousStatus !== order.status) {
        addOrderNotification(
          getOrderStatusKind(order.status),
          t("orders.notificationStatusChangedTitle"),
          t("orders.notificationStatusChangedMessage", {
            service: order.service_name,
            status: order.status,
          }),
          order.id
        );
      }
    },
    onError: () => {
      addOrderNotification("error", t("orders.notificationRefreshFailedTitle"), t("orders.notificationRefreshFailedMessage"));
    },
  });
}

export function useRefreshAllOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/orders/refresh-all");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
