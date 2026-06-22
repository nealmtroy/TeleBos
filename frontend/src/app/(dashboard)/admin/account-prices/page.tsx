"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  Tag, AlertCircle, Shield, Plus, Trash2, Save, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  usePrefixPrices,
  useCreatePrefixPrice,
  useUpdatePrefixPrice,
  useDeletePrefixPrice,
} from "@/hooks/use-admin";

export default function AdminAccountPricesPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can manage account prices.</p>
      </div>
    );
  }

  return <AccountPricesContent />;
}

function AccountPricesContent() {
  const _ = useT();
  const { data: rules, isLoading, error } = usePrefixPrices();
  const createMutation = useCreatePrefixPrice();
  const updateMutation = useUpdatePrefixPrice();
  const deleteMutation = useDeletePrefixPrice();

  const [newPrefix, setNewPrefix] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newNote, setNewNote] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleAdd = async () => {
    const prefix = newPrefix.trim();
    const price = parseInt(newPrice.replace(/[^0-9]/g, ""), 10);
    if (!prefix || isNaN(price) || price <= 0) return;

    try {
      await createMutation.mutateAsync({
        id_prefix: prefix,
        sell_price: price,
        note: newNote.trim() || undefined,
      });
      setNewPrefix("");
      setNewPrice("");
      setNewNote("");
      showSuccess(`Price rule for prefix "${prefix}" created!`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (id_prefix: string, originalPrice: number) => {
    const val = editing[id_prefix];
    if (val === undefined || val === "") return;
    const newPrice = parseInt(val.replace(/[^0-9]/g, ""), 10);
    if (isNaN(newPrice) || newPrice <= 0 || newPrice === originalPrice) {
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id_prefix];
        return next;
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({ id_prefix, sell_price: newPrice });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id_prefix];
        return next;
      });
      showSuccess(`Updated prefix "${id_prefix}" → Rp ${newPrice.toLocaleString()}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm);
      showSuccess(`Deleted price rule for prefix "${deleteConfirm}"`);
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
    }
  };

  const getEditedPrice = (id_prefix: string, original: number): number | null => {
    const val = editing[id_prefix];
    if (val === undefined || val === "") return null;
    const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
    return isNaN(num) || num <= 0 ? null : num;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load price rules</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Telegram ID Prefix Pricing</h1>
        <p className="text-gray-500 mt-0.5 text-sm">
          Set sell prices based on the first digit(s) of the Telegram user ID.
          Example: prefix "7" = all IDs starting with 7 (7780645374, 7780645371, etc.)
          The <strong>longest matching prefix</strong> wins.
        </p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <Tag className="h-4 w-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add new rule */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary-600" />
          Add Price Rule
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">ID Prefix</label>
            <div className="flex items-center gap-1">
              <Hash className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 7, 77, 1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Price (Rp)</label>
            <input
              type="text"
              inputMode="numeric"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 6000"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Note <span className="text-gray-300">(optional)</span></label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. Premium accounts, old accounts, etc."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!newPrefix.trim() || !newPrice || createMutation.isPending}
          size="sm"
          className="mt-1"
        >
          <Plus className="h-4 w-4 mr-1" />
          {createMutation.isPending ? "Adding..." : "Add Rule"}
        </Button>
      </div>

      {/* Rules table */}
      {rules && rules.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-gray-500 font-medium">
                  <th className="py-3 px-4 text-left">ID Prefix</th>
                  <th className="py-3 px-4 text-left">Note</th>
                  <th className="py-3 px-4 text-center">Current Price</th>
                  <th className="py-3 px-4 text-center">New Price</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules
                  .sort((a, b) => b.id_prefix.length - a.id_prefix.length)
                  .map((rule) => {
                    const edited = getEditedPrice(rule.id_prefix, rule.sell_price);
                    return (
                      <tr key={rule.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-b-0">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-primary-500" />
                            <span className="font-bold text-lg text-gray-900 font-mono">{rule.id_prefix}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {rule.note || "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-1 rounded-lg">
                            Rp {rule.sell_price.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-gray-400 text-xs">Rp</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editing[rule.id_prefix] !== undefined ? editing[rule.id_prefix] : ""}
                              onChange={(e) =>
                                setEditing((prev) => ({ ...prev, [rule.id_prefix]: e.target.value.replace(/[^0-9]/g, "") }))
                              }
                              placeholder={rule.sell_price.toLocaleString()}
                              className={cn(
                                "w-24 border rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                                edited
                                  ? "border-amber-300 bg-amber-50 text-amber-900"
                                  : "border-gray-200 bg-gray-50 text-gray-400"
                              )}
                            />
                            {edited && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdate(rule.id_prefix, rule.sell_price)}
                                disabled={updateMutation.isPending}
                                className="h-8 px-2"
                              >
                                <Save className="h-3.5 w-3.5 text-primary-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setDeleteConfirm(rule.id_prefix)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete rule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-xl">
          <Tag className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500 mb-1">No price rules configured yet</p>
          <p className="text-sm text-gray-400">Add a prefix rule above to get started.</p>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        onConfirm={handleDelete}
        title="Delete Price Rule"
        message={`Are you sure you want to delete the price rule for prefix "${deleteConfirm}"? Accounts with this prefix will fall back to the global default price.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
