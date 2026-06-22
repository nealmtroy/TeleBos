import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SmmProfile {
  balance: string | null;
  name: string | null;
  sid: string | null;
  currency: string | null;
}

export interface SmmService {
  id: number;
  service_id: number;
  service_name: string;
  category: string;
  original_price: number;
  selling_price: number | null;
  effective_price: number;
  min_qty: number;
  max_qty: number;
  note: string | null;
  speed: string | null;
  is_active: boolean;
  is_visible: boolean;
  markup_percent: number;
  created_at: string | null;
  updated_at: string | null;
}

interface SmmServiceListResponse {
  services: SmmService[];
  total: number;
}

export interface AdminOrder {
  id: string;
  user_id: string;
  user_email: string;
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

interface AdminOrderListResponse {
  orders: AdminOrder[];
  total: number;
}

export interface SmmStats {
  total_services: number;
  active_services: number;
  total_orders: number;
  pending_orders: number;
  total_revenue: number;
  total_users_with_orders: number;
  panel_balance: string | null;
}

export interface SmmSettings {
  global_markup_percent: number;
  account_buy_price?: number;
  account_sell_price?: number;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function useAdminSmmProfile() {
  return useQuery<SmmProfile>({
    queryKey: ["admin", "smm", "profile"],
    queryFn: async () => {
      const { data } = await api.get("/admin/smm/profile");
      return data;
    },
  });
}

// ── Services ──────────────────────────────────────────────────────────────────

export function useAdminSmmServices(opts?: {
  search?: string;
  category?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.search) params.set("search", opts.search);
  if (opts?.category) params.set("category", opts.category);
  if (opts?.is_active !== undefined) params.set("is_active", String(opts.is_active));
  params.set("limit", String(opts?.limit ?? 50));
  params.set("offset", String(opts?.offset ?? 0));

  return useQuery<SmmServiceListResponse>({
    queryKey: ["admin", "smm", "services", opts],
    queryFn: async () => {
      const { data } = await api.get(`/admin/smm/services?${params.toString()}`);
      return data;
    },
  });
}

export function useAdminSyncServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/admin/smm/services/sync");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smm", "services"] });
    },
  });
}

export function useAdminUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serviceId,
      ...updates
    }: {
      serviceId: number;
      is_active?: boolean;
      is_visible?: boolean;
      selling_price?: number | null;
      markup_percent?: number;
    }) => {
      const { data } = await api.put(`/admin/smm/services/${serviceId}`, updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smm", "services"] });
    },
  });
}

export function useAdminBulkUpdateServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: {
      category?: string;
      service_ids?: number[];
      is_active?: boolean;
      is_visible?: boolean;
      markup_percent?: number;
    }) => {
      const { data } = await api.put("/admin/smm/services/bulk/update", updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smm", "services"] });
    },
  });
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function useAdminSmmOrders(opts?: {
  search?: string;
  status?: string;
  service_id?: number;
  user_id?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.search) params.set("search", opts.search);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.service_id) params.set("service_id", String(opts.service_id));
  if (opts?.user_id) params.set("user_id", opts.user_id);
  params.set("limit", String(opts?.limit ?? 50));
  params.set("offset", String(opts?.offset ?? 0));

  return useQuery<AdminOrderListResponse>({
    queryKey: ["admin", "smm", "orders", opts],
    queryFn: async () => {
      const { data } = await api.get(`/admin/smm/orders?${params.toString()}`);
      return data;
    },
  });
}

export function useAdminRefreshOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post(`/admin/smm/orders/${orderId}/refresh`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smm", "orders"] });
    },
  });
}

export function useAdminRefreshAllOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/admin/smm/orders/refresh-all");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smm", "orders"] });
    },
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function useAdminSmmStats() {
  return useQuery<SmmStats>({
    queryKey: ["admin", "smm", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/smm/stats");
      return data;
    },
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function useAdminSmmSettings() {
  return useQuery<SmmSettings>({
    queryKey: ["admin", "smm", "settings"],
    queryFn: async () => {
      const { data } = await api.get("/admin/smm/settings");
      return data;
    },
  });
}

export function useAdminUpdateSmmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      global_markup_percent?: number;
      account_buy_price?: number;
      account_sell_price?: number;
    }) => {
      const { data } = await api.put("/admin/smm/settings", settings);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smm", "settings"] });
    },
  });
}
