import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  total_users: number;
  total_broadcast_jobs: number;
  total_invite_jobs: number;
  total_accounts_connected: number;
  total_basic_users: number;
  total_pro_users: number;
  total_premium_users: number;
  total_owner_users: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  balance: number;
  is_active: boolean;
  order_count: number;
  created_at: string | null;
}

interface UserListResponse {
  users: AdminUser[];
  total: number;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/stats");
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminUsers(search?: string, limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) params.set("search", search);

  return useQuery<UserListResponse>({
    queryKey: ["admin", "users", { search, limit, offset }],
    queryFn: async () => {
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      return data;
    },
  });
}

export function useUpdateBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, amount }: { userId: string; amount: number }) => {
      const { data } = await api.post("/admin/users/balance", {
        user_id: userId,
        amount,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data } = await api.put("/admin/users/role", {
        user_id: userId,
        role,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

// ── Telegram ID Prefix Price Management ──────────────────────────────────────

export interface TelegramIdPrefixPrice {
  id: string;
  id_prefix: string;
  sell_price: number;
  note: string | null;
}

export function usePrefixPrices() {
  return useQuery<TelegramIdPrefixPrice[]>({
    queryKey: ["admin", "prefix-prices"],
    queryFn: async () => {
      const { data } = await api.get("/admin/account-prices");
      return data || [];
    },
  });
}

export function useCreatePrefixPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id_prefix: string; sell_price: number; note?: string }) => {
      const { data } = await api.post("/admin/account-prices", payload);
      return data as TelegramIdPrefixPrice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "prefix-prices"] });
    },
  });
}

export function useUpdatePrefixPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id_prefix, sell_price, note }: { id_prefix: string; sell_price: number; note?: string }) => {
      const { data } = await api.put(`/admin/account-prices/${id_prefix}`, { sell_price, note });
      return data as TelegramIdPrefixPrice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "prefix-prices"] });
    },
  });
}

export function useDeletePrefixPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id_prefix: string) => {
      await api.delete(`/admin/account-prices/${id_prefix}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "prefix-prices"] });
    },
  });
}
      queryClient.invalidateQueries({ queryKey: ["admin", "account-prices"] });
    },
  });
}
