import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import api from "@/lib/api";
import { ChatItem } from "./types";

interface ForwardModalProps {
  accountId: string;
  chatId: number;
  isOpen: boolean;
  onClose: () => void;
  selectedMsgIds: Set<number>;
  onSuccess: () => void;
}

export function ForwardModal({
  accountId,
  chatId,
  isOpen,
  onClose,
  selectedMsgIds,
  onSuccess,
}: ForwardModalProps) {
  const queryClient = useQueryClient();

  const { data: forwardChatsData } = useQuery<{ chats: ChatItem[] }>({
    queryKey: ["forward-chats", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats?page=1&page_size=100`);
      return data;
    },
    enabled: !!accountId && isOpen,
  });

  const forwardMutation = useMutation({
    mutationFn: async (params: { messageIds: number[]; toChatIds: number[] }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/forward`, {
        message_ids: params.messageIds,
        to_chat_ids: params.toChatIds,
      });
    },
    onSuccess: () => {
      onSuccess();
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Forward to...</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/50 custom-scroll">
          {forwardChatsData?.chats && forwardChatsData.chats.length > 0 ? (
            forwardChatsData.chats
              .filter((c) => c.chat_id !== chatId)
              .map((c) => (
                <button
                  key={c.chat_id}
                  onClick={() => {
                    forwardMutation.mutate({
                      messageIds: Array.from(selectedMsgIds),
                      toChatIds: [c.chat_id],
                    });
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-[#202b36] transition flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                    {(c.title || "?")[0]}
                  </div>
                  <span className="truncate flex-1">{c.title || "Unknown Chat"}</span>
                </button>
              ))
          ) : (
            <div className="text-center py-8 text-sm text-slate-400">
              {forwardChatsData ? "No other chats found" : "Loading chats..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
