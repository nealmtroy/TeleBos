"use client";

import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  add: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

// ─── Store ───────────────────────────────────────────────────────

let toastCounter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  add: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    // Auto-dismiss after 4s
    setTimeout(() => {
      get().dismiss(id);
    }, 4000);
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// ─── Hook ────────────────────────────────────────────────────────

export function useToast() {
  const add = useToastStore((s) => s.add);
  const toast = useCallback(
    (opts: Omit<Toast, "id">) => {
      add(opts);
    },
    [add]
  );
  return { toast };
}

// ─── Visual ──────────────────────────────────────────────────────

const iconMap: Record<ToastVariant, { Icon: typeof CheckCircle2; bg: string; border: string; fg: string }> = {
  success: {
    Icon: CheckCircle2,
    bg: "bg-green-50",
    border: "border-green-200",
    fg: "text-green-600",
  },
  error: {
    Icon: AlertCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    fg: "text-red-600",
  },
  info: {
    Icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    fg: "text-blue-600",
  },
  warning: {
    Icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    fg: "text-amber-600",
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { Icon, bg, border, fg } = iconMap[toast.variant];

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border ${border} ${bg} p-4 shadow-lg`}
      style={{
        animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <Icon className={`h-5 w-5 ${fg} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
        )}
        {toast.description && (
          <p className="text-sm text-gray-600 mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-black/5 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
