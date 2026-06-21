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
