import React, { memo, useState, useEffect } from "react";
import { Send } from "lucide-react";

export interface RecordingVoiceBannerProps {
  onCancel: () => void;
  onSend: () => void;
}

export const RecordingVoiceBanner = memo(function RecordingVoiceBanner({
  onCancel,
  onSend,
}: RecordingVoiceBannerProps) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#1a242f] w-full animate-in fade-in duration-200">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-350">
          Recording Voice Note... {minutes}:{seconds}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSend}
          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-xs font-bold text-white transition flex items-center gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </div>
    </div>
  );
});
