"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

export interface AutoJoinTarget {
  type: string;
  value: string;
}

export interface AutoJoinJob {
  id: string;
  account_ids: string[];
  targets: AutoJoinTarget[];
  distribution_mode: string;
  status: "pending" | "running" | "paused" | "completed" | "cancelled" | "failed";
  total_tasks: number;
  success_count: number;
  already_count: number;
  fail_count: number;
  progress: number;
  delay_per_group: number;
  delay_randomized: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AutoJoinLog {
  id: string;
  job_id: string;
  target: string;
  target_type: string | null;
  chat_id: number | null;
  chat_title: string | null;
  chat_username: string | null;
  chat_type: string | null;
  status: "success" | "already_member" | "error";
  error_type: string | null;
  error_message: string | null;
  joined_at: string;
  account_id_used: string | null;
  account_name: string | null;
}

export function useAutoJoinJobs(limit = 20) {
  return useQuery<AutoJoinJob[]>({
    queryKey: ["auto-join-jobs", limit],
    queryFn: async () => {
      const { data } = await api.get(`/auto-join/history?limit=${limit}`);
      return data || [];
    },
  });
}

export function useAutoJoinJob(jobId: string | null) {
  return useQuery<AutoJoinJob>({
    queryKey: ["auto-join-job", jobId],
    queryFn: async () => {
      const { data } = await api.get(`/auto-join/${jobId}`);
      return data;
    },
    enabled: !!jobId,
  });
}

export function useStartAutoJoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      account_ids: string[];
      targets: AutoJoinTarget[];
      distribution_mode: string;
      delay_per_group: number;
      delay_randomized: boolean;
    }) => {
      const { data } = await api.post("/auto-join/start", payload);
      return data as AutoJoinJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-join-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Gagal memulai auto join.");
    },
  });
}

export function useAutoJoinAction(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "pause" | "resume" | "stop") => {
      const { data } = await api.post(`/auto-join/${jobId}/${action}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-join-job", jobId] });
      queryClient.invalidateQueries({ queryKey: ["auto-join-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Aksi gagal.");
    },
  });
}

export function useAutoJoinLogs(jobId: string | null, limit = 1000) {
  return useQuery<AutoJoinLog[]>({
    queryKey: ["auto-join-logs", jobId, limit],
    queryFn: async () => {
      const { data } = await api.get(`/auto-join/${jobId}/logs?limit=${limit}`);
      return data || [];
    },
    enabled: !!jobId,
    // Re-attaching to a running job (navigating away and back) must show the
    // rows written while away, so always refetch on mount rather than trusting
    // a cached page. The WebSocket only carries entries from the moment it
    // connects, so the persisted list is the only record of earlier attempts.
    refetchOnMount: "always",
  });
}

export function useDeleteAutoJoinJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/auto-join/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-join-jobs"] });
      toast.success("Job dihapus.");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Gagal menghapus job.");
    },
  });
}