"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useAdminUsers, useUpdateBalance, useUpdateRole, useDeleteUser } from "@/hooks/use-admin";
import {
  Search, Shield, Plus, Minus, Trash2, AlertCircle, Loader2,
  RefreshCw, UserCog, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  premium: "bg-amber-100 text-amber-700 border-amber-200",
  pro: "bg-blue-100 text-blue-700 border-blue-200",
  basic: "bg-gray-100 text-gray-700 border-gray-200",
};

const PAGE_SIZE = 10;

export default function AdminUsersPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
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
  const { data, isLoading, error } = useAdminUsers(debouncedSearch || undefined, PAGE_SIZE, offset);
  const updateBalance = useUpdateBalance();
  const updateRole = useUpdateRole();
  const deleteUser = useDeleteUser();

  const [balanceModal, setBalanceModal] = useState<{ user: any; type: "add" | "deduct" } | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  async function handleBalanceAction() {
    if (!balanceModal || !balanceAmount) return;
    const amount = parseInt(balanceAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await updateBalance.mutateAsync({
        userId: balanceModal.user.id,
        amount: balanceModal.type === "add" ? amount : -amount,
      });
      setActionMsg({ type: "success", text: _("admin.balanceUpdated") });
      setBalanceModal(null);
      setBalanceAmount("");
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed" });
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateRole.mutateAsync({ userId, role });
      setActionMsg({ type: "success", text: _("admin.roleUpdated") });
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed" });
    }
  }

  async function handleDeleteUser() {
    if (!deleteConfirm) return;
    try {
      await deleteUser.mutateAsync(deleteConfirm.id);
      setActionMsg({ type: "success", text: "User deleted" });
      setDeleteConfirm(null);
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed" });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("admin.users")}</h1>
        <p className="text-gray-500 mt-1">{_("admin.userManagement")}</p>
      </div>

      {/* Search & Summary */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={_("admin.searchUsers")}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        {data && (
          <div className="flex items-center gap-2 text-sm text-gray-500 shrink-0">
            <UserCog className="h-4 w-4" />
            {_("admin.totalUsers")}: <span className="font-semibold text-gray-900">{data.total}</span>
          </div>
        )}
      </div>

      {/* Action Message */}
      {actionMsg && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-xl text-sm",
            actionMsg.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          )}
        >
          {actionMsg.type === "success" ? <RefreshCw className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Users Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load users</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">{_("admin.email")}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">{_("admin.fullName")}</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">{_("admin.role")}</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">{_("admin.balance")}</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">{_("admin.orders")}</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">{_("admin.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{u.full_name || "-"}</td>
                    <td className="py-3 px-4 text-center">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className={cn(
                          "text-xs font-medium px-2 py-1 rounded-lg border",
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
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-gray-900">{u.balance.toLocaleString()}</span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600">{u.order_count}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setBalanceModal({ user: u, type: "add" })}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title={_("admin.addBalance")}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setBalanceModal({ user: u, type: "deduct" })}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={_("admin.deductBalance")}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => setDeleteConfirm(u)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={_("admin.deleteUser")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
              <p className="text-xs text-gray-400">
                {(offset + 1)}–{Math.min(offset + PAGE_SIZE, data?.total || 0)} of {data?.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                        "px-3 py-1 text-xs font-medium rounded-lg transition-colors",
                        page === p
                          ? "bg-primary-600 text-white"
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
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Balance Modal */}
      {balanceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setBalanceModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {balanceModal.type === "add" ? _("admin.addBalance") : _("admin.deductBalance")}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {balanceModal.user.email} — {_("admin.balance")}: {balanceModal.user.balance.toLocaleString()}
            </p>
            <input
              type="number"
              value={balanceAmount}
              onChange={(e) => setBalanceAmount(e.target.value)}
              placeholder={_("admin.amountPlaceholder")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 mb-4"
              autoFocus
              min={1}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBalanceModal(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleBalanceAction} disabled={updateBalance.isPending || !balanceAmount} className="flex-1">
                {updateBalance.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
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

      {/* Delete Confirm */}
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
