"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface AccountStats {
  contacts_count: number;
  total_groups: number;
  owned_groups: number;
  total_channels: number;
  owned_channels: number;
  stats_updated_at: string | null;
}

export function useAccountStats(accountId: string) {
  return useQuery<AccountStats>({
    queryKey: ["accounts", accountId, "stats"],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stats`);
      return data;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes without re-fetch
  });
}
