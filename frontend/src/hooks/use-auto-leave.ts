"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

export interface AccountDialogCountItem {
  account_id: string;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  group_count: number;
  channel_count: number;
  creator_group_count: number;
  creator_channel_count: number;
  error?: string | null;
}

export interface AutoLeaveScanResponse {
  accounts: AccountDialogCountItem[];
  total_groups: number;
  total_channels: number;
}

export interface AutoLeaveJob {
  id: string;
  account_ids: string[];
  user_id: string;
  leave_type: "groups" | "channels" | "both";
  skip_creator: boolean;
  status: "pending" | "running" | "paused" | "completed" | "cancelled" | "failed";
  total_tasks: number;
  success_count: number;
  skipped_count: number;
  fail_count: number;
  progress: number;
  delay_per_chat: number;
  delay_randomized: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  related_job_ids?: string[] | null;
}

export interface AutoLeaveLog {
  id: string;
  job_id: string;
  target: string;
  chat_id: number | null;
  chat_title: string | null;
  chat_username: string | null;
  chat_type: string | null;
  status: "success" | "skipped" | "error";
  error_type: string | null;
  error_message: string | null;
  left_at: string;
  account_id_used: string | null;
  account_name: string | null;
}

export function useAutoLeaveScan() {
  return useMutation<AutoLeaveScanResponse, any, { account_ids: string[] }>({
    mutationFn: async ({ account_ids }) => {
      const { data } = await api.post("/auto-leave/scan", { account_ids });
      return data;
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Gagal memindai grup/channel akun.");
    },
  });
}

export function useAutoLeaveJobs(limit = 20) {
  return useQuery<AutoLeaveJob[]>({
    queryKey: ["auto-leave-jobs", limit],
    queryFn: async () => {
      const { data } = await api.get(`/auto-leave/history?limit=${limit}`);
      return data || [];
    },
  });
}

export function useAutoLeaveJob(jobId: string | null) {
  return useQuery<AutoLeaveJob>({
    queryKey: ["auto-leave-job", jobId],
    queryFn: async () => {
      const { data } = await api.get(`/auto-leave/${jobId}`);
      return data;
    },
    enabled: !!jobId,
  });
}

export function useStartAutoLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      account_ids: string[];
      leave_type: "groups" | "channels" | "both";
      skip_creator: boolean;
      delay_per_chat: number;
      delay_randomized: boolean;
    }) => {
      const { data } = await api.post("/auto-leave/start", payload);
      return data as AutoLeaveJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-leave-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Gagal memulai auto leave.");
    },
  });
}

export function useAutoLeaveAction(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "pause" | "resume" | "stop") => {
      const { data } = await api.post(`/auto-leave/${jobId}/${action}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-leave-job", jobId] });
      queryClient.invalidateQueries({ queryKey: ["auto-leave-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Gagal mengubah status job.");
    },
  });
}

export function useAutoLeaveLogs(jobId: string | null, limit = 200) {
  return useQuery<AutoLeaveLog[]>({
    queryKey: ["auto-leave-logs", jobId, limit],
    queryFn: async () => {
      const { data } = await api.get(`/auto-leave/${jobId}/logs?limit=${limit}`);
      return data || [];
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Poll every 3s while active if websocket drops
      return 3000;
    },
  });
}

export function useDeleteAutoLeaveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/auto-leave/${jobId}`);
      return jobId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-leave-jobs"] });
      toast.success("Riwayat auto leave berhasil dihapus.");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Gagal menghapus riwayat.");
    },
  });
}
