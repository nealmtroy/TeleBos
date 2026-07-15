import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, X, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { MessageItem } from "./types";

interface ScheduledQueueModalProps {
  accountId: string;
  chatId: number;
  isOpen: boolean;
  onClose: () => void;
  scheduledMessagesData?: MessageItem[];
  onSendNow: (text: string) => void;
}

export function ScheduledQueueModal({
  accountId,
  chatId,
  isOpen,
  onClose,
  scheduledMessagesData,
  onSendNow,
}: ScheduledQueueModalProps) {
  const queryClient = useQueryClient();

  const deleteScheduledMutation = useMutation({
    mutationFn: async (msgId: number) => {
      await api.delete(`/accounts/${accountId}/chats/${chatId}/messages/scheduled`, {
        params: { message_ids: [msgId] }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages", accountId, chatId] });
    },
    onError: (err: any) => {
      alert("Failed to delete scheduled message: " + (err.response?.data?.detail || err.message));
    }
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh] text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Clock className="h-4.5 w-4.5 text-primary" />
            Scheduled Queue ({scheduledMessagesData?.length || 0})
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-3">
          {scheduledMessagesData && scheduledMessagesData.length > 0 ? (
            scheduledMessagesData.map((msg) => (
              <div
                key={msg.id}
                className="p-3 bg-slate-50 dark:bg-[#202b36]/40 border border-slate-155 dark:border-slate-800/80 rounded-xl flex flex-col gap-2 relative group/item"
              >
                <div className="flex justify-between items-start pr-12 text-left">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">
                    {msg.text}
                  </p>
                  <button
                    onClick={() => deleteScheduledMutation.mutate(msg.id)}
                    className="absolute top-2 right-2 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition"
                    title="Delete Scheduled Message"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-155/50 dark:border-slate-800/50 text-[10px] font-bold text-slate-450">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Send time: {new Date(msg.date).toLocaleString()}
                  </span>
                  <button
                    onClick={() => {
                      onSendNow(msg.text || "");
                      deleteScheduledMutation.mutate(msg.id);
                    }}
                    className="text-primary hover:underline hover:opacity-90 transition"
                  >
                    Send Now
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-xs text-slate-400 font-semibold">
              No scheduled messages in this chat.
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
