import { cn } from "@/lib/utils";

/**
 * Base Skeleton component with shimmer animation.
 * Usage:
 *   <Skeleton className="h-4 w-full" />
 *   <Skeleton className="h-10 w-10 rounded-full" />
 *   <Skeleton className="h-40 w-full rounded-xl" />
 */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer",
        className
      )}
      aria-hidden="true"
    />
  );
}

export { Skeleton };
