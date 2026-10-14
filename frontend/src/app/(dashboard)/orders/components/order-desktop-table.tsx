"use client";

import {
  User,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Sparkles,
  ArrowUpDown,
  Copy,
  Check,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { PriceTag } from "@/components/layout/trade-surface";
import { cn } from "@/lib/utils";
import { UnifiedOrder, STATUS_CONFIG } from "./types";

interface OrderDesktopTableProps {
  items: UnifiedOrder[];
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onSelectDetail: (item: UnifiedOrder) => void;
  sortBy: "date" | "status" | "price";
  sortOrder: "asc" | "desc";
  onToggleSort: (field: "date" | "status" | "price") => void;
  locale: string;
}

export function OrderDesktopTable({
  items,
  copiedId,
  onCopy,
  onSelectDetail,
  onToggleSort,
  locale,
}: OrderDesktopTableProps) {
  return (
    <div className="hidden lg:block overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
      <TooltipProvider>
        <Table className="text-xs table-fixed w-full min-w-[1080px]">
        <TableHeader>
          <TableRow className="border-b border-border/80 bg-muted/40 hover:bg-muted/40">
            <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[130px]">
              Order ID
            </TableHead>
            <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[110px]">
              {locale === "id" ? "Tipe" : "Type"}
            </TableHead>
            <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[220px]">
              {locale === "id" ? "Layanan" : "Service"}
            </TableHead>
            <TableHead className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground w-[180px]">
              Target / Detail
            </TableHead>
            <TableHead className="py-3 px-4 text-right font-bold uppercase tracking-wider text-muted-foreground w-[90px]">
              {locale === "id" ? "Jumlah" : "Qty"}
            </TableHead>
            <TableHead
              className="py-3 px-4 text-right font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground w-[120px]"
              onClick={() => onToggleSort("price")}
            >
              <div className="flex items-center justify-end gap-1">
                <span>{locale === "id" ? "Nominal" : "Price"}</span>
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="py-3 px-4 text-center font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground w-[110px]"
              onClick={() => onToggleSort("status")}
            >
              <div className="flex items-center justify-center gap-1">
                <span>Status</span>
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>

            <TableHead
              className="py-3 px-4 font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground w-[120px]"
              onClick={() => onToggleSort("date")}
            >
              <div className="flex items-center gap-1">
                <span>{locale === "id" ? "Waktu" : "Timestamp"}</span>
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead className="py-3 px-4 text-center font-bold uppercase tracking-wider text-muted-foreground w-[95px]">
              {locale === "id" ? "Aksi" : "Action"}
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody className="divide-y divide-border/60">
          {items.map((item) => {
            const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.Menunggu;
            const isCopied = copiedId === item.id;

            return (
              <TableRow key={item.id} className="hover:bg-muted/40 transition-colors group">
                {/* Order ID */}
                <TableCell className="py-3.5 px-4 font-mono whitespace-nowrap w-[130px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground tracking-tight">
                      {item.orderIdDisplay}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopy(item.orderIdDisplay, item.id)}
                      className="h-6 w-6 rounded-md border border-slate-300 dark:border-slate-700 bg-card text-muted-foreground hover:text-foreground flex items-center justify-center transition shadow-2xs cursor-pointer"
                      title="Copy Order ID"
                    >
                      {isCopied ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </TableCell>

                {/* Tipe Order Badge */}
                <TableCell className="py-3.5 px-4 whitespace-nowrap w-[110px]">
                  {item.type === "telegram_account" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      <User className="h-3 w-3" />
                      <span>{locale === "id" ? "Akun TG" : "TG Account"}</span>
                    </span>
                  ) : item.type === "smm" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">
                      <ShoppingCart className="h-3 w-3" />
                      <span>SMM</span>
                    </span>
                  ) : item.type === "deposit" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <ArrowDownLeft className="h-3 w-3" />
                      <span>Deposit</span>
                    </span>
                  ) : item.type === "withdraw" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <ArrowUpRight className="h-3 w-3" />
                      <span>{locale === "id" ? "Penarikan" : "Withdraw"}</span>
                    </span>
                  ) : item.type === "redeem" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <Gift className="h-3 w-3" />
                      <span>Redeem</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20">
                      <Sparkles className="h-3 w-3" />
                      <span>{locale === "id" ? "Saldo" : "Adjust"}</span>
                    </span>
                  )}
                </TableCell>

                {/* Layanan & Kategori */}
                <TableCell className="py-3.5 px-4 w-[220px]">
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span
                      className="font-bold text-foreground truncate leading-snug"
                      title={item.serviceName}
                    >
                      {item.serviceName}
                    </span>
                    <span
                      className="text-[10px] text-muted-foreground truncate"
                      title={item.serviceSublabel}
                    >
                      {item.serviceSublabel}
                    </span>
                  </div>
                </TableCell>

                {/* Detail Target */}
                <TableCell className="py-3.5 px-4 w-[180px]">
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <p
                        className="text-[11px] font-mono text-muted-foreground truncate select-all"
                        title={item.detail}
                      >
                        {item.detail}
                      </p>
                      {item.detail !== "-" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onCopy(item.detail, `target-${item.id}`)}
                              className="text-muted-foreground/50 hover:text-foreground p-0.5 shrink-0"
                            >
                              {copiedId === `target-${item.id}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copy Target</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {item.telegramId && (
                      <span className="text-[10px] font-mono text-muted-foreground/75 truncate select-all">
                        UID: {item.telegramId}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Jumlah */}
                <TableCell className="py-3.5 px-4 text-right font-medium text-foreground whitespace-nowrap tabular-nums w-[90px]">
                  {item.quantityDisplay}
                </TableCell>

                {/* Nominal / Harga */}
                <TableCell className="py-3.5 px-4 text-right whitespace-nowrap w-[120px]">
                  {item.type === "deposit" || item.type === "redeem" ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +{item.priceDisplay.replace(/^\+/, "")}
                    </span>
                  ) : item.type === "withdraw" ? (
                    <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                      -{item.priceDisplay.replace(/^-/, "")}
                    </span>
                  ) : item.type === "admin_adjustment" ? (
                    <span
                      className={cn(
                        "font-bold tabular-nums",
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
                </TableCell>

                {/* Status */}
                <TableCell className="py-3.5 px-4 text-center whitespace-nowrap w-[110px]">
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1.5 text-[11px] font-semibold border",
                      statusConf.bgBadge
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusConf.dotColor)}
                    />
                    <span>
                      {locale === "id" ? statusConf.labelId : statusConf.labelEn}
                    </span>
                  </Badge>
                </TableCell>

                {/* Waktu WIB */}
                <TableCell className="py-3.5 px-4 whitespace-nowrap text-muted-foreground w-[120px]">
                  <div className="flex flex-col leading-tight">
                    <span className="font-medium text-foreground text-[11px]">
                      {item.dateStr}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {item.timeStr}
                    </span>
                  </div>
                </TableCell>

                {/* Aksi */}
                <TableCell className="py-3.5 px-4 text-center whitespace-nowrap w-[95px]">
                  <div className="flex items-center justify-center">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onSelectDetail(item)}
                      className="h-7 px-2.5 rounded-lg border-slate-300 dark:border-slate-700 bg-card shadow-2xs text-[11px] font-semibold hover:bg-muted cursor-pointer"
                    >
                      Detail
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </TooltipProvider>
    </div>
  );
}
