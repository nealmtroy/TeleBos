"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface Account {
  id: string;
  phone: string;
  telegram_id: number | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  bio: string | null;
  profile_photo_path: string | null;
  photo_version: number;
  phone_verified: boolean;
  twofa_enabled: boolean;
  is_active: boolean;
  auto_reply_enabled: boolean;
  auto_reply_text: string | null;
  last_sync_at: string | null;
  created_at: string;
  spam_status: string | null;
  spam_detail: string | null;
  spam_last_checked_at: string | null;
  sell_price: number | null;
}

export interface ApiError {
  response?: {
    data?: { detail?: string };
  };
  message?: string;
}

// ── Photo URL helpers ────────────────────────────────────────────────────────
// Profile photos are public now — no auth token needed.
// Use ?v=version so the URL stays stable → browser caching works.
// When version is 0 (default/unset) we still use a cache-busting t= param
// for safety, but once a photo_version is known the URL is stable.

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export function getPhotoUrl(accountId: string, version?: number) {
  if (version && version > 0) {
    return `${baseUrl}/accounts/${accountId}/photo?v=${version}`;
  }
  // No version yet — fall through to legacy cache-bust
  return `${baseUrl}/accounts/${accountId}/photo?t=${Date.now()}`;
}

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data } = await api.get("/accounts");
      return data.accounts || [];
    },
  });
}

export function useAccount(id: string) {
  return useQuery<Account>({
    queryKey: ["accounts", id],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useUploadProfilePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, file }: { accountId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/accounts/${accountId}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", variables.accountId] });
    },
  });
}

export function useDeleteProfilePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      await api.delete(`/accounts/${accountId}/photo`);
    },
    onSuccess: (_, accountId) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", accountId] });
    },
  });
}

export function useUpdateAutoReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      auto_reply_enabled,
      auto_reply_text,
    }: {
      accountId: string;
      auto_reply_enabled: boolean;
      auto_reply_text?: string | null;
    }) => {
      const { data } = await api.put(`/accounts/${accountId}/auto-reply`, {
        auto_reply_enabled,
        auto_reply_text: auto_reply_text || null,
      });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["accounts", variables.accountId],
      });
    },
  });
}

export function useCheckSpam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data } = await api.post(`/accounts/${accountId}/check-spam`);
      return data;
    },
    onSuccess: (_data, accountId) => {
      queryClient.invalidateQueries({
        queryKey: ["accounts", accountId],
      });
      queryClient.invalidateQueries({
        queryKey: ["accounts"],
      });
    },
  });
}
