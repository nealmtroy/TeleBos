"use client";

import { type ReactNode } from "react";
import { Trash2, AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const iconMap = {
    danger: {
      Icon: Trash2,
      bg: "bg-rose-100 dark:bg-rose-950/50",
      fg: "text-rose-600 dark:text-rose-400",
      btnVariant: "destructive" as const,
    },
    warning: {
      Icon: AlertTriangle,
      bg: "bg-amber-100 dark:bg-amber-950/50",
      fg: "text-amber-600 dark:text-amber-400",
      btnVariant: "default" as const,
    },
    info: {
      Icon: Info,
      bg: "bg-blue-100 dark:bg-blue-950/50",
      fg: "text-blue-600 dark:text-blue-400",
      btnVariant: "default" as const,
    },
  };

  const { Icon, bg, fg, btnVariant } = iconMap[variant];

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="max-w-sm p-6 text-center">
        <DialogHeader className="items-center text-center">
          <div
            className={`w-14 h-14 rounded-full ${bg} flex items-center justify-center mb-2`}
          >
            <Icon className={`h-6 w-6 ${fg}`} />
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 w-full mt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            variant={btnVariant}
            className="flex-1"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
