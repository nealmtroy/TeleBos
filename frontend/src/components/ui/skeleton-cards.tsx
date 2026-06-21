import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

/**
 * Card skeleton — avatar circle + lines of text.
 * Used for: account cards, group list cards, text list cards.
 */
function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn("bg-white rounded-xl border border-gray-200 p-6", className)}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn("h-3", i === 0 ? "w-1/2" : i === 1 ? "w-2/3" : "w-1/3")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Table row skeleton — columns with varying widths.
 * Used for: broadcast history, broadcast logs.
 */
function TableSkeleton({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-3 h-16 bg-white rounded-xl border border-gray-200 px-4"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn(
                "h-3",
                c === 0 ? "w-1/4" : c === cols - 1 ? "w-1/6" : "w-1/5"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Stats card skeleton — icon + number + label.
 * Used for: dashboard stat cards.
 */
function StatsCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("bg-white rounded-xl border border-gray-200 p-5", className)}
    >
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
      <Skeleton className="h-7 w-20 mb-1" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/**
 * Chat row skeleton — avatar + 2 lines of text.
 * Used for: chat list in chats page.
 */
function ChatRowSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-2.5 w-12" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard account list skeleton — row with avatar + 2 lines.
 */
function AccountRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200",
        className
      )}
    >
      <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

export {
  CardSkeleton,
  TableSkeleton,
  StatsCardSkeleton,
  ChatRowSkeleton,
  AccountRowSkeleton,
};
