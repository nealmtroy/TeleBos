import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PublicShellProps = {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  header?: ReactNode;
  mainClassName?: string;
  mainId?: string;
};

export function PublicShell({
  children,
  className,
  footer,
  header,
  mainClassName,
  mainId = "main-content",
}: PublicShellProps) {
  return (
    <div className={cn("public-theme public-grain min-h-screen bg-[var(--public-canvas)] text-[var(--public-body)]", className)}>
      <a
        href={`#${mainId}`}
        className="public-focus fixed left-4 top-3 z-[70] -translate-y-24 rounded-[6px] border border-[var(--public-border)] bg-[var(--public-canvas)] px-4 py-2 text-sm text-[var(--public-text)] transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      {header}
      <main id={mainId} className={mainClassName}>
        {children}
      </main>
      {footer}
    </div>
  );
}
