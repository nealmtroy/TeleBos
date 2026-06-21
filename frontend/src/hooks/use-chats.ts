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
