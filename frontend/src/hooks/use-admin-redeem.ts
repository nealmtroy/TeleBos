import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface RedeemCodeItem {
  id: string;
  code: string;
  code_type: string;
  plan: string | null;
  amount: number | null;
  max_uses: number;
  used_count: number;
  duration_days: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface RedeemCodeListResponse {
  codes: RedeemCodeItem[];
  total: number;
}

export interface RedeemLogItem {
  id: string;
  code_id: string;
  code: string;
  user_id: string;
  user_email: string;
  detail: string | null;
  redeemed_at: string;
}

export interface RedeemLogListResponse {
  logs: RedeemLogItem[];
  total: number;
}

export function useAdminRedeemCodes(
  search?: string,
  page = 1,
  limit = 50
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) params.set("search", search);

  return useQuery<RedeemCodeListResponse>({
    queryKey: ["admin", "redeem-codes", { search, page, limit }],
    queryFn: async () => {
      const { data } = await api.get(`/admin/redeem-codes?${params.toString()}`);
      return data;
    },
  });
}

export function useAdminCreateRedeemCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      code_type: string;
      plan?: string;
      amount?: number;
      max_uses?: number;
      duration_days?: number;
      expires_at?: string;
      code_prefix?: string;
      custom_code?: string;
    }) => {
      const { data } = await api.post("/admin/redeem-codes", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminDeleteRedeemCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (codeId: string) => {
      const { data } = await api.delete(`/admin/redeem-codes/${codeId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
    },
  });
}

export function useAdminRedeemLogs(page = 1, limit = 50) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  return useQuery<RedeemLogListResponse>({
    queryKey: ["admin", "redeem-logs", { page, limit }],
    queryFn: async () => {
      const { data } = await api.get(`/admin/redeem-logs?${params.toString()}`);
      return data;
    },
  });
}
