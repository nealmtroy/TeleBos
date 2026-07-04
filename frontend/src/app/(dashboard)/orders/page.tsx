"use client";

import { useState } from "react";
import { useT, useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useOrderHistory, useRefreshAllOrders, useRefreshOrderStatus } from "@/hooks/use-orders";
import { useMarketplaceHistory } from "@/hooks/use-marketplace";
import {
  RefreshCw,
  AlertCircle,
  Wallet,
  ClipboardList,
  History,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HistoryTab = "smm" | "accounts";

const SMM_STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
  Processing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30",
  "In progress": "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30",
  Partial: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30",
  Success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
  Error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30",
  Failed: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30",
};

const ACTION_STYLES: Record<string, { labelId: string; labelEn: string; colorClass: string }> = {
  buy: { labelId: "Pembelian Akun", labelEn: "Bought Account", colorClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30" },
  sell: { labelId: "Penjualan Akun", labelEn: "Sold Account", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30" },
  list_for_sale: { labelId: "Daftar Jual", labelEn: "Listed for Sale", colorClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30" },
  cancel_sale: { labelId: "Batal Jual", labelEn: "Cancelled Listing", colorClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/50" },
};

export default function OrderHistoryPage() {
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<HistoryTab>("smm");

  const tabs = [
    { id: "smm" as HistoryTab, label: _("orders.smmHistory") || "SMM Orders", icon: ClipboardList },
    { id: "accounts" as HistoryTab, label: _("orders.accountHistory") || "Account Transactions", icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{_("orders.history") || "History"}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {locale === "id"
              ? "Kelola riwayat pembelian layanan SMM dan transaksi jual beli akun Telegram Anda."
              : "Manage SMM services purchase history and your Telegram account buy/sell transactions."}
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/85 dark:border-slate-800 rounded-xl self-start sm:self-auto">
            <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-sm font-bold text-slate-900 dark:text-slate-100 ml-1">Rp {user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation (Pill container) */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl flex gap-1 w-fit border border-slate-200/60 dark:border-slate-800">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                  activeTab === t.id
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-black/5 dark:ring-slate-700/50"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "smm" && <SmmOrdersHistoryView />}
        {activeTab === "accounts" && <AccountTransactionsHistoryView />}
      </div>
    </div>
  );
}

function SmmOrdersHistoryView() {
  const _ = useT();
  const { data: orders, isLoading, error } = useOrderHistory();
  const refreshOrder = useRefreshOrderStatus();
  const refreshAll = useRefreshAllOrders();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-xl text-red-700 dark:text-red-400">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm font-medium">Failed to load SMM orders history</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">{_("orders.noOrders") || "No orders found"}</h3>
        <p className="text-xs text-slate-400">{_("orders.startOrdering") || "Start ordering services from the sidebar."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshAll.mutate()}
          disabled={refreshAll.isPending}
          className="rounded-xl border-slate-200 dark:border-slate-800 text-xs font-semibold h-9 shadow-sm"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-2 transition-transform duration-500", refreshAll.isPending && "animate-spin")} />
          {_("orders.refreshAll") || "Refresh All"}
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden bg-white dark:bg-slate-950/10 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/40 text-slate-500 font-semibold uppercase tracking-wider text-left">
              <th className="py-3 px-4 font-bold">{_("orders.date") || "Date"}</th>
              <th className="py-3 px-4 font-bold">{_("orders.services") || "Service"}</th>
              <th className="py-3 px-4 font-bold">{_("orders.dataTarget") || "Target"}</th>
              <th className="py-3 px-4 font-bold text-right">{_("orders.quantity") || "Quantity"}</th>
              <th className="py-3 px-4 font-bold text-right">{_("orders.totalPrice") || "Total"}</th>
              <th className="py-3 px-4 font-bold text-center">{_("orders.status") || "Status"}</th>
              <th className="py-3 px-4 font-bold text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10 transition-colors text-slate-700 dark:text-slate-300">
                <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </td>
                <td className="py-3.5 px-4 max-w-[200px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate font-semibold text-slate-900 dark:text-slate-100" title={order.service_name}>
                      {order.service_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-900 px-1 py-0.2 rounded">
                        ID: {order.service_id}
                      </span>
                      {order.is_mass_order && (
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-900 px-1 rounded uppercase tracking-wide">Mass</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 max-w-[150px]">
                  <p className="truncate text-slate-500 font-mono text-[11px]" title={order.data_target}>{order.data_target}</p>
                </td>
                <td className="py-3.5 px-4 text-right font-medium text-slate-900 dark:text-slate-150">
                  {order.quantity.toLocaleString()}
                </td>
                <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100 font-bold whitespace-nowrap">
                  Rp {order.total_price.toLocaleString()}
                </td>
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm uppercase tracking-wide", SMM_STATUS_COLORS[order.status] || "bg-slate-50 text-slate-700 border-slate-200")}>
                    {order.status}
                  </Badge>
                  {order.start_count != null && (
                    <p className="text-[10px] text-slate-450 mt-1 font-semibold">
                      {order.start_count}/{order.remains ?? "-"}
                    </p>
                  )}
                </td>
                <td className="py-3.5 px-4 text-center">
                  {order.smm_order_id && (
                    <button
                      onClick={() => refreshOrder.mutate(order.id)}
                      disabled={refreshOrder.isPending}
                      className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition-colors"
                      title={_("orders.refreshStatus") || "Refresh Status"}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-900 pb-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate" title={order.service_name}>
                  {order.service_name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-900 px-1 rounded">
                    ID: {order.service_id}
                  </span>
                  {order.is_mass_order && (
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-900 px-1 rounded uppercase tracking-wide">Mass</span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={cn("flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", SMM_STATUS_COLORS[order.status] || "bg-slate-50 text-slate-700 border-slate-200")}>
                {order.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-1">
              <span className="font-semibold text-slate-400">{_("orders.dataTarget") || "Target"}:</span>
              <span className="truncate text-slate-700 dark:text-slate-300 font-mono text-[11px]" title={order.data_target}>{order.data_target}</span>

              <span className="font-semibold text-slate-400">{_("orders.quantity") || "Quantity"}:</span>
              <span className="text-slate-700 dark:text-slate-300 font-semibold">{order.quantity.toLocaleString()}</span>

              <span className="font-semibold text-slate-400">{_("orders.totalPrice") || "Total"}:</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">Rp {order.total_price.toLocaleString()}</span>

              <span className="font-semibold text-slate-400">{_("orders.date") || "Date"}:</span>
              <span className="text-slate-500">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
            </div>

            {order.start_count != null && (
              <p className="text-[11px] text-slate-400 mt-2 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                Progress: <span className="font-bold text-slate-750 dark:text-slate-250">{order.start_count}</span> / {order.remains ?? "-"}
              </p>
            )}

            {order.smm_order_id && (
              <div className="flex justify-end pt-2.5 border-t border-slate-100 dark:border-slate-900">
                <button
                  onClick={() => refreshOrder.mutate(order.id)}
                  disabled={refreshOrder.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 rounded-xl transition-colors"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  {_("orders.refreshStatus") || "Refresh Status"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountTransactionsHistoryView() {
  const locale = useI18nStore((s) => s.locale);
  const { data: logs, isLoading, error } = useMarketplaceHistory();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-xl text-red-700 dark:text-red-400">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm font-medium">Failed to load account transactions history</p>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <History className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
          {locale === "id" ? "Belum ada transaksi akun" : "No account transactions yet"}
        </h3>
        <p className="text-xs text-slate-400">
          {locale === "id" ? "Transaksi pembelian, penjualan, atau pendaftaran akun akan muncul di sini." : "Account purchases, sales, or listing history will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden bg-white dark:bg-slate-950/10 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/40 text-slate-500 font-semibold uppercase tracking-wider text-left">
              <th className="py-3 px-4 font-bold">
                {locale === "id" ? "Tanggal" : "Date"}
              </th>
              <th className="py-3 px-4 font-bold text-center">
                {locale === "id" ? "Jenis Transaksi" : "Transaction Type"}
              </th>
              <th className="py-3 px-4 font-bold">
                {locale === "id" ? "Akun (Phone / ID)" : "Account (Phone / ID)"}
              </th>
              <th className="py-3 px-4 font-bold text-right">
                {locale === "id" ? "Jumlah" : "Amount"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
            {logs.map((log) => {
              const style = ACTION_STYLES[log.action] || {
                labelId: log.action,
                labelEn: log.action,
                colorClass: "bg-slate-100 text-slate-700 border-slate-200",
              };
              const actionLabel = locale === "id" ? style.labelId : style.labelEn;

              return (
                <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10 transition-colors text-slate-700 dark:text-slate-300">
                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Badge variant="outline" className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm uppercase tracking-wide", style.colorClass)}>
                      {actionLabel}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{log.phone || "-"}</div>
                    {log.telegram_id && (
                      <div className="text-[10px] text-slate-400 font-mono">ID: {log.telegram_id}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <span className={cn(
                      "font-bold text-sm",
                      log.action === "buy" ? "text-red-650 text-red-600" :
                      log.action === "sell" ? "text-emerald-600" :
                      "text-slate-550 font-semibold"
                    )}>
                      {log.action === "buy" ? "- " : log.action === "sell" ? "+ " : ""}
                      Rp {log.price?.toLocaleString() || 0}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {logs.map((log) => {
          const style = ACTION_STYLES[log.action] || {
            labelId: log.action,
            labelEn: log.action,
            colorClass: "bg-slate-100 text-slate-700 border-slate-200",
          };
          const actionLabel = locale === "id" ? style.labelId : style.labelEn;

          return (
            <div key={log.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-2">
                <Badge variant="outline" className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm uppercase tracking-wide", style.colorClass)}>
                  {actionLabel}
                </Badge>
                <span className={cn(
                  "text-sm font-bold",
                  log.action === "buy" ? "text-red-600" :
                  log.action === "sell" ? "text-emerald-600" :
                  "text-slate-500 font-semibold"
                )}>
                  {log.action === "buy" ? "- " : log.action === "sell" ? "+ " : ""}
                  Rp {log.price?.toLocaleString() || 0}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-1">
                <span className="font-semibold text-slate-400">{locale === "id" ? "Telepon" : "Phone"}:</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{log.phone || "-"}</span>

                {log.telegram_id && (
                  <>
                    <span className="font-semibold text-slate-400">Telegram ID:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">{log.telegram_id}</span>
                  </>
                )}

                <span className="font-semibold text-slate-400">{locale === "id" ? "Waktu" : "Time"}:</span>
                <span className="text-slate-550">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
