"use client";

import {
  User,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoubleBezelShell, PriceTag } from "@/components/layout/trade-surface";
import { cn } from "@/lib/utils";
import { UnifiedOrder, STATUS_CONFIG } from "./types";

interface OrderMobileDeckProps {
  items: UnifiedOrder[];
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onSelectDetail: (item: UnifiedOrder) => void;
  locale: string;
}

export function OrderMobileDeck({
  items,
  copiedId,
  onCopy,
  onSelectDetail,
  locale,
}: OrderMobileDeckProps) {
  return (
    <div className="lg:hidden space-y-3">
      {items.map((item) => {
        const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.Menunggu;
        const isCopied = copiedId === item.id;

        return (
          <DoubleBezelShell key={item.id} className="p-1">
            <div className="space-y-3">
              {/* Header Row: ID + Type + Status */}
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-foreground text-xs">
                    {item.orderIdDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopy(item.orderIdDisplay, item.id)}
                    className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded"
                  >
                    {isCopied ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {item.type === "telegram_account" ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      <User className="h-2.5 w-2.5" />
                      <span>Akun</span>
                    </span>
                  ) : item.type === "smm" ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                      <ShoppingCart className="h-2.5 w-2.5" />
                      <span>SMM</span>
                    </span>
                  ) : item.type === "deposit" ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <ArrowDownLeft className="h-2.5 w-2.5" />
                      <span>Deposit</span>
                    </span>
                  ) : item.type === "withdraw" ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      <span>Tarik</span>
                    </span>
                  ) : item.type === "redeem" ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                      <Gift className="h-2.5 w-2.5" />
                      <span>Redeem</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                      <Sparkles className="h-2.5 w-2.5" />
                      <span>Saldo</span>
                    </span>
                  )}

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                      statusConf.bgBadge
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusConf.dotColor)}
                    />
                    <span>
                      {locale === "id" ? statusConf.labelId : statusConf.labelEn}
                    </span>
                  </span>
                </div>
              </div>

              {/* Service & Category */}
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm text-foreground leading-snug">
                  {item.serviceName}
                </h4>
                <p className="text-[10px] text-muted-foreground">{item.serviceSublabel}</p>
              </div>

              {/* Key-Value Spec Sheet */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Target / Detail
                  </p>
                  <p className="font-mono text-[11px] text-foreground truncate">{item.detail}</p>
                  {item.telegramId && (
                    <p className="font-mono text-[10px] text-muted-foreground/75 truncate select-all">
                      UID: {item.telegramId}
                    </p>
                  )}
                </div>

                <div className="space-y-0.5 text-right">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {locale === "id" ? "Total Biaya" : "Total Price"}
                  </p>
                  {item.type === "deposit" || item.type === "redeem" ? (
                    <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +{item.priceDisplay.replace(/^\+/, "")}
                    </span>
                  ) : item.type === "withdraw" ? (
                    <span className="font-bold text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                      -{item.priceDisplay.replace(/^-/, "")}
                    </span>
                  ) : item.type === "admin_adjustment" ? (
                    <span
                      className={cn(
                        "font-bold text-xs tabular-nums",
                        item.priceRaw >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {item.priceDisplay}
                    </span>
                  ) : (
                    <PriceTag value={item.priceRaw} size="sm" className="font-bold" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {locale === "id" ? "Jumlah" : "Quantity"}
                  </p>
                  <p className="font-medium text-[11px] text-foreground tabular-nums">
                    {item.quantityDisplay}
                  </p>
                </div>

                <div className="space-y-0.5 text-right">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {locale === "id" ? "Waktu (WIB)" : "Time (WIB)"}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {item.dateStr} • {item.timeStr}
                  </p>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onSelectDetail(item)}
                  className="h-8 px-3 rounded-lg text-xs font-semibold"
                >
                  {locale === "id" ? "Lihat Detail" : "View Details"}
                </Button>
              </div>
            </div>
          </DoubleBezelShell>
        );
      })}
    </div>
  );
}
