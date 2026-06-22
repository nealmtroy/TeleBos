"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import api from "@/lib/api";

export interface AccountFolder {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  account_ids?: string[];
}

/** Fetch all folders for the current user. */
export function useAccountFolders(includeAccounts = false) {
  return useQuery<AccountFolder[]>({
    queryKey: ["account-folders", { includeAccounts }],
    queryFn: async () => {
      const { data } = await api.get("/account-folders", {
        params: includeAccounts ? { include_accounts: "true" } : {},
      });
      return data.folders || [];
    },
  });
}

/** Create a new folder. */
export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post("/account-folders", { name });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-folders"] });
    },
  });
}

/** Rename a folder. */
export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      const { data } = await api.put(`/account-folders/${folderId}`, { name });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-folders"] });
    },
  });
}

/** Delete a folder. */
export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (folderId: string) => {
      await api.delete(`/account-folders/${folderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-folders"] });
    },
  });
}

/** Add accounts to a folder. */
export function useAddAccountsToFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, accountIds }: { folderId: string; accountIds: string[] }) => {
      const { data } = await api.post(`/account-folders/${folderId}/accounts`, {
        account_ids: accountIds,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-folders"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

/** Remove accounts from a folder. */
export function useRemoveAccountsFromFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, accountIds }: { folderId: string; accountIds: string[] }) => {
      const { data } = await api.delete(`/account-folders/${folderId}/accounts`, {
        data: { account_ids: accountIds },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-folders"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
