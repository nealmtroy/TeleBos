"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminRedeemCodes,
  useAdminCreateRedeemCode,
  useAdminDeleteRedeemCode,
} from "@/hooks/use-admin-redeem";
import {
  Search, Shield, Plus, Trash2, AlertCircle, Loader2,
  CheckCircle, Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export default function AdminRedeemCodesPage() {
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

  return <RedeemCodesContent />;
}

function RedeemCodesContent() {
  const _ = useT();
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useAdminRedeemCodes(search || undefined);
  const createCode = useAdminCreateRedeemCode();
  const deleteCode = useAdminDeleteRedeemCode();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    code_type: "subscription",
    plan: "pro",
    amount: "",
    max_uses: "1",
    duration_days: "30",
    expires_at: "",
    code_prefix: "",
    custom_code: "",
  });
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCode.mutateAsync({
        code_type: formData.code_type,
        plan: formData.code_type === "subscription" ? formData.plan : undefined,
        amount: formData.code_type === "balance" ? parseInt(formData.amount) : undefined,
        max_uses: parseInt(formData.max_uses) || 1,
        duration_days: formData.code_type === "subscription" ? parseInt(formData.duration_days) || 30 : undefined,
        expires_at: formData.expires_at || undefined,
        code_prefix: formData.code_prefix || undefined,
        custom_code: formData.custom_code || undefined,
      });
      setActionMsg({ type: "success", text: _("adminRedeem.codeCreated") });
      setShowForm(false);
      setFormData({ code_type: "subscription", plan: "pro", amount: "", max_uses: "1", duration_days: "30", expires_at: "", code_prefix: "", custom_code: "" });
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed" });
    }
  }

  async function handleDelete(code: any) {
    try {
      await deleteCode.mutateAsync(code.id);
      setActionMsg({ type: "success", text: "Code deactivated" });
      setDeleteConfirm(null);
    } catch (err: any) {
      setActionMsg({ type: "error", text: err?.response?.data?.detail || "Failed" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("adminRedeem.title")}</h1>
        <p className="text-gray-500 mt-1">{_("adminRedeem.desc")}</p>
      </div>

      {/* Header & Create Button */}
      <div className="flex items-center justify-between">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          {_("adminRedeem.createCode")}
        </Button>
      </div>

      {/* Action Message */}
      {actionMsg && (
        <div className={cn(
          "flex items-center gap-2 p-3 rounded-xl text-sm",
          actionMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {actionMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Create Code Form */}
      {showForm && (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.codeType")}</label>
                  <select
                    value={formData.code_type}
                    onChange={(e) => setFormData({ ...formData, code_type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="subscription">{_("adminRedeem.typeSubscription")}</option>
                    <option value="balance">{_("adminRedeem.typeBalance")}</option>
                  </select>
                </div>

                {formData.code_type === "subscription" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.plan")}</label>
                      <select
                        value={formData.plan}
                        onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      >
                        <option value="pro">Pro</option>
                        <option value="premium">Premium</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.durationDays")}</label>
                      <input
                        type="number"
                        value={formData.duration_days}
                        onChange={(e) => setFormData({ ...formData, duration_days: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        min={1}
                      />
                    </div>
                  </>
                )}

                {formData.code_type === "balance" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.amount")}</label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      min={1}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.maxUses")}</label>
                  <input
                    type="number"
                    value={formData.max_uses}
                    onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    min={1}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.expiresAt")}</label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{_("adminRedeem.prefix")}</label>
                  <input
                    type="text"
                    value={formData.code_prefix}
                    onChange={(e) => setFormData({ ...formData, code_prefix: e.target.value })}
                    placeholder="e.g. PROMO"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Custom Code <span className="text-gray-400">(opsional)</span></label>
                  <input
                    type="text"
                    value={formData.custom_code}
                    onChange={(e) => setFormData({ ...formData, custom_code: e.target.value })}
                    placeholder="e.g. free-trial-1-month"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={createCode.isPending}>
                  {createCode.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {_("adminRedeem.createCode")}
                </Button>
                <Button variant="outline" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={_("admin.searchUsers")}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      {/* Codes Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load redeem codes</p>
        </div>
      ) : !data?.codes.length ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <Ticket className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">{_("adminRedeem.noCodes")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">{_("adminRedeem.code")}</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">{_("adminRedeem.type")}</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">{_("adminRedeem.used")}</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">{_("adminRedeem.status")}</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">{_("adminRedeem.createdBy")}</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">{_("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.codes.map((c) => {
                const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                const isMaxed = c.used_count >= c.max_uses;
                const effectiveStatus = c.is_active && !isExpired && !isMaxed;
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded font-semibold text-gray-900">{c.code}</code>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {c.code_type === "subscription" ? (
                          <>{c.plan?.toUpperCase()} — {c.duration_days}d</>
                        ) : (
                          <>{c.amount?.toLocaleString()} credits</>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded-lg",
                        c.code_type === "subscription" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {c.code_type === "subscription" ? _("adminRedeem.typeSubscription") : _("adminRedeem.typeBalance")}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600">
                      {c.used_count}/{c.max_uses}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {effectiveStatus ? (
                        <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-lg">{_("adminRedeem.active")}</span>
                      ) : (
                        <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-lg">{_("adminRedeem.inactive")}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-600 text-xs">{c.created_by_email}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setDeleteConfirm(c)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deactivate"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.total > data.codes.length && (
            <div className="p-3 text-center text-xs text-gray-400">
              Showing {data.codes.length} of {data.total} codes
            </div>
          )}
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title={_("adminRedeem.title")}
        message={deleteConfirm ? `${_("adminRedeem.deleteConfirm")} (${deleteConfirm.code})` : ""}
        confirmText="Deactivate"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
