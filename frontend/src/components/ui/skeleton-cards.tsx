import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

/**
 * Card skeleton — avatar circle + lines of text.
 * Used for: account cards, group list cards, text list cards.
 */
function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn("bg-card rounded-xl border border-border p-4 sm:p-5", className)}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
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
          className="flex items-center gap-3 h-14 bg-card rounded-xl border border-border px-4"
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
      className={cn("bg-card rounded-xl border border-border p-3.5 sm:p-4", className)}
    >
      <div className="flex items-center justify-between mb-2.5">
        <Skeleton className="h-3.5 w-20 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16 mb-1.5" />
      <Skeleton className="h-3 w-28" />
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
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-2.5 w-12" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-4 w-4 rounded-full" />
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
        "flex items-center gap-3.5 px-4 sm:px-5 py-2.5 bg-card",
        className
      )}
    >
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
      <Skeleton className="h-5 w-14 rounded-full" />
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
