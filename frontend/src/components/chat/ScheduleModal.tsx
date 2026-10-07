import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);

  const sendScheduledMutation = useMutation({
    mutationFn: async (payload: { text: string; schedule_date: number }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/scheduled`, payload);
    },
    onSuccess: () => {
      setScheduleDate(undefined);
      onSuccess();
    },
    onError: (err: any) => {
      alert("Failed to schedule message: " + (err.response?.data?.detail || err.message));
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-sm bg-white dark:bg-[#17212b] rounded-2xl shadow-xl p-4 text-left border-slate-150 dark:border-slate-800">
        <DialogHeader className="pb-3 border-b border-slate-150 dark:border-slate-800 pr-6 text-left">
          <DialogTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Clock className="h-4.5 w-4.5 text-primary" />
            Schedule Message
          </DialogTitle>
          <DialogDescription className="sr-only">
            Schedule a message to be sent at a future time
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-2 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Choose date and time to send this message:
          </p>
          <DateTimePicker
            date={scheduleDate}
            setDate={setScheduleDate}
            minDate={new Date()}
            placeholder="Pilih tanggal & jam"
            className="w-full"
            triggerClassName="text-xs font-semibold py-2 px-3 rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] text-slate-800 dark:text-white"
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
              if (!scheduleDate) {
                alert("Please select a date and time.");
                return;
              }
              const timestamp = Math.floor(scheduleDate.getTime() / 1000);
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
      </DialogContent>
    </Dialog>
  );
}
