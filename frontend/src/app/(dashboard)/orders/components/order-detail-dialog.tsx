"use client";

import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriceTag } from "@/components/layout/trade-surface";
import { cn } from "@/lib/utils";
import { UnifiedOrder, STATUS_CONFIG } from "./types";

interface OrderDetailDialogProps {
  item: UnifiedOrder | null;
  onClose: () => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  locale: string;
}

export function OrderDetailDialog({
  item,
  onClose,
  copiedId,
  onCopy,
  locale,
}: OrderDetailDialogProps) {
  if (!item) return null;

  const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.Menunggu;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-5 sm:p-6 space-y-5">
        {/* Modal Header */}
        <DialogHeader className="border-b border-border/60 pb-4 text-left">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DialogTitle className="font-mono text-sm font-bold text-foreground">
                {item.orderIdDisplay}
              </DialogTitle>
              <button
                type="button"
                onClick={() => onCopy(item.orderIdDisplay, `modal-${item.id}`)}
                className="text-muted-foreground/60 hover:text-foreground p-1 rounded hover:bg-muted"
                title="Copy Order ID"
              >
                {copiedId === `modal-${item.id}` ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === "id"
                ? "Detail Spesifikasi Pesanan"
                : "Order Specification Details"}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Hero Banner inside Modal */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="font-bold text-base text-foreground leading-snug">
                {item.serviceName}
              </h3>
              <p className="text-xs text-muted-foreground">{item.serviceSublabel}</p>
            </div>
            {item.type === "deposit" || item.type === "redeem" ? (
              <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                +{item.priceDisplay.replace(/^\+/, "")}
              </span>
            ) : item.type === "withdraw" ? (
              <span className="font-bold text-lg text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                -{item.priceDisplay.replace(/^-/, "")}
              </span>
            ) : item.type === "admin_adjustment" ? (
              <span
                className={cn(
                  "font-bold text-lg tabular-nums shrink-0",
                  item.priceRaw >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                {item.priceDisplay}
              </span>
            ) : (
              <PriceTag value={item.priceRaw} size="lg" className="font-bold shrink-0" />
            )}
          </div>

          {/* Status inside Hero */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40">
            <span className="text-muted-foreground font-medium">Status</span>
            <Badge
              variant="outline"
              className={cn("gap-1 text-[10px] font-semibold border", statusConf.bgBadge)}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", statusConf.dotColor)} />
              <span>
                {locale === "id" ? statusConf.labelId : statusConf.labelEn}
              </span>
            </Badge>
          </div>
        </div>

        {/* Detailed Spec Grid */}
        <div className="space-y-2.5 text-xs">
          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
            <span className="font-semibold text-muted-foreground">
              {locale === "id" ? "Tipe Transaksi" : "Transaction Type"}
            </span>
            <span className="font-bold text-foreground col-span-2">{item.typeName}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
            <span className="font-semibold text-muted-foreground">
              {locale === "id" ? "Target / Akun" : "Target / Account"}
            </span>
            <div className="col-span-2 flex items-center justify-between gap-2">
              <span className="font-mono text-foreground break-all select-all">
                {item.detail}
              </span>
              {item.detail !== "-" && (
                <button
                  type="button"
                  onClick={() => onCopy(item.detail, "modal-target")}
                  className="p-1 text-muted-foreground hover:text-foreground shrink-0 rounded hover:bg-muted"
                  title="Copy Target"
                >
                  {copiedId === "modal-target" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          {item.telegramId && (
            <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
              <span className="font-semibold text-muted-foreground">Telegram User ID</span>
              <div className="col-span-2 flex items-center justify-between gap-2">
                <span className="font-mono text-foreground font-semibold select-all">
                  {item.telegramId}
                </span>
                <button
                  type="button"
                  onClick={() => onCopy(String(item.telegramId), "modal-uid")}
                  className="p-1 text-muted-foreground hover:text-foreground shrink-0 rounded hover:bg-muted"
                  title="Copy User ID"
                >
                  {copiedId === "modal-uid" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
            <span className="font-semibold text-muted-foreground">
              {locale === "id" ? "Kuantitas" : "Quantity"}
            </span>
            <span className="font-bold text-foreground col-span-2 tabular-nums">
              {item.quantityDisplay}
            </span>
          </div>

          {item.paymentMethod && (
            <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
              <span className="font-semibold text-muted-foreground">
                {locale === "id" ? "Metode / Kanal" : "Method / Channel"}
              </span>
              <span className="font-medium text-foreground col-span-2">
                {item.paymentMethod}
              </span>
            </div>
          )}

          {item.adminNote && (
            <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
              <span className="font-semibold text-muted-foreground">
                {locale === "id" ? "Catatan Admin" : "Admin Note"}
              </span>
              <span className="font-medium text-primary col-span-2">
                {item.adminNote}
              </span>
            </div>
          )}

          {item.smmOrderId && (
            <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
              <span className="font-semibold text-muted-foreground">Provider Order ID</span>
              <span className="font-mono text-foreground col-span-2">
                #{item.smmOrderId}
              </span>
            </div>
          )}

          {item.remains !== undefined && item.remains !== null && (
            <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
              <span className="font-semibold text-muted-foreground">
                {locale === "id" ? "Sisa Antrean" : "Remains"}
              </span>
              <span className="font-mono text-foreground col-span-2">
                {item.remains.toLocaleString()}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40">
            <span className="font-semibold text-muted-foreground">
              {locale === "id" ? "Waktu Dibuat" : "Created At"}
            </span>
            <span className="font-medium text-foreground col-span-2">
              {item.dateStr} • {item.timeStr}
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const summaryParts = [
                `Order ID: ${item.orderIdDisplay}`,
                `Layanan: ${item.serviceName}`,
                `Target: ${item.detail}`,
              ];
              if (item.telegramId) {
                summaryParts.push(`Telegram UID: ${item.telegramId}`);
              }
              summaryParts.push(
                `Jumlah: ${item.quantityDisplay}`,
                `Total: ${item.priceDisplay}`,
                `Status: ${item.status}`,
                `Waktu: ${item.dateStr} ${item.timeStr}`
              );
              const summary = summaryParts.join("\n");
              onCopy(summary, "modal-summary");
            }}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5 border-border/80"
          >
            {copiedId === "modal-summary" ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{locale === "id" ? "Salin Ringkasan" : "Copy Summary"}</span>
          </Button>

          <Button onClick={onClose} className="h-9 rounded-xl px-5 text-xs font-semibold">
            {locale === "id" ? "Tutup" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
