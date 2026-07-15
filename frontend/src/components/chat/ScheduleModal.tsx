import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, X, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface ScheduleModalProps {
  accountId: string;
  chatId: number;
  isOpen: boolean;
  onClose: () => void;
  messageText: string;
  onSuccess: () => void;
}

export function ScheduleModal({
  accountId,
  chatId,
  isOpen,
  onClose,
  messageText,
  onSuccess,
}: ScheduleModalProps) {
  const [scheduleTime, setScheduleTime] = useState("");

  const sendScheduledMutation = useMutation({
    mutationFn: async (payload: { text: string; schedule_date: number }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/scheduled`, payload);
    },
    onSuccess: () => {
      setScheduleTime("");
      onSuccess();
    },
    onError: (err: any) => {
      alert("Failed to schedule message: " + (err.response?.data?.detail || err.message));
    }
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col p-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-150 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Clock className="h-4.5 w-4.5 text-primary" />
            Schedule Message
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        
        <div className="py-4 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Choose date and time to send this message:
          </p>
          <input
            type="datetime-local"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-xs font-semibold text-slate-800 dark:text-white"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-150 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-150 dark:hover:bg-slate-850 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!scheduleTime) {
                alert("Please select a date and time.");
                return;
              }
              const timestamp = Math.floor(new Date(scheduleTime).getTime() / 1000);
              if (timestamp <= Math.floor(Date.now() / 1000)) {
                alert("Scheduled time must be in the future.");
                return;
              }
              sendScheduledMutation.mutate({
                text: messageText,
                schedule_date: timestamp,
              });
            }}
            disabled={sendScheduledMutation.isPending}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 shadow-sm transition disabled:opacity-50 flex items-center gap-1"
          >
            {sendScheduledMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
