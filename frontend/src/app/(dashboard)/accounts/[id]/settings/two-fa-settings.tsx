import type { QueryClient } from "@tanstack/react-query";

export function synchronizeAccountTwoFAStatus(
  queryClient: QueryClient,
  accountId: string,
  enabled: boolean,
  liveChecked: boolean,
) {
  if (!liveChecked) {
    return;
  }

  queryClient.setQueryData<{ twofa_enabled: boolean }>(
    ["accounts", accountId],
    (account) => (account ? { ...account, twofa_enabled: enabled } : account),
  );
}

export async function invalidateTwoFAAccountQueries(queryClient: QueryClient, accountId: string) {
  await queryClient.invalidateQueries({ queryKey: ["2fa", accountId] });
  await queryClient.invalidateQueries({ queryKey: ["accounts"] });
}
