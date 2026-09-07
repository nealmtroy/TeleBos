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

  accounts_active: number;
  accounts_selling: number;
  accounts_expired: number;
  accounts_limited?: number;

  broadcast_running: number;
  broadcast_stopped: number;
  broadcast_completed?: number;
  broadcast_failed?: number;

  invite_running: number;
  invite_stopped: number;

  total_auto_reply_jobs: number;
  auto_reply_running: number;
  auto_reply_stopped: number;
  total_auto_reply_sent: number;
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

  // Telegram Account metrics
  connected_accounts?: number;
  active_accounts?: number;
  expired_accounts?: number;
  limited_accounts?: number;

  // Broadcast metrics
  broadcast_running?: number;
  broadcast_finished?: number;
  broadcast_failed?: number;
  broadcast_total?: number;
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

// ── Admin Broadcast Management ───────────────────────────────────────────────

export interface AdminBroadcastAccountInfo {
  id: string;
  telegram_id: number | null;
  phone: string;
  name: string | null;
  username: string | null;
  is_duplicate?: boolean;
  conflicting_job_ids?: string[];
}

export interface AdminBroadcastJob {
  id: string;
  user_id: string;
  user_email: string | null;
  user_full_name: string | null;
  group_list_id: string | null;
  group_list_name: string | null;
  text_list_id: string | null;
  mode: string;
  custom_text: string | null;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  progress: number;
  total_groups: number;
  sent_count: number;
  fail_count: number;
  delay_per_group: number;
  delay_after_all: number;
  loop_enabled: boolean;
  delay_randomized: boolean;
  log_destination: string | null;
  account_count: number;
  accounts: AdminBroadcastAccountInfo[];
  has_duplicate_accounts?: boolean;
  duplicate_account_count?: number;
  duplicate_job_ids?: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AdminBroadcastListResponse {
  jobs: AdminBroadcastJob[];
  total: number;
}

export interface AdminBroadcastStats {
  total_jobs: number;
  running_jobs: number;
  paused_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  cancelled_jobs: number;
  total_sent: number;
  total_failed: number;
  active_looping_jobs: number;
  duplicate_conflict_jobs?: number;
}

export function useAdminBroadcasts(params?: {
  search?: string;
  status?: string;
  loop_enabled?: boolean;
  duplicates_only?: boolean;
  user_id?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  limit?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set("page", String(params.page));
  if (params?.limit) queryParams.set("limit", String(params.limit));
  if (params?.search) queryParams.set("search", params.search);
  if (params?.status && params.status !== "all") queryParams.set("status", params.status);
  if (params?.loop_enabled !== undefined) queryParams.set("loop_enabled", String(params.loop_enabled));
  if (params?.duplicates_only) queryParams.set("duplicates_only", "true");
  if (params?.user_id) queryParams.set("user_id", params.user_id);
  if (params?.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params?.sort_order) queryParams.set("sort_order", params.sort_order);

  return useQuery<AdminBroadcastListResponse>({
    queryKey: ["admin", "broadcasts", params],
    queryFn: async () => {
      const { data } = await api.get(`/admin/broadcasts?${queryParams.toString()}`);
      return data;
    },
  });
}

export function useAdminBroadcastStats() {
  return useQuery<AdminBroadcastStats>({
    queryKey: ["admin", "broadcasts", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/broadcasts/stats");
      return data;
    },
  });
}

export function useAdminPauseBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/admin/broadcasts/${jobId}/pause`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminResumeBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/admin/broadcasts/${jobId}/resume`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminStopBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/admin/broadcasts/${jobId}/stop`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminDeleteBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/admin/broadcasts/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminBulkBroadcastAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { action: string; job_ids?: string[] }) => {
      const { data } = await api.post("/admin/broadcasts/bulk-action", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

// ── Admin Auto-Reply Management ─────────────────────────────────────────────

export interface AdminAutoReplyItem {
  id: string;
  user_id: string;
  user_email: string | null;
  user_full_name: string | null;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  auto_reply_enabled: boolean;
  auto_reply_text: string | null;
  is_active: boolean;
  status: "running" | "stopped" | "disabled";
  total_replied: number;
  last_replied_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminAutoReplyListResponse {
  items: AdminAutoReplyItem[];
  total: number;
  running_count: number;
  stopped_count: number;
  total_sent: number;
}

export function useAdminAutoReplies(params?: {
  search?: string;
  status?: string;
  user_id?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  limit?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set("page", String(params.page));
  if (params?.limit) queryParams.set("limit", String(params.limit));
  if (params?.search) queryParams.set("search", params.search);
  if (params?.status && params.status !== "all") queryParams.set("status", params.status);
  if (params?.user_id) queryParams.set("user_id", params.user_id);
  if (params?.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params?.sort_order) queryParams.set("sort_order", params.sort_order);

  const qs = queryParams.toString();
  return useQuery<AdminAutoReplyListResponse>({
    queryKey: ["admin", "auto-replies", qs],
    queryFn: async () => {
      const { data } = await api.get(`/admin/auto-replies${qs ? `?${qs}` : ""}`);
      return data;
    },
    refetchInterval: 15_000,
  });
}

export function useAdminToggleAutoReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data } = await api.post(`/admin/auto-replies/${accountId}/toggle`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "auto-replies"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}


