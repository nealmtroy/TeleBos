"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HistoryTab = "smm" | "accounts";

const SMM_STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Processing: "bg-blue-50 text-blue-700 border-blue-200",
  "In progress": "bg-indigo-50 text-indigo-700 border-indigo-200",
  Partial: "bg-orange-50 text-orange-700 border-orange-200",
  Success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Error: "bg-red-50 text-red-700 border-red-200",
  Failed: "bg-red-50 text-red-700 border-red-200",
};

const ACTION_STYLES: Record<string, { labelId: string; labelEn: string; colorClass: string }> = {
  buy: { labelId: "Pembelian Akun", labelEn: "Bought Account", colorClass: "bg-red-50 text-red-700 border-red-200" },
  sell: { labelId: "Penjualan Akun", labelEn: "Sold Account", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  list_for_sale: { labelId: "Daftar Jual", labelEn: "Listed for Sale", colorClass: "bg-amber-50 text-amber-700 border-amber-200" },
  cancel_sale: { labelId: "Batal Jual", labelEn: "Cancelled Listing", colorClass: "bg-gray-100 text-gray-700 border-gray-200" },
};

const ITEMS_PER_PAGE = 10;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-250 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("orders.history") || "History"}</h1>
          <p className="text-gray-550 mt-1 text-sm">
            {locale === "id"
              ? "Kelola riwayat pembelian layanan SMM dan transaksi jual beli akun Telegram Anda."
              : "Manage SMM services purchase history and your Telegram account buy/sell transactions."}
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl self-start sm:self-auto shadow-sm">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-sm font-bold text-emerald-700 ml-1">Rp {user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation (Underline style) */}
      <div className="border-b border-gray-200 w-full">
        <div className="flex gap-6 -mb-px overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-2 pb-3.5 px-1 text-sm font-semibold transition-all border-b-2 whitespace-nowrap focus:outline-none",
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
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
  const locale = useI18nStore((s) => s.locale);
  const { data: orders, isLoading, error } = useOrderHistory();
  const refreshOrder = useRefreshOrderStatus();
  const refreshAll = useRefreshAllOrders();
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => {
    return orders ? Math.ceil(orders.length / ITEMS_PER_PAGE) : 0;
  }, [orders]);

  const paginatedOrders = useMemo(() => {
    return orders ? orders.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE) : [];
  }, [orders, page]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-white border border-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-805">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm font-medium">Failed to load SMM orders history</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <h3 className="font-semibold text-gray-900 text-sm mb-1">{_("orders.noOrders") || "No orders found"}</h3>
        <p className="text-xs text-gray-550">{_("orders.startOrdering") || "Start ordering services from the sidebar."}</p>
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
          className="rounded-xl border-gray-200 text-xs font-semibold h-9 shadow-sm bg-white hover:bg-gray-50 text-gray-800"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-2 transition-transform duration-500", refreshAll.isPending && "animate-spin")} />
          {_("orders.refreshAll") || "Refresh All"}
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/75 text-gray-500 font-bold uppercase tracking-wider text-left">
              <th className="py-3 px-4">{_("orders.date") || "Date"}</th>
              <th className="py-3 px-4">{_("orders.services") || "Service"}</th>
              <th className="py-3 px-4">{_("orders.dataTarget") || "Target"}</th>
              <th className="py-3 px-4 text-right">{_("orders.quantity") || "Quantity"}</th>
              <th className="py-3 px-4 text-right">{_("orders.totalPrice") || "Total"}</th>
              <th className="py-3 px-4 text-center">{_("orders.status") || "Status"}</th>
              <th className="py-3 px-4 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-150">
            {paginatedOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50/50 transition-colors text-gray-800 bg-white">
                <td className="py-3.5 px-4 whitespace-nowrap text-gray-500">
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </td>
                <td className="py-3.5 px-4 max-w-[200px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate font-bold text-gray-900" title={order.service_name}>
                      {order.service_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-50 px-1 py-0.5 rounded border border-gray-100">
                        ID: {order.service_id}
                      </span>
                      {order.is_mass_order && (
                        <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1 rounded uppercase tracking-wide">Mass</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 max-w-[150px]">
                  <p className="truncate text-gray-600 font-mono text-[11px]" title={order.data_target}>{order.data_target}</p>
                </td>
                <td className="py-3.5 px-4 text-right font-semibold text-gray-900">
                  {order.quantity.toLocaleString()}
                </td>
                <td className="py-3.5 px-4 text-right text-gray-900 font-bold whitespace-nowrap">
                  Rp {order.total_price.toLocaleString()}
                </td>
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  <Badge variant="outline" className={cn("px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm uppercase tracking-wide bg-white", SMM_STATUS_COLORS[order.status] || "bg-gray-50 text-gray-700 border-gray-200")}>
                    {order.status}
                  </Badge>
                  {order.start_count != null && (
                    <p className="text-[10px] text-gray-400 mt-1 font-semibold">
                      {order.start_count}/{order.remains ?? "-"}
                    </p>
                  )}
                </td>
                <td className="py-3.5 px-4 text-center">
                  {order.smm_order_id && (
                    <button
                      onClick={() => refreshOrder.mutate(order.id)}
                      disabled={refreshOrder.isPending}
                      className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
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
        {paginatedOrders.map((order) => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm text-gray-950">
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate" title={order.service_name}>
                  {order.service_name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono font-bold text-gray-450 bg-gray-50 px-1 py-0.5 rounded border border-gray-100">
                    ID: {order.service_id}
                  </span>
                  {order.is_mass_order && (
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1 rounded uppercase tracking-wide">Mass</span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={cn("flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white", SMM_STATUS_COLORS[order.status] || "bg-gray-50 text-gray-700 border-gray-200")}>
                {order.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-1">
              <span className="font-semibold text-gray-500">{_("orders.dataTarget") || "Target"}:</span>
              <span className="truncate text-gray-800 font-mono text-[11px] font-semibold text-right" title={order.data_target}>{order.data_target}</span>

              <span className="font-semibold text-gray-500">{_("orders.quantity") || "Quantity"}:</span>
              <span className="text-gray-800 font-bold text-right">{order.quantity.toLocaleString()}</span>

              <span className="font-semibold text-gray-500">{_("orders.totalPrice") || "Total"}:</span>
              <span className="text-primary-600 font-bold text-right">Rp {order.total_price.toLocaleString()}</span>

              <span className="font-semibold text-gray-500">{_("orders.date") || "Date"}:</span>
              <span className="text-gray-700 font-medium text-right">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
            </div>

            {order.start_count != null && (
              <p className="text-[11px] text-gray-600 mt-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                Progress: <span className="font-bold text-gray-900">{order.start_count}</span> / {order.remains ?? "-"}
              </p>
            )}

            {order.smm_order_id && (
              <div className="flex justify-end pt-3 border-t border-gray-100">
                <button
                  onClick={() => refreshOrder.mutate(order.id)}
                  disabled={refreshOrder.isPending}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-gray-50 rounded-xl transition-colors border border-gray-200 shadow-sm"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  {_("orders.refreshStatus") || "Refresh Status"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border border-gray-200 bg-white px-4 py-3 rounded-2xl sm:px-6 shadow-sm">
          <div className="flex flex-1 justify-between sm:hidden">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-xl"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-xl"
            >
              Next
            </Button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-gray-550">
                {locale === "id" ? "Menampilkan" : "Showing"}{" "}
                <span className="font-bold text-gray-900">{((page - 1) * ITEMS_PER_PAGE) + 1}</span>{" "}
                {locale === "id" ? "sampai" : "to"}{" "}
                <span className="font-bold text-gray-900">{Math.min(page * ITEMS_PER_PAGE, orders.length)}</span>{" "}
                {locale === "id" ? "dari" : "of"}{" "}
                <span className="font-bold text-gray-900">{orders.length}</span>{" "}
                {locale === "id" ? "pesanan" : "orders"}
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm gap-1" aria-label="Pagination">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-xl border-gray-200 px-3"
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1;
                  if (totalPages > 5 && pNum !== 1 && pNum !== totalPages && Math.abs(pNum - page) > 1) {
                    if (pNum === 2 && page > 3) {
                      return <span key={pNum} className="px-2 text-gray-400">...</span>;
                    }
                    if (pNum === totalPages - 1 && page < totalPages - 2) {
                      return <span key={pNum} className="px-2 text-gray-400">...</span>;
                    }
                    return null;
                  }
                  return (
                    <Button
                      key={pNum}
                      variant={page === pNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(pNum)}
                      className={cn(
                        "rounded-xl px-3",
                        page === pNum ? "bg-primary text-white hover:bg-primary/90" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {pNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-xl border-gray-200 px-3"
                >
                  Next
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountTransactionsHistoryView() {
  const locale = useI18nStore((s) => s.locale);
  const { data: logs, isLoading, error } = useMarketplaceHistory();
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => {
    return logs ? Math.ceil(logs.length / ITEMS_PER_PAGE) : 0;
  }, [logs]);

  const paginatedLogs = useMemo(() => {
    return logs ? logs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE) : [];
  }, [logs, page]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-white border border-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm font-medium">Failed to load account transactions history</p>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <History className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <h3 className="font-semibold text-gray-900 text-sm mb-1">
          {locale === "id" ? "Belum ada transaksi akun" : "No account transactions yet"}
        </h3>
        <p className="text-xs text-gray-550">
          {locale === "id" ? "Transaksi pembelian, penjualan, atau pendaftaran akun akan muncul di sini." : "Account purchases, sales, or listing history will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/75 text-gray-500 font-bold uppercase tracking-wider text-left">
              <th className="py-3 px-4">
                {locale === "id" ? "Tanggal" : "Date"}
              </th>
              <th className="py-3 px-4 text-center">
                {locale === "id" ? "Jenis Transaksi" : "Transaction Type"}
              </th>
              <th className="py-3 px-4">
                {locale === "id" ? "Akun (Phone / ID)" : "Account (Phone / ID)"}
              </th>
              <th className="py-3 px-4 text-right">
                {locale === "id" ? "Jumlah" : "Amount"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-150 bg-white">
            {paginatedLogs.map((log) => {
              const style = ACTION_STYLES[log.action] || {
                labelId: log.action,
                labelEn: log.action,
                colorClass: "bg-gray-100 text-gray-700 border-gray-200",
              };
              const actionLabel = locale === "id" ? style.labelId : style.labelEn;

              return (
                <tr key={log.id} className="hover:bg-gray-50/50 transition-colors text-gray-800">
                  <td className="py-3.5 px-4 text-gray-550 whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Badge variant="outline" className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm uppercase tracking-wide bg-white", style.colorClass)}>
                      {actionLabel}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-gray-900">{log.phone || "-"}</div>
                    {log.telegram_id && (
                      <div className="text-[10px] text-gray-450 font-mono">ID: {log.telegram_id}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <span className={cn(
                      "font-extrabold text-sm",
                      log.action === "buy" ? "text-red-650 text-red-600" :
                      log.action === "sell" ? "text-emerald-600" :
                      "text-gray-800 font-semibold"
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
        {paginatedLogs.map((log) => {
          const style = ACTION_STYLES[log.action] || {
            labelId: log.action,
            labelEn: log.action,
            colorClass: "bg-gray-100 text-gray-700 border-gray-200",
          };
          const actionLabel = locale === "id" ? style.labelId : style.labelEn;

          return (
            <div key={log.id} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3.5 shadow-sm text-gray-950">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <Badge variant="outline" className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm uppercase tracking-wide bg-white", style.colorClass)}>
                  {actionLabel}
                </Badge>
                <span className={cn(
                  "text-sm font-extrabold",
                  log.action === "buy" ? "text-red-600" :
                  log.action === "sell" ? "text-emerald-600" :
                  "text-gray-850 font-semibold"
                )}>
                  {log.action === "buy" ? "- " : log.action === "sell" ? "+ " : ""}
                  Rp {log.price?.toLocaleString() || 0}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-1">
                <span className="font-semibold text-gray-500">{locale === "id" ? "Telepon" : "Phone"}:</span>
                <span className="text-gray-800 font-bold text-right">{log.phone || "-"}</span>

                {log.telegram_id && (
                  <>
                    <span className="font-semibold text-gray-500">Telegram ID:</span>
                    <span className="text-gray-700 font-mono text-[11px] text-right">{log.telegram_id}</span>
                  </>
                )}

                <span className="font-semibold text-gray-500">{locale === "id" ? "Waktu" : "Time"}:</span>
                <span className="text-gray-650 font-medium text-right">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border border-gray-200 bg-white px-4 py-3 rounded-2xl sm:px-6 shadow-sm">
          <div className="flex flex-1 justify-between sm:hidden">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-xl"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-xl"
            >
              Next
            </Button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-gray-550">
                {locale === "id" ? "Menampilkan" : "Showing"}{" "}
                <span className="font-bold text-gray-900">{((page - 1) * ITEMS_PER_PAGE) + 1}</span>{" "}
                {locale === "id" ? "sampai" : "to"}{" "}
                <span className="font-bold text-gray-900">{Math.min(page * ITEMS_PER_PAGE, logs.length)}</span>{" "}
                {locale === "id" ? "dari" : "of"}{" "}
                <span className="font-bold text-gray-900">{logs.length}</span>{" "}
                {locale === "id" ? "transaksi" : "transactions"}
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm gap-1" aria-label="Pagination">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-xl border-gray-200 px-3"
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1;
                  if (totalPages > 5 && pNum !== 1 && pNum !== totalPages && Math.abs(pNum - page) > 1) {
                    if (pNum === 2 && page > 3) {
                      return <span key={pNum} className="px-2 text-gray-400">...</span>;
                    }
                    if (pNum === totalPages - 1 && page < totalPages - 2) {
                      return <span key={pNum} className="px-2 text-gray-400">...</span>;
                    }
                    return null;
                  }
                  return (
                    <Button
                      key={pNum}
                      variant={page === pNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(pNum)}
                      className={cn(
                        "rounded-xl px-3",
                        page === pNum ? "bg-primary text-white hover:bg-primary/90" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {pNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-xl border-gray-200 px-3"
                >
                  Next
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
