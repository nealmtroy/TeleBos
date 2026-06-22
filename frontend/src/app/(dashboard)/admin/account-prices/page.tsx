"use client";

import { useState, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  Tag, AlertCircle, Shield, Search, Save, DollarSign, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAccountPrices, useUpdateAccountPrices } from "@/hooks/use-admin";

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
  const { data: users, isLoading, error, refetch } = useAccountPrices();
  const updateMutation = useUpdateAccountPrices();

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const filtered = useMemo(() => {
    if (!users) return [];
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.user_email?.toLowerCase().includes(q) ||
        u.user_full_name?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const getPrice = (userId: string, originalPrice: number): number => {
    const val = prices[userId];
    if (val === undefined || val === "") return originalPrice;
    const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
    return isNaN(num) || num <= 0 ? originalPrice : num;
  };

  const hasActualChanges = useMemo(() => {
    if (!users) return false;
    return users.some((u) => {
      const newPrice = getPrice(u.user_id, u.sell_price);
      return newPrice !== u.sell_price;
    });
  }, [users, prices]);

  const handleSave = async () => {
    if (!users) return;
    const changed = users
      .filter((u) => {
        const newPrice = getPrice(u.user_id, u.sell_price);
        return newPrice !== u.sell_price;
      })
      .map((u) => ({
        user_id: u.user_id,
        sell_price: getPrice(u.user_id, u.sell_price),
      }));

    if (changed.length === 0) return;

    try {
      await updateMutation.mutateAsync(changed);
      setPrices({});
      setSuccessMsg(`Updated prices for ${changed.length} user(s)!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load users</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Account Price Management</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Set per-user sell prices for Telegram accounts. Users get this price when their account is purchased.
          </p>
        </div>

        {/* Summary badge */}
        <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl self-start">
          <Users className="h-4 w-4 text-primary-600" />
          <span className="text-sm font-semibold text-primary-700">
            {users?.length || 0} users
          </span>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <DollarSign className="h-4 w-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search + Save bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasActualChanges || updateMutation.isPending}
          className={cn(
            "flex items-center gap-2",
            hasActualChanges && "animate-pulse"
          )}
        >
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 text-gray-500 font-medium">
                <th className="py-3 px-4 text-left">User</th>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-center">Current Price (Rp)</th>
                <th className="py-3 px-4 text-center">New Price (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const currentPrice = u.sell_price;
                const newPrice = getPrice(u.user_id, currentPrice);
                const isChanged = newPrice !== currentPrice;

                return (
                  <tr
                    key={u.user_id}
                    className={cn(
                      "border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-b-0",
                      isChanged && "bg-amber-50/40"
                    )}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-xs shrink-0">
                          {(u.user_full_name || u.user_email || "?")[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-900">
                          {u.user_full_name || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs font-mono">
                      {u.user_email}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-mono font-semibold text-gray-800">
                        Rp {currentPrice.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-gray-400 text-xs">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={prices[u.user_id] !== undefined ? prices[u.user_id] : ""}
                          onChange={(e) => {
                            setPrices((prev) => ({ ...prev, [u.user_id]: e.target.value }));
                            setHasChanges(true);
                          }}
                          placeholder={currentPrice.toLocaleString()}
                          className={cn(
                            "w-28 border rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                            isChanged
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : "border-gray-300 bg-white text-gray-900"
                          )}
                        />
                        {isChanged && (
                          <span className="text-[10px] text-amber-600 font-semibold">*</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No users found</p>
        </div>
      )}

      {/* Sticky Save Bar */}
      {hasActualChanges && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 sm:p-5 space-y-3 animate-in slide-in-from-bottom-6 duration-200">
          <div className="flex justify-between items-center text-sm">
            <span className="font-semibold text-gray-900">Unsaved Changes</span>
            <span className="text-xs text-amber-600 font-medium">
              {users?.filter((u) => {
                const newPrice = getPrice(u.user_id, u.sell_price);
                return newPrice !== u.sell_price;
              }).length} user(s) modified
            </span>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
