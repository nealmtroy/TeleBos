import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-slate-100 via-slate-200/60 to-slate-100 dark:from-slate-800 dark:via-slate-700/60 dark:to-slate-800 bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
