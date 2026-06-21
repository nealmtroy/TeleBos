import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface SubscriptionInfo {
  plan: string;
  expires_at: string | null;
  is_active: boolean;
  days_remaining: number | null;
}

export function useMySubscription() {
  return useQuery<SubscriptionInfo>({
    queryKey: ["subscription", "me"],
    queryFn: async () => {
      const { data } = await api.get("/subscriptions/me");
      return data;
    },
    staleTime: 30_000,
  });
}

export function useRedeemCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post("/redeem", { code });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", "me"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}
