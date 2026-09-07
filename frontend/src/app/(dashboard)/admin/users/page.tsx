"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminUsers,
  useAdminStats,
  useUpdateBalance,
  useUpdateRole,
  useDeleteUser,
  type AdminUser,
} from "@/hooks/use-admin";
import {
  Search,
  Shield,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  Loader2,
  RefreshCw,
  UserCog,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Radio,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, formatDate } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  premium: "bg-amber-100 text-amber-700 border-amber-200",
  pro: "bg-blue-100 text-blue-700 border-blue-200",
  basic: "bg-gray-100 text-gray-700 border-gray-200",
};

const PAGE_SIZE = 10;

export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 mt-6">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access the admin panel.</p>
      </div>
    );
  }

  return <UsersContent />;
}

function UsersContent() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const offset = (page - 1) * PAGE_SIZE;
  const { data, isLoading, error, refetch, isFetching } = useAdminUsers(
    debouncedSearch || undefined,
    PAGE_SIZE,
    offset
  );
  const { data: stats } = useAdminStats();

  const updateBalance = useUpdateBalance();
  const updateRole = useUpdateRole();
  const deleteUser = useDeleteUser();

  const [balanceModal, setBalanceModal] = useState<{ user: AdminUser; type: "add" | "deduct" } | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  async function handleBalanceAction() {
    if (!balanceModal || !balanceAmount) return;
    const amount = parseInt(balanceAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await updateBalance.mutateAsync({
        userId: balanceModal.user.id,
        amount: balanceModal.type === "add" ? amount : -amount,
      });
      setActionMsg({ type: "success", text: _("admin.balanceUpdated") || "Balance updated successfully" });
      setBalanceModal(null);
      setBalanceAmount("");
      if (detailUser && detailUser.id === balanceModal.user.id) {
        setDetailUser({
          ...detailUser,
          balance: Math.max(0, detailUser.balance + (balanceModal.type === "add" ? amount : -amount)),
        });
      }
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed to update balance" });
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateRole.mutateAsync({ userId, role });
      setActionMsg({ type: "success", text: _("admin.roleUpdated") || "Role updated successfully" });
      if (detailUser && detailUser.id === userId) {
        setDetailUser({ ...detailUser, role });
      }
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed to update role" });
    }
  }

  async function handleDeleteUser() {
    if (!deleteConfirm) return;
    try {
      await deleteUser.mutateAsync(deleteConfirm.id);
      setActionMsg({ type: "success", text: "User deleted successfully" });
      setDeleteConfirm(null);
      if (detailUser?.id === deleteConfirm.id) {
        setDetailUser(null);
      }
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed to delete user" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{_("admin.users")}</h1>
          <p className="text-xs text-gray-500 mt-1">{_("admin.userManagement")}</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-9 px-3 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-blue-600")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Platform Telemetry KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Telegram Accounts Overview */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {_("admin.connectedAccounts") || "Connected Accounts"}
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {(stats?.total_accounts_connected ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Smartphone className="h-5 w-5" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 text-[11px]">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
                🟢 {stats?.accounts_active ?? 0} {_("admin.activeAccounts") || "Active"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold border border-amber-100">
                🟡 {stats?.accounts_limited ?? 0} {_("admin.limitedAccounts") || "Limited"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-semibold border border-rose-100">
                🔴 {stats?.accounts_expired ?? 0} {_("admin.expiredAccounts") || "Expired"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Broadcast Activity Overview */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {_("admin.broadcastStats") || "Broadcast Operations"}
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {(stats?.total_broadcast_jobs ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Radio className="h-5 w-5" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 text-[11px]">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                {stats?.broadcast_running ?? 0} {_("admin.broadcastRunning") || "Running"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-100">
                🔵 {stats?.broadcast_completed ?? 0} {_("admin.broadcastFinished") || "Finished"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-semibold border border-rose-100">
                🔴 {stats?.broadcast_failed ?? 0} {_("admin.broadcastFailed") || "Failed"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Platform Users Overview */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {_("admin.totalUsers") || "Platform Users"}
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {(stats?.total_users ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 text-[11px]">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-50 text-gray-700 font-medium border border-gray-200">
                Basic: {stats?.total_basic_users ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-100">
                Pro: {stats?.total_pro_users ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-100">
                Premium: {stats?.total_premium_users ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-medium border border-purple-100">
                Owner: {stats?.total_owner_users ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Notification Message */}
      {actionMsg && (
        <div
          className={cn(
            "flex items-center gap-2 p-3.5 rounded-xl text-xs font-medium shadow-sm transition-all",
            actionMsg.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          )}
        >
          {actionMsg.type === "success" ? <RefreshCw className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Main Table Card */}
      <Card className="border border-gray-200 overflow-hidden shadow-sm">
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={_("admin.searchUsers") || "Search by email or name..."}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
          </div>
          {data && (
            <div className="text-xs text-gray-500 self-end sm:self-center font-medium">
              Showing <span className="font-semibold text-gray-900">{data.users.length}</span> of{" "}
              <span className="font-semibold text-gray-900">{data.total}</span> users
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4 min-w-[200px]">{_("admin.email")}</th>
                <th className="py-3.5 px-4 text-center">{_("admin.role")}</th>
                <th className="py-3.5 px-4 text-right">{_("admin.balance")}</th>
                <th className="py-3.5 px-4 min-w-[180px]">{_("admin.connectedAccounts") || "Accounts"}</th>
                <th className="py-3.5 px-4 min-w-[180px]">{_("admin.broadcastStats") || "Broadcasts"}</th>
                <th className="py-3.5 px-4 text-center">{_("admin.orders")}</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-36" /></td>
                    <td className="py-4 px-4"><div className="h-5 bg-gray-100 rounded w-16 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-20 ml-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-8 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-6 bg-gray-100 rounded w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-red-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                    <p className="font-semibold text-sm">Failed to load users</p>
                  </td>
                </tr>
              ) : !data || data.users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <UserCog className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium text-gray-600 text-sm">No users found</p>
                    <p className="text-xs text-gray-400 mt-0.5">Try adjusting your search criteria</p>
                  </td>
                </tr>
              ) : (
                data.users.map((u: AdminUser) => {
                  const connected = u.connected_accounts ?? 0;
                  const activeAcc = u.active_accounts ?? 0;
                  const expiredAcc = u.expired_accounts ?? 0;
                  const limitedAcc = u.limited_accounts ?? 0;

                  const bcRunning = u.broadcast_running ?? 0;
                  const bcFinished = u.broadcast_finished ?? 0;
                  const bcFailed = u.broadcast_failed ?? 0;
                  const bcTotal = u.broadcast_total ?? 0;

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* User & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-xs shrink-0 border border-gray-200">
                            {u.email ? u.email[0].toUpperCase() : "U"}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate max-w-[200px]">{u.email}</p>
                            <p className="text-[11px] text-gray-500 truncate max-w-[200px]">
                              {u.full_name || "—"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className={cn(
                            "text-xs font-semibold px-2 py-1 rounded-lg border transition focus:outline-none focus:ring-1 focus:ring-primary-500",
                            ROLE_COLORS[u.role] || "bg-gray-100 text-gray-700"
                          )}
                          disabled={updateRole.isPending}
                        >
                          <option value="basic">Basic</option>
                          <option value="pro">Pro</option>
                          <option value="premium">Premium</option>
                          <option value="owner">Owner</option>
                        </select>
                      </td>

                      {/* Balance */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-bold text-gray-900 font-mono text-xs">
                          {u.balance.toLocaleString()}
                        </span>
                      </td>

                      {/* Connected Accounts Telemetry */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Smartphone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="font-bold text-gray-900">{connected}</span>
                            <span className="text-[11px] text-gray-500 font-normal">accounts</span>
                          </div>
                          {connected > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
                                {activeAcc} active
                              </span>
                              {limitedAcc > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-100">
                                  {limitedAcc} limited
                                </span>
                              )}
                              {expiredAcc > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-100">
                                  {expiredAcc} expired
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">No accounts</span>
                          )}
                        </div>
                      </td>

                      {/* Broadcast Jobs Telemetry */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Radio className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="font-bold text-gray-900">{bcTotal}</span>
                            <span className="text-[11px] text-gray-500 font-normal">broadcasts</span>
                          </div>
                          {bcTotal > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 text-[10px]">
                              {bcRunning > 0 ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                                  {bcRunning} running
                                </span>
                              ) : null}
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-100">
                                {bcFinished} finished
                              </span>
                              {bcFailed > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-100">
                                  {bcFailed} failed
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">No broadcasts</span>
                          )}
                        </div>
                      </td>

                      {/* Orders */}
                      <td className="py-3 px-4 text-center text-gray-600 font-medium">
                        {u.order_count}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Detail Modal */}
                          <button
                            onClick={() => setDetailUser(u)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title={_("admin.userDetails") || "View User Details"}
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Add Balance */}
                          <button
                            onClick={() => setBalanceModal({ user: u, type: "add" })}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title={_("admin.addBalance")}
                          >
                            <Plus className="h-4 w-4" />
                          </button>

                          {/* Deduct Balance */}
                          <button
                            onClick={() => setBalanceModal({ user: u, type: "deduct" })}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title={_("admin.deductBalance")}
                          >
                            <Minus className="h-4 w-4" />
                          </button>

                          {/* Delete User */}
                          {u.id !== currentUser?.id && (
                            <button
                              onClick={() => setDeleteConfirm(u)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title={_("admin.deleteUser")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3.5 bg-gray-50/70 border-t border-gray-100 text-xs text-gray-500">
            <p>
              Showing <span className="font-semibold text-gray-800">{offset + 1}</span>–
              <span className="font-semibold text-gray-800">{Math.min(offset + PAGE_SIZE, data?.total || 0)}</span> of{" "}
              <span className="font-semibold text-gray-800">{data?.total}</span> users
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-semibold rounded-lg transition",
                      page === p
                        ? "bg-primary-600 text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* User Details Modal */}
      {detailUser && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setDetailUser(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-100">
                  {detailUser.email ? detailUser.email[0].toUpperCase() : "U"}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{detailUser.email}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase", ROLE_COLORS[detailUser.role])}>
                      {detailUser.role}
                    </span>
                    {detailUser.full_name && (
                      <span className="text-xs text-gray-500">{detailUser.full_name}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailUser(null)}
                className="text-gray-400 hover:text-gray-600 text-sm p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Telegram Accounts Health Box */}
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  <Smartphone className="h-4 w-4 text-blue-600" />
                  <span>{_("admin.accountHealth") || "Telegram Accounts"}</span>
                </div>
                <div className="space-y-1.5 text-xs pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{_("admin.connectedAccounts") || "Total Connected"}:</span>
                    <span className="font-bold text-gray-900">{detailUser.connected_accounts ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-700 flex items-center gap-1">🟢 {_("admin.activeAccounts") || "Active"}:</span>
                    <span className="font-bold text-emerald-700">{detailUser.active_accounts ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-amber-700 flex items-center gap-1">🟡 {_("admin.limitedAccounts") || "Limited"}:</span>
                    <span className="font-bold text-amber-700">{detailUser.limited_accounts ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-rose-700 flex items-center gap-1">🔴 {_("admin.expiredAccounts") || "Expired"}:</span>
                    <span className="font-bold text-rose-700">{detailUser.expired_accounts ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Broadcast Activity Box */}
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  <Radio className="h-4 w-4 text-indigo-600" />
                  <span>{_("admin.broadcastStats") || "Broadcasts"}</span>
                </div>
                <div className="space-y-1.5 text-xs pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{_("admin.broadcastTotal") || "Total Jobs"}:</span>
                    <span className="font-bold text-gray-900">{detailUser.broadcast_total ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-700 flex items-center gap-1">🟢 {_("admin.broadcastRunning") || "Running"}:</span>
                    <span className="font-bold text-emerald-700">{detailUser.broadcast_running ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 flex items-center gap-1">🔵 {_("admin.broadcastFinished") || "Finished"}:</span>
                    <span className="font-bold text-blue-700">{detailUser.broadcast_finished ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-rose-700 flex items-center gap-1">🔴 {_("admin.broadcastFailed") || "Failed"}:</span>
                    <span className="font-bold text-rose-700">{detailUser.broadcast_failed ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial & Metadata Box */}
            <div className="p-3.5 rounded-xl bg-blue-50/40 border border-blue-100 flex items-center justify-between text-xs">
              <div>
                <span className="text-gray-500 block">Current Balance:</span>
                <span className="text-lg font-extrabold text-gray-900 font-mono">
                  {detailUser.balance.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-gray-500 block">Total Orders:</span>
                <span className="text-lg font-bold text-gray-900">{detailUser.order_count}</span>
              </div>
            </div>

            {/* Actions in Detail Modal */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <Link
                href={`/admin/broadcasts?search=${encodeURIComponent(detailUser.email)}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <span>Inspect Broadcasts</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBalanceModal({ user: detailUser, type: "add" });
                  }}
                  className="text-xs h-8 px-2.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Balance
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBalanceModal({ user: detailUser, type: "deduct" });
                  }}
                  className="text-xs h-8 px-2.5 text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  <Minus className="h-3.5 w-3.5 mr-1" />
                  Deduct
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Balance Modal */}
      {balanceModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setBalanceModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {balanceModal.type === "add" ? _("admin.addBalance") : _("admin.deductBalance")}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {balanceModal.user.email} (Balance: {balanceModal.user.balance.toLocaleString()})
              </p>
            </div>

            <input
              type="number"
              value={balanceAmount}
              onChange={(e) => setBalanceAmount(e.target.value)}
              placeholder={_("admin.amountPlaceholder") || "Enter amount..."}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              autoFocus
              min={1}
            />

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setBalanceModal(null)} className="flex-1 text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBalanceAction}
                disabled={updateBalance.isPending || !balanceAmount}
                className="flex-1 text-xs"
              >
                {updateBalance.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : balanceModal.type === "add" ? (
                  _("admin.addBalance")
                ) : (
                  _("admin.deductBalance")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        onConfirm={handleDeleteUser}
        title={_("admin.deleteUser")}
        message={deleteConfirm ? `${_("admin.deleteConfirm")} (${deleteConfirm.email})` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("…");
  pages.push(total);

  return pages;
}
