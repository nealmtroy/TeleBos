"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectChatSocket } from "@/lib/socket";
import type { AccountTwoFAStatus } from "@/hooks/use-accounts";

export function useTwoFAStatusSync(accountId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accountId) return;
    const socket = connectChatSocket(accountId);
    const handler = (data: any) => {
      if (data.type !== "twofa_status_sync" || data.account_id !== accountId) return;
      const status: AccountTwoFAStatus = {
        enabled: Boolean(data.enabled),
        live_checked: true,
        has_recovery: data.has_recovery ?? null,
        hint: data.hint ?? null,
        login_email_pattern: data.login_email_pattern ?? null,
        unconfirmed_email_pattern: data.unconfirmed_email_pattern ?? null,
        synced_at: data.synced_at ?? null,
      };
      queryClient.setQueryData(["2fa", accountId], status);
      queryClient.setQueryData(["accounts", accountId], (account: any) =>
        account ? { ...account, twofa_enabled: status.enabled } : account
      );
    };
    socket.on("twofa_status_sync", handler);
    return () => socket.off("twofa_status_sync", handler);
  }, [accountId, queryClient]);
}
