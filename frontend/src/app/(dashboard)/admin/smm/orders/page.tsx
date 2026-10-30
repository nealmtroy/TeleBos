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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataPagination } from "@/components/ui/pagination";

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50",
  Processing: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/50",
  "In progress": "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/50",
  Partial: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50",
  Success: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50",
  Error: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50",
  Failed: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50",
};

export default function SmmOrdersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, error, refetch } = useAdminSmmOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);
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
        <Link
          href="/admin/dashboard"
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition shadow-2xs shrink-0"
          aria-label="Kembali ke Dashboard Admin"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">SMM Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor users&apos; SMM orders, check order status history, and update from providers</p>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="admin-smm-orders-search"
            name="search"
            aria-label="Search by email or target..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or target..."
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-slate-300 dark:border-slate-700 text-foreground placeholder:text-muted-foreground rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 shadow-2xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter || "all"}
            onValueChange={(val) => setStatusFilter(val === "all" ? "" : val)}
          >
            <SelectTrigger className="w-full sm:w-[170px] h-10 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-card text-foreground shadow-2xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Processing">Processing</SelectItem>
              <SelectItem value="In progress">In Progress</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Success">Success</SelectItem>
              <SelectItem value="Error">Error</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRefreshAll} disabled={refreshAllMutation.isPending} size="sm" className="border-slate-300 dark:border-slate-700 bg-card shadow-2xs">
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Refresh All
          </Button>
          <Button variant="outline" onClick={() => refetch()} size="sm" className="border-slate-300 dark:border-slate-700 bg-card shadow-2xs">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 px-4 py-2 rounded-lg border border-border max-w-max">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span>Total Orders: <span className="font-semibold text-foreground">{data.total}</span></span>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load orders</p>
        </div>
      ) : !data?.orders.length ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border shadow-xs">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">No orders found</p>
        </div>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="sm:hidden space-y-3">
            {data.orders.map((o) => (
              <div key={o.id} className="bg-card rounded-xl border border-border p-3 space-y-2 shadow-xs text-card-foreground">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-sm break-all">{o.user_email}</p>
                    <p className="text-xs text-muted-foreground font-mono">{o.id.slice(0, 8)}...</p>
                  </div>
                  <span
                    className={cn(
                      "inline-block text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0",
                      STATUS_COLORS[o.status] || "bg-muted text-foreground border-border"
                    )}
                  >
                    {o.status}
                  </span>
                </div>
                <p className="text-sm text-foreground">{o.service_name}</p>
                <p className="text-xs text-muted-foreground break-all" title={o.data_target}>
                  Target: {o.data_target}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">{o.quantity.toLocaleString()} x {o.total_price.toLocaleString()}</span>
                  <button
                    onClick={() => handleRefreshOrder(o.id)}
                    disabled={refreshOrder.isPending}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-foreground hover:bg-muted shadow-2xs transition-colors"
                    title="Refresh Status"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table layout */}
          <div className="hidden sm:block bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">User</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Service</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Target</TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-right whitespace-nowrap">Qty</TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-right whitespace-nowrap">Price</TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-center whitespace-nowrap">Status</TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-center whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/30">
                    <TableCell className="font-normal">
                      <p className="font-medium text-foreground">{o.user_email}</p>
                      <p className="text-xs text-muted-foreground font-mono">{o.id.slice(0, 8)}...</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-foreground font-normal">{o.service_name}</p>
                      <p className="text-xs text-muted-foreground">{o.category}</p>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={o.data_target}>
                      {o.data_target}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground whitespace-nowrap">{o.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground whitespace-nowrap">{o.total_price.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-block text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap",
                          STATUS_COLORS[o.status] || "bg-muted text-foreground border-border"
                        )}
                      >
                        {o.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleRefreshOrder(o.id)}
                        disabled={refreshOrder.isPending}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-foreground hover:bg-muted shadow-2xs transition-colors"
                        title="Refresh Status"
                      >
                        <RefreshCw className={cn("h-4 w-4", refreshOrder.isPending && "animate-spin")} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-card rounded-xl border border-border text-xs text-muted-foreground shadow-2xs">
              <p>
                Showing <span className="font-semibold text-foreground">{offset + 1}</span>–
                <span className="font-semibold text-foreground">{Math.min(offset + PAGE_SIZE, total)}</span> of{" "}
                <span className="font-semibold text-foreground">{total}</span> orders
              </p>
              <DataPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                className="w-auto mx-0"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
