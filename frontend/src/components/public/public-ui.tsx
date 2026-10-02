import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const publicButtonClass =
  "public-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] border border-[var(--public-border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--public-text)] transition-[border-color,color,background-color] duration-150 ease-out hover:border-[var(--public-accent-strong)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50";

export const publicInputClass =
  "public-focus h-11 w-full rounded-[6px] border border-[var(--public-border)] bg-[var(--public-canvas)] px-3 text-sm text-[var(--public-text)] placeholder:text-[var(--public-subtle)] transition-[border-color,box-shadow] duration-150 aria-[invalid=true]:border-[var(--public-danger)]";

export function PublicCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn("rounded-[16px] border border-[var(--public-border)] bg-[var(--public-canvas)]", className)}
      {...props}
    />
  );
}

export function PublicCode({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre
      className={cn(
        "public-mono overflow-x-auto rounded-[16px] border border-[var(--public-border)] bg-[var(--public-canvas)] p-5 text-sm leading-6 text-[var(--public-body)]",
        className
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

type PublicStatusTone = "accent" | "danger" | "muted" | "success" | "warning";

const statusToneClass: Record<PublicStatusTone, string> = {
  accent: "bg-[var(--public-accent)]",
  danger: "bg-[var(--public-danger)]",
  muted: "bg-[var(--public-subtle)]",
  success: "bg-[var(--public-success)]",
  warning: "bg-[var(--public-warning)]",
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
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[var(--public-border)] py-3 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--public-muted)]">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusToneClass[tone])} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="public-mono shrink-0 text-xs text-[var(--public-body)]">{value}</span>
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
    <div className={cn("overflow-hidden rounded-[16px] border border-[var(--public-border)] bg-[var(--public-canvas)]", className)}>
      <div className="flex items-center justify-between border-b border-[var(--public-border)] px-4 py-3">
        <span className="public-mono text-[11px] text-[var(--public-muted)]">{label}</span>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-subtle)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-subtle)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--public-accent)]" />
        </span>
      </div>
      {children}
    </div>
  );
}

export function PublicInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(publicInputClass, className)} {...props} />;
}
