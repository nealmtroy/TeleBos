import type { QueryClient } from "@tanstack/react-query";

export async function invalidateTwoFAAccountQueries(queryClient: QueryClient, accountId: string) {
  await queryClient.invalidateQueries({ queryKey: ["2fa", accountId] });
  await queryClient.invalidateQueries({ queryKey: ["accounts"] });
}
