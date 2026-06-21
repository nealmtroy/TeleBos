"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface BroadcastProgressProps {
  progress: number;
  totalGroups: number;
  sentCount: number;
  failCount: number;
  status: string;
}

export function BroadcastProgress({
  progress,
  totalGroups,
  sentCount,
  failCount,
  status,
}: BroadcastProgressProps) {
  const _ = useT();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{_("newBroadcast.progress")}</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-primary-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xl font-bold text-gray-900">{totalGroups}</p>
          <p className="text-xs text-gray-500">{_("newBroadcast.total")}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xl font-bold text-green-700">{sentCount}</p>
          <p className="text-xs text-green-600">{_("newBroadcast.sent")}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xl font-bold text-red-700">{failCount}</p>
          <p className="text-xs text-red-600">{_("newBroadcast.failed")}</p>
        </div>
      </div>
      <div className="text-center">
        <span className={cn(
          "px-3 py-1 rounded-full text-xs font-medium",
          status === "running" && "bg-blue-100 text-blue-800",
          status === "paused" && "bg-yellow-100 text-yellow-800",
          status === "completed" && "bg-green-100 text-green-800",
          status === "failed" && "bg-red-100 text-red-800",
          status === "cancelled" && "bg-gray-100 text-gray-600",
        )}>
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
