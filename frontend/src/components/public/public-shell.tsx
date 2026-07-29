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
    <div className={cn("public-theme min-h-screen bg-black text-[#f0f0f0]", className)}>
      <a
        href={`#${mainId}`}
        className="public-focus fixed left-4 top-3 z-[70] -translate-y-24 rounded-[6px] border border-[#292d30] bg-black px-4 py-2 text-sm text-white transition-transform focus:translate-y-0"
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
