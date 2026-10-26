"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface AccountOTPMessage {
  id: number;
  date: string;
  text: string;
  otp_code: string | null;
}

export interface AccountOTPResponse {
  account_id: string;
  phone: string;
  telegram_id: number | null;
  otp_code: string | null;
  otp_message: string | null;
  otp_date: string | null;
  is_recent: boolean;
  messages: AccountOTPMessage[];
}

export function useAccountOTP(accountId: string, options?: { enabled?: boolean }) {
  return useQuery<AccountOTPResponse>({
    queryKey: ["accounts", accountId, "otp"],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/otp`);
      return data;
    },
    enabled: !!accountId && (options?.enabled ?? false),
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
