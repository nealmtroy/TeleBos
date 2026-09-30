"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" className={cn("", className)} {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<typeof Button>;

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      variant={isActive ? "default" : "outline"}
      size={size}
      className={cn(
        "rounded-lg transition-colors",
        isActive
          ? "border-primary bg-primary text-white hover:bg-primary/90 dark:bg-primary dark:text-white font-bold"
          : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700",
        className
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  text = "Previous",
  showText = true,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string; showText?: boolean }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size={showText ? "default" : "icon"}
      className={cn("gap-1 px-2.5", className)}
      {...props}
    >
      <ChevronLeft className="size-4 shrink-0" />
      {showText && <span className="hidden sm:inline text-xs font-medium">{text}</span>}
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  text = "Next",
  showText = true,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string; showText?: boolean }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size={showText ? "default" : "icon"}
      className={cn("gap-1 px-2.5", className)}
      {...props}
    >
      {showText && <span className="hidden sm:inline text-xs font-medium">{text}</span>}
      <ChevronRight className="size-4 shrink-0" />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center text-gray-400 dark:text-slate-500",
        className
      )}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

/**
 * Helper algorithm to generate visible page numbers with elipsis.
 * Returns array like [1, 2, 3, "…", 10] or [1, "…", 4, 5, 6, "…", 10].
 */
export function generatePaginationPages(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 7
): (number | "…")[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "…")[] = [1];

  if (currentPage > 3) {
    pages.push("…");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("…");
  }

  pages.push(totalPages);

  return pages;
}

interface DataPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  labels?: {
    prev?: string;
    next?: string;
    pageOf?: string;
  };
}

/**
 * Ready-to-use unified Pagination component that adapts smoothly across
 * compact mobile and full desktop layouts with full Dark Mode support.
 */
export function DataPagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  compact = false,
  className,
  labels = { prev: "Prev", next: "Next", pageOf: "Page" },
}: DataPaginationProps) {
  if (totalPages <= 1) return null;

  if (compact) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-2", className)}>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || disabled}
          aria-label={labels.prev || "Previous"}
          className="rounded-lg border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || disabled}
          aria-label={labels.next || "Next"}
          className="rounded-lg border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    );
  }

  const pageList = generatePaginationPages(page, totalPages);

  return (
    <Pagination className={cn("select-none", className)}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || disabled}
            text={labels.prev}
          />
        </PaginationItem>

        {pageList.map((p, idx) => (
          <PaginationItem key={p === "…" ? `ellipsis-${idx}` : p}>
            {p === "…" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                isActive={page === p}
                onClick={() => onPageChange(p as number)}
                disabled={disabled}
                className="size-8 text-xs font-semibold"
              >
                {p}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || disabled}
            text={labels.next}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
