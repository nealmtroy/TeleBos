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
  folder_ids: string[];
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
// Even when version is 0 the URL is stable (it only changes on upload/delete),
// so we never need legacy cache-busting with t=Date.now().

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export function getPhotoUrl(accountId: string, version?: number) {
  return `${baseUrl}/accounts/${accountId}/photo?v=${version ?? 0}`;
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

export interface AccountsResponse {
  accounts: Account[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export function useAccountsPaginated(params: {
  page: number;
  limit: number;
  search?: string;
  folder_id?: string | null;
}) {
  return useQuery<AccountsResponse>({
    queryKey: ["accounts", "paginated", params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("page", params.page.toString());
      queryParams.append("limit", params.limit.toString());
      if (params.search) queryParams.append("search", params.search);
      if (params.folder_id) queryParams.append("folder_id", params.folder_id);

      const { data } = await api.get(`/accounts?${queryParams.toString()}`);
      return data;
    },
    placeholderData: (keepPreviousData) => keepPreviousData,
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

import { useEffect } from "react";

/**
 * Hook that listens for real-time profile sync events via WebSocket.
 * When Telegram profile changes are detected by the backend (name, username,
 * phone, photo), this hook auto-invalidates the accounts query cache so the
 * UI refreshes without manual reload.
 */
export function useProfileSync(accountId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accountId) return;

    const { connectChatSocket } = require("@/lib/socket");
    const ws = connectChatSocket(accountId);

    const handler = (data: any) => {
      if (data.type === "profile_sync" && data.account_id === accountId) {
        // Invalidate both the list and the individual account query
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
        queryClient.invalidateQueries({ queryKey: ["accounts", accountId] });
      }
    };

    ws.on("profile_sync", handler);

    return () => {
      ws.off("profile_sync", handler);
    };
  }, [accountId, queryClient]);
}


export interface SpamAppealStartPayload {
  accountId: string;
  reason: string;
  presetId?: string;
  force?: boolean;
}

export interface SpamAppealResumePayload {
  accountId: string;
  reason: string;
}

export interface SpamAppealResponse {
  status: "completed" | "captcha_required" | "already_submitted" | "failed";
  message: string;
  captcha_url?: string;
  generated_reason?: string;
}

export function useStartSpamAppeal() {
  const queryClient = useQueryClient();
  return useMutation<SpamAppealResponse, Error, SpamAppealStartPayload>({
    mutationFn: async ({ accountId, reason, presetId, force = false }) => {
      const { data } = await api.post(`/accounts/${accountId}/appeal/start`, {
        reason,
        preset_id: presetId,
        force,
      });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", variables.accountId] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useResumeSpamAppeal() {
  const queryClient = useQueryClient();
  return useMutation<SpamAppealResponse, Error, SpamAppealResumePayload>({
    mutationFn: async ({ accountId, reason }) => {
      const { data } = await api.post(`/accounts/${accountId}/appeal/resume`, {
        reason,
      });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", variables.accountId] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
