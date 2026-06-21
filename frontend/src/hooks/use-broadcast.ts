"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface GroupListItem {
  type: string; // username, link, group_id
  value: string;
}

export interface GroupList {
  id: string;
  name: string;
  items: GroupListItem[];
  created_at: string;
  updated_at: string;
}

export interface TextList {
  id: string;
  name: string;
  texts: string[];
  created_at: string;
  updated_at: string;
}

export interface BroadcastJob {
  id: string;
  account_ids: string[];
  user_id: string;
  group_list_id: string | null;
  text_list_id: string | null;
  mode: string;
  status: string;
  progress: number;
  total_groups: number;
  sent_count: number;
  fail_count: number;
  delay_per_group: number;
  delay_after_all: number;
  loop_enabled: boolean;
  delay_randomized: boolean;
  log_destination: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BroadcastLog {
  id: string;
  job_id: string;
  cycle_number: number;
  group_identifier: string;
  group_id: number | null;
  status: string;
  error_type: string | null;
  error_message: string | null;
  sent_text: string | null;
  sent_at: string;
  duration_ms: number | null;
  account_id_used: string | null;
}

// ── Group Lists ─────────────────────────────────────────────────────────────

export function useGroupLists() {
  return useQuery<GroupList[]>({
    queryKey: ["group-lists"],
    queryFn: async () => {
      const { data } = await api.get("/group-lists");
      return data;
    },
  });
}

export function useCreateGroupList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; items: GroupListItem[] }) => {
      const { data } = await api.post("/group-lists", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-lists"] });
    },
  });
}

export function useUpdateGroupList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      items?: GroupListItem[];
    }) => {
      const { data } = await api.put(`/group-lists/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-lists"] });
    },
  });
}

export function useDeleteGroupList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/group-lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-lists"] });
    },
  });
}

// ── Text Lists ──────────────────────────────────────────────────────────────

export function useTextLists() {
  return useQuery<TextList[]>({
    queryKey: ["text-lists"],
    queryFn: async () => {
      const { data } = await api.get("/text-lists");
      return data;
    },
  });
}

export function useCreateTextList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; texts: string[] }) => {
      const { data } = await api.post("/text-lists", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["text-lists"] });
    },
  });
}

export function useUpdateTextList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      texts?: string[];
    }) => {
      const { data } = await api.put(`/text-lists/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["text-lists"] });
    },
  });
}

export function useDeleteTextList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/text-lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["text-lists"] });
    },
  });
}

// ── Broadcast Jobs ──────────────────────────────────────────────────────────

export function useBroadcastJobs() {
  return useQuery<BroadcastJob[]>({
    queryKey: ["broadcast-jobs"],
    queryFn: async () => {
      const { data } = await api.get("/broadcast/history");
      return data;
    },
  });
}

export function useBroadcastJob(jobId: string) {
  return useQuery<BroadcastJob>({
    queryKey: ["broadcast-jobs", jobId],
    queryFn: async () => {
      const { data } = await api.get(`/broadcast/${jobId}`);
      return data;
    },
    enabled: !!jobId,
  });
}

export function useStartBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      account_ids: string[];
      group_list_id: string;
      text_list_id?: string;
      mode: string;
      custom_text?: string;
      delay_per_group: number;
      delay_after_all: number;
      loop_enabled?: boolean;
      delay_randomized?: boolean;
      log_destination?: string | null;
    }) => {
      const { data } = await api.post("/broadcast/start", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-jobs"] });
    },
  });
}

export function useBroadcastAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      action,
    }: {
      jobId: string;
      action: "pause" | "resume" | "stop";
    }) => {
      const { data } = await api.post(`/broadcast/${jobId}/${action}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-jobs"] });
    },
  });
}

export function useDeleteBroadcastJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/broadcast/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-jobs"] });
    },
  });
}

export function useRetryBroadcastJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/broadcast/${jobId}/retry`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-jobs"] });
    },
  });
}

// ── Broadcast Logs ──────────────────────────────────────────────────────────

export function useBroadcastLogs(jobId: string, filters?: Record<string, string>) {
  return useQuery<BroadcastLog[]>({
    queryKey: ["broadcast-logs", jobId, filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters || {});
      const { data } = await api.get(`/broadcast/${jobId}/logs?${params}`);
      return data;
    },
    enabled: !!jobId,
  });
}
