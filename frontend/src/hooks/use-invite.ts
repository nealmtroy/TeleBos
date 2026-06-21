"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface SourceGroupItem {
  type: string; // username, link, group_id
  value: string;
}

export interface InviteJob {
  id: string;
  account_ids: string[];
  user_id: string;
  destination_group: string;
  destination_type: string;
  source_groups: SourceGroupItem[];
  status: string;
  total_members: number;
  invited_count: number;
  already_member_count: number;
  fail_count: number;
  skip_count: number;
  progress: number;
  delay_per_invite: number;
  delay_per_batch: number;
  batch_size: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface InviteLog {
  id: string;
  job_id: string;
  account_id_used?: string;
  user_id_tg: number;
  username: string | null;
  first_name: string | null;
  source_group: string;
  status: string;
  error_type: string | null;
  error_message: string | null;
  invited_at: string;
}

// ── Invite Jobs ─────────────────────────────────────────────────────────────

export function useInviteJobs() {
  return useQuery<InviteJob[]>({
    queryKey: ["invite-jobs"],
    queryFn: async () => {
      const { data } = await api.get("/invite/history");
      return data;
    },
  });
}

export function useInviteJob(jobId: string) {
  return useQuery<InviteJob>({
    queryKey: ["invite-jobs", jobId],
    queryFn: async () => {
      const { data } = await api.get(`/invite/${jobId}`);
      return data;
    },
    enabled: !!jobId,
  });
}

export function useStartInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      account_ids: string[];
      destination_group: string;
      destination_type: string;
      source_groups: SourceGroupItem[];
      delay_per_invite: number;
      delay_per_batch: number;
      batch_size: number;
    }) => {
      const { data } = await api.post("/invite/start", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-jobs"] });
    },
  });
}

export function useInviteAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      action,
    }: {
      jobId: string;
      action: "pause" | "resume" | "stop";
    }) => {
      const { data } = await api.post(`/invite/${jobId}/${action}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-jobs"] });
    },
  });
}

export function useDeleteInviteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/invite/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-jobs"] });
    },
  });
}

export function useRetryInviteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/invite/${jobId}/retry`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-jobs"] });
    },
  });
}

// ── Invite Logs ─────────────────────────────────────────────────────────────

export function useInviteLogs(
  jobId: string,
  filters?: Record<string, string>
) {
  return useQuery<InviteLog[]>({
    queryKey: ["invite-logs", jobId, filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters || {});
      const { data } = await api.get(`/invite/${jobId}/logs?${params}`);
      return data;
    },
    enabled: !!jobId,
  });
}
