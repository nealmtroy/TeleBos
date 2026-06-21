"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ContactItem {
  contact_id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  mutual: boolean;
}

export interface ContactDetail extends ContactItem {
  about: string | null;
  common_chats_count: number;
}

export function useContacts(
  accountId: string,
  page: number = 1,
  pageSize: number = 50,
  search?: string
) {
  return useQuery<{ contacts: ContactItem[]; total: number }>({
    queryKey: ["contacts", accountId, page, pageSize, search || ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (search) params.set("search", search);
      const { data } = await api.get(
        `/accounts/${accountId}/contacts?${params.toString()}`
      );
      return data;
    },
    enabled: !!accountId,
  });
}

export function useContactDetail(
  accountId: string,
  contactId: number | null
) {
  return useQuery<ContactDetail>({
    queryKey: ["contacts", accountId, "detail", contactId],
    queryFn: async () => {
      const { data } = await api.get(
        `/accounts/${accountId}/contacts/${contactId}`
      );
      return data;
    },
    enabled: !!accountId && contactId !== null,
  });
}

export function useDeleteContact(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: number) => {
      await api.delete(`/accounts/${accountId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", accountId] });
    },
  });
}
