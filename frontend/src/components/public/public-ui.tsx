import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const publicButtonClass =
  "public-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] border border-[#292d30] bg-transparent px-4 py-2.5 text-sm font-medium text-white transition-[border-color,color,background-color] duration-150 ease-out hover:border-[#f0f0f0] hover:bg-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-50";

export const publicInputClass =
  "public-focus h-11 w-full rounded-[6px] border border-[#292d30] bg-black px-3 text-sm text-white placeholder:text-[#6e727a] transition-[border-color,box-shadow] duration-150 aria-[invalid=true]:border-[#ff9592]";

export function PublicCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn("rounded-[16px] border border-[#292d30] bg-black", className)}
      {...props}
    />
  );
}

export function PublicCode({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre
      className={cn(
        "public-mono overflow-x-auto rounded-[16px] border border-[#292d30] bg-black p-5 text-sm leading-6 text-[#f0f0f0]",
        className
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

type PublicStatusTone = "accent" | "danger" | "muted" | "success" | "warning";

const statusToneClass: Record<PublicStatusTone, string> = {
  accent: "bg-[#2AABEE]",
  danger: "bg-[#ff9592]",
  muted: "bg-[#6e727a]",
  success: "bg-[#3ad389]",
  warning: "bg-[#ffca16]",
};

export function PublicStatusRow({
  label,
  tone = "muted",
  value,
}: {
  label: ReactNode;
  tone?: PublicStatusTone;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[#292d30] py-3 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-sm text-[#a1a4a5]">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusToneClass[tone])} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="public-mono shrink-0 text-xs text-[#f0f0f0]">{value}</span>
    </div>
  );
}

export function PublicTerminal({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[16px] border border-[#292d30] bg-black", className)}>
      <div className="flex items-center justify-between border-b border-[#292d30] px-4 py-3">
        <span className="public-mono text-[11px] text-[#a1a4a5]">{label}</span>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[#464a4d]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#464a4d]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#2AABEE]" />
        </span>
      </div>
      {children}
    </div>
  );
}

export function PublicInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(publicInputClass, className)} {...props} />;
}
