"use client";

import { useState } from "react";
import { useT, useI18nStore } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useOrderHistory, useRefreshAllOrders, useRefreshOrderStatus } from "@/hooks/use-orders";
import { useMarketplaceHistory } from "@/hooks/use-marketplace";
import {
  RefreshCw,
  Search,
  AlertCircle,
  Loader2,
  Wallet,
  ClipboardList,
  History,
  ShoppingCart,
  UserCheck,
  ChevronDown,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HistoryTab = "smm" | "accounts";

const SMM_STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Processing: "bg-blue-100 text-blue-800 border-blue-200",
  "In progress": "bg-indigo-100 text-indigo-800 border-indigo-200",
  Partial: "bg-orange-100 text-orange-800 border-orange-200",
  Success: "bg-green-100 text-green-800 border-green-200",
  Error: "bg-red-100 text-red-800 border-red-200",
  Failed: "bg-red-100 text-red-800 border-red-200",
};

const ACTION_STYLES: Record<string, { labelId: string; labelEn: string; colorClass: string }> = {
  buy: { labelId: "Pembelian Akun", labelEn: "Bought Account", colorClass: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  sell: { labelId: "Penjualan Akun", labelEn: "Sold Account", colorClass: "bg-blue-100 text-blue-800 border-blue-200" },
  list_for_sale: { labelId: "Daftar Jual", labelEn: "Listed for Sale", colorClass: "bg-amber-100 text-amber-800 border-amber-200" },
  cancel_sale: { labelId: "Batal Jual", labelEn: "Cancelled Listing", colorClass: "bg-slate-100 text-slate-800 border-slate-200" },
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("orders.history")}</h1>
          <p className="text-gray-500 mt-0.5 sm:mt-1 text-sm sm:text-base">
            {locale === "id"
              ? "Kelola riwayat pembelian layanan SMM dan transaksi jual beli akun Telegram Anda."
              : "Manage SMM services purchase history and your Telegram account buy/sell transactions."}
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl self-start sm:self-auto w-full sm:w-auto justify-center sm:justify-start">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-base sm:text-lg">{user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-2 border-b border-gray-200 pb-2 min-w-max sm:min-w-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                activeTab === t.id
                  ? "bg-primary-50 text-primary-700 border border-primary-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "smm" && <SmmOrdersHistoryView />}
      {activeTab === "accounts" && <AccountTransactionsHistoryView />}
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
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load SMM orders history</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">{_("orders.noOrders")}</h3>
        <p className="text-sm text-gray-500 mb-4">{_("orders.startOrdering")}</p>
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
          className="rounded-xl border-gray-200 shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshAll.isPending && "animate-spin")} />
          {_("orders.refreshAll")}
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="text-left py-3 px-4 font-medium text-gray-500">{_("orders.date")}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-500">{_("orders.services")}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-500">{_("orders.dataTarget")}</th>
              <th className="text-right py-3 px-4 font-medium text-gray-500">{_("orders.quantity")}</th>
              <th className="text-right py-3 px-4 font-medium text-gray-500">{_("orders.totalPrice")}</th>
              <th className="text-center py-3 px-4 font-medium text-gray-500">{_("orders.status")}</th>
              <th className="text-center py-3 px-4 font-medium text-gray-500">{_("orders.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-55/30 transition-colors">
                <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </td>
                <td className="py-3 px-4 max-w-[200px]">
                  <p className="truncate font-medium text-gray-900" title={order.service_name}>
                    {order.service_name}
                  </p>
                  {order.is_mass_order && (
                    <Badge variant="outline" className="text-[10px] mt-0.5 px-1.5 py-0">Mass</Badge>
                  )}
                </td>
                <td className="py-3 px-4 max-w-[150px]">
                  <p className="truncate text-gray-600" title={order.data_target}>{order.data_target}</p>
                </td>
                <td className="py-3 px-4 text-right text-gray-900 font-medium">
                  {order.quantity.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right text-gray-900 font-semibold">
                  Rp {order.total_price.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <Badge className={cn("border px-2 py-0.5 text-xs font-semibold rounded-full shadow-sm", SMM_STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800")}>
                    {order.status}
                  </Badge>
                  {order.start_count != null && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {order.start_count}/{order.remains ?? "-"}
                    </p>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {order.smm_order_id && (
                    <button
                      onClick={() => refreshOrder.mutate(order.id)}
                      disabled={refreshOrder.isPending}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title={_("orders.refreshStatus")}
                    >
                      <RefreshCw className={cn("h-4 w-4", refreshOrder.isPending && "animate-spin")} />
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
          <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate" title={order.service_name}>
                  {order.service_name}
                </p>
                {order.is_mass_order && (
                  <Badge variant="outline" className="text-[10px] mt-0.5">Mass</Badge>
                )}
              </div>
              <Badge className={cn("border flex-shrink-0 px-2 py-0.5 rounded-full text-xs shadow-sm", SMM_STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800")}>
                {order.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 pt-1">
              <span className="font-medium text-gray-400">{_("orders.dataTarget")}:</span>
              <span className="truncate text-gray-700" title={order.data_target}>{order.data_target}</span>

              <span className="font-medium text-gray-400">{_("orders.quantity")}:</span>
              <span className="text-gray-700">{order.quantity.toLocaleString()}</span>

              <span className="font-medium text-gray-400">{_("orders.totalPrice")}:</span>
              <span className="text-gray-800 font-semibold">Rp {order.total_price.toLocaleString()}</span>

              <span className="font-medium text-gray-400">{_("orders.date")}:</span>
              <span className="text-gray-700">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
            </div>

            {order.start_count != null && (
              <p className="text-[11px] text-gray-400 mt-1">
                Progress: {order.start_count}/{order.remains ?? "-"}
              </p>
            )}

            {order.smm_order_id && (
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  onClick={() => refreshOrder.mutate(order.id)}
                  disabled={refreshOrder.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  {_("orders.refreshStatus")}
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
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load account transactions history</p>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <History className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">
          {locale === "id" ? "Belum ada transaksi akun" : "No account transactions yet"}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {locale === "id" ? "Transaksi pembelian, penjualan, atau pendaftaran akun akan muncul di sini." : "Account purchases, sales, or listing history will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="text-left py-3 px-4 font-medium text-gray-500">
                {locale === "id" ? "Tanggal" : "Date"}
              </th>
              <th className="text-center py-3 px-4 font-medium text-gray-500">
                {locale === "id" ? "Jenis Transaksi" : "Transaction Type"}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-500">
                {locale === "id" ? "Akun (Phone / ID)" : "Account (Phone / ID)"}
              </th>
              <th className="text-right py-3 px-4 font-medium text-gray-500">
                {locale === "id" ? "Jumlah" : "Amount"}
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const style = ACTION_STYLES[log.action] || {
                labelId: log.action,
                labelEn: log.action,
                colorClass: "bg-gray-100 text-gray-800",
              };
              const actionLabel = locale === "id" ? style.labelId : style.labelEn;

              return (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-55/30 transition-colors">
                  <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Badge className={cn("border px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-sm", style.colorClass)}>
                      {actionLabel}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-gray-900">{log.phone || "-"}</div>
                    {log.telegram_id && (
                      <div className="text-[11px] text-gray-400">ID: {log.telegram_id}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <span className={cn(
                      "font-bold",
                      log.action === "buy" ? "text-red-650 text-red-600" :
                      log.action === "sell" ? "text-emerald-600" :
                      "text-gray-500 font-semibold"
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
            colorClass: "bg-gray-100 text-gray-800",
          };
          const actionLabel = locale === "id" ? style.labelId : style.labelEn;

          return (
            <div key={log.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <Badge className={cn("border px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-sm", style.colorClass)}>
                  {actionLabel}
                </Badge>
                <span className={cn(
                  "text-sm font-bold",
                  log.action === "buy" ? "text-red-600" :
                  log.action === "sell" ? "text-emerald-600" :
                  "text-gray-500 font-semibold"
                )}>
                  {log.action === "buy" ? "- " : log.action === "sell" ? "+ " : ""}
                  Rp {log.price?.toLocaleString() || 0}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 pt-1">
                <span className="font-medium text-gray-400">{locale === "id" ? "Telepon" : "Phone"}:</span>
                <span className="text-gray-800 font-medium">{log.phone || "-"}</span>

                {log.telegram_id && (
                  <>
                    <span className="font-medium text-gray-400">Telegram ID:</span>
                    <span className="text-gray-700">{log.telegram_id}</span>
                  </>
                )}

                <span className="font-medium text-gray-400">{locale === "id" ? "Waktu" : "Time"}:</span>
                <span className="text-gray-700">
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
