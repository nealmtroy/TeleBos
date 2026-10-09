import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface WalletTransactionItem {
  id: string;
  user_id: string;
  user_email?: string | null;
  type: "topup" | "withdraw" | "redeem" | "admin_adjustment";
  amount: number;
  total_amount?: number | null;
  method: string;
  note?: string | null;
  status: "pending" | "approved" | "rejected";
  qris_url?: string | null;
  qris_image?: string | null;
  expired_at?: string | null;
  admin_note?: string | null;
  created_at: string;
  processed_at?: string | null;
}

export interface TopupResponse {
  id: string;
  amount: number;
  total_amount?: number;
  method: string;
  note: string;
  status: string;
  qr_string?: string;
  qris_url?: string;
  qris_image?: string;
  created_at: string;
  expires_at: number;
  expired_at?: string;
}

export interface TopupStatusResponse {
  id: string;
  status: string;
  amount: number;
  total_amount: number;
  is_paid: boolean;
  processed_at?: string | null;
}

export interface WalletTransactionListResponse {
  transactions: WalletTransactionItem[];
  total: number;
}

export function useWalletTransactions(params?: {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params?.type && params.type !== "all") queryParams.set("type", params.type);
  if (params?.status && params.status !== "all") queryParams.set("status", params.status);
  if (params?.limit) queryParams.set("limit", String(params.limit));
  if (params?.offset) queryParams.set("offset", String(params.offset));

  return useQuery<WalletTransactionListResponse>({
    queryKey: ["wallet", "transactions", params],
    queryFn: async () => {
      const url = `/wallet/transactions${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const { data } = await api.get(url);
      return data;
    },
    staleTime: 10_000,
  });
}

export function useRequestTopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { amount: number; method?: string; note?: string }) => {
      const { data } = await api.post("/wallet/topup", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRequestWithdraw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { amount: number; method: string; note: string }) => {
      const { data } = await api.post("/wallet/withdraw", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAdminWalletTransactions(params?: {
  type?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params?.type && params.type !== "all") queryParams.set("type", params.type);
  if (params?.status && params.status !== "all") queryParams.set("status", params.status);
  if (params?.search) queryParams.set("search", params.search);
  if (params?.limit) queryParams.set("limit", String(params.limit));
  if (params?.offset) queryParams.set("offset", String(params.offset));

  return useQuery<WalletTransactionListResponse>({
    queryKey: ["admin", "wallet-transactions", params],
    queryFn: async () => {
      const url = `/admin/transactions${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const { data } = await api.get(url);
      return data;
    },
    staleTime: 10_000,
  });
}

export function useAdminUpdateTransactionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      txId,
      status,
      adminNote,
    }: {
      txId: string;
      status: "approved" | "rejected";
      adminNote?: string;
    }) => {
      const { data } = await api.put(`/admin/transactions/${txId}/status`, {
        status,
        admin_note: adminNote,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["wallet", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useCheckTopupStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string): Promise<TopupStatusResponse> => {
      const { data } = await api.get(`/wallet/topup/${orderId}/status`);
      return data;
    },
    onSuccess: (data) => {
      if (data.is_paid) {
        queryClient.invalidateQueries({ queryKey: ["wallet", "transactions"] });
        queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    },
  });
}

