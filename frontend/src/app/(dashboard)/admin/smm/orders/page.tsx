"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSmmOrders,
  useAdminRefreshOrder,
  useAdminRefreshAllOrders,
} from "@/hooks/use-admin-smm";
import {
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  Search,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Processing: "bg-blue-100 text-blue-700 border-blue-200",
  "In progress": "bg-indigo-100 text-indigo-700 border-indigo-200",
  Partial: "bg-orange-100 text-orange-700 border-orange-200",
  Success: "bg-green-100 text-green-700 border-green-200",
  Error: "bg-red-100 text-red-700 border-red-200",
  Failed: "bg-red-100 text-red-700 border-red-200",
};

export default function SmmOrdersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading, error, refetch } = useAdminSmmOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    limit: 100,
  });
  const refreshOrder = useAdminRefreshOrder();
  const refreshAllMutation = useAdminRefreshAllOrders();
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  async function handleRefreshOrder(orderId: string) {
    try {
      await refreshOrder.mutateAsync(orderId);
      setActionMsg({ type: "success", text: "Order refreshed" });
    } catch {
      setActionMsg({ type: "error", text: "Refresh failed" });
    }
  }

  async function handleRefreshAll() {
    try {
      const result = await refreshAllMutation.mutateAsync();
      setActionMsg({ type: "success", text: `Refreshed ${result.refreshed} orders` });
    } catch {
      setActionMsg({ type: "error", text: "Refresh failed" });
    }
  }

  // Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access SMM orders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition shrink-0">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMM Orders</h1>
          <p className="text-gray-500 mt-1">Monitor users' SMM orders, check order status history, and update from providers</p>
        </div>
      </div>

      {actionMsg && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-xl text-sm",
            actionMsg.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          )}
        >
          {actionMsg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Toolbar — responsive stack */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or target..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm flex-1 sm:flex-none bg-white outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="In progress">In Progress</option>
            <option value="Partial">Partial</option>
            <option value="Success">Success</option>
            <option value="Error">Error</option>
            <option value="Failed">Failed</option>
          </select>
          <Button variant="outline" onClick={handleRefreshAll} disabled={refreshAllMutation.isPending} size="sm">
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Refresh All
          </Button>
          <Button variant="outline" onClick={() => refetch()} size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50/50 px-4 py-2 rounded-lg border border-gray-100 max-w-max">
          <ShoppingCart className="h-4 w-4 text-gray-400" />
          <span>Total Orders: <span className="font-semibold text-gray-900">{data.total}</span></span>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load orders</p>
        </div>
      ) : !data?.orders.length ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No orders found</p>
        </div>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="sm:hidden space-y-3">
            {data.orders.map((o) => (
              <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm break-all">{o.user_email}</p>
                    <p className="text-xs text-gray-400 font-mono">{o.id.slice(0, 8)}...</p>
                  </div>
                  <span
                    className={cn(
                      "inline-block text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0",
                      STATUS_COLORS[o.status] || "bg-gray-100 text-gray-700"
                    )}
                  >
                    {o.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{o.service_name}</p>
                <p className="text-xs text-gray-500 break-all" title={o.data_target}>
                  Target: {o.data_target}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-gray-600">{o.quantity.toLocaleString()} x {o.total_price.toLocaleString()}</span>
                  <button
                    onClick={() => handleRefreshOrder(o.id)}
                    disabled={refreshOrder.isPending}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Refresh Status"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table layout */}
          <div className="hidden sm:block overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 whitespace-nowrap">User</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Service</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Target</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Qty</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Price</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Status</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{o.user_email}</p>
                      <p className="text-xs text-gray-400 font-mono">{o.id.slice(0, 8)}...</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-gray-900">{o.service_name}</p>
                      <p className="text-xs text-gray-400">{o.category}</p>
                    </td>
                    <td className="py-3 px-4 max-w-[200px] truncate text-gray-600" title={o.data_target}>
                      {o.data_target}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600 whitespace-nowrap">{o.quantity.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600 whitespace-nowrap">{o.total_price.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={cn(
                          "inline-block text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap",
                          STATUS_COLORS[o.status] || "bg-gray-100 text-gray-700"
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleRefreshOrder(o.id)}
                        disabled={refreshOrder.isPending}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Refresh Status"
                      >
                        <RefreshCw className={cn("h-4 w-4", refreshOrder.isPending && "animate-spin")} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
