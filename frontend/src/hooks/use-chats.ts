"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ChatItem {
  chat_id: number;
  title: string;
  username: string | null;
  chat_type: string;
  last_message: string | null;
  last_message_time: string | null;
  unread_count: number;
  folder_id?: number | null;
  is_archived?: boolean;
  is_creator?: boolean;
  member_count?: number | null;
  online_count?: number | null;
  invite_link?: string | null;
  account_id?: string | null;
}

export function useChats(
  accountId: string,
  page: number = 1,
  pageSize: number = 50,
  chatType?: string
) {
  return useQuery<{ chats: ChatItem[]; total: number }>({
    queryKey: ["chats", accountId, page, pageSize, chatType || "all"],
    queryFn: async () => {
      let url = `/accounts/${accountId}/chats?page=${page}&page_size=${pageSize}`;
      if (chatType) url += `&chat_type=${encodeURIComponent(chatType)}`;
      const { data } = await api.get(url);
      return data;
    },
    enabled: !!accountId,
  });
}

export function usePublicChatsIndex(
  page: number = 1,
  pageSize: number = 50,
  search?: string,
  chatType?: string,
  sortBy: string = "member_count"
) {
  return useQuery<{ chats: ChatItem[]; total: number }>({
    queryKey: ["public-chats-index", page, pageSize, search || "", chatType || "all", sortBy],
    queryFn: async () => {
      let url = `/chats/public-index?page=${page}&page_size=${pageSize}&sort_by=${sortBy}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (chatType) url += `&chat_type=${encodeURIComponent(chatType)}`;
      const { data } = await api.get(url);
      return data;
    },
  });
}
