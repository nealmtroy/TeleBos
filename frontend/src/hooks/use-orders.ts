import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

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

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useTelegramServices() {
  return useQuery<SMMService[]>({
    queryKey: ["smm-services", "telegram"],
    queryFn: async () => {
      const { data } = await api.get("/orders/services");
      return data.services || [];
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useAllServices() {
  return useQuery<SMMService[]>({
    queryKey: ["smm-services", "all"],
    queryFn: async () => {
      const { data } = await api.get("/orders/services/all");
      return data.services || [];
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
