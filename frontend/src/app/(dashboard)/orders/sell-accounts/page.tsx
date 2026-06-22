"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  DollarSign,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useSellEligibleAccounts,
  useSellAccounts,
  useMarketplacePricing,
} from "@/hooks/use-marketplace";

export default function SellAccountsPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: eligible, isLoading, error } = useSellEligibleAccounts();
  const { data: pricing } = useMarketplacePricing();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sellConfirmOpen, setSellConfirmOpen] = useState(false);
  const [selling, setSelling] = useState(false);

  const sellMutation = useSellAccounts();

  const sellPrice = pricing?.sell_price || 5500;

  const handleSelectAll = () => {
    if (!eligible) return;
    if (selectedIds.length === eligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligible.map((acc) => acc.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSellConfirm = async () => {
    if (selectedIds.length === 0) return;
    setSelling(true);
    try {
      await sellMutation.mutateAsync(selectedIds);
      await fetchMe();
      setSelectedIds([]);
      setSellConfirmOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSelling(false);
    }
  };

  const totalReceive = sellPrice * selectedIds.length;

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
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <AlertCircle className="h-5 w-5" />
        <p>Failed to load eligible accounts.</p>
      </div>
    );
  }

  if (!eligible || eligible.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <DollarSign className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">{_("orders.noEligibleAccounts")}</h3>
        <p className="text-sm text-gray-500">
          All your connected accounts are already sold or in custody, or you don't have any verified accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("orders.sellAccounts")}</h1>
          <p className="text-gray-500 mt-0.5 sm:mt-1 text-sm sm:text-base">
            Sell your connected Telegram accounts for platform credit.
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

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <DollarSign className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-800 space-y-1">
          <p className="font-semibold">Auto-Pricing by Owner</p>
          <p>
            Your sell price is <strong>Rp {sellPrice.toLocaleString()}</strong> per account (set by the platform owner).
            Your balance will <strong>not</strong> be credited immediately — you only get paid when a buyer purchases your account.
          </p>
        </div>
      </div>

      {/* Summary Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-gray-50 rounded-xl border border-gray-200 gap-3">
        <div>
          <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
            {_("orders.eligibleAccounts")}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Select one or more accounts. Sold accounts immediately cease active broadcasting and auto-replies.
          </p>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 font-semibold px-2.5 py-1">
            Rp {sellPrice.toLocaleString()} / account
          </Badge>
        </div>
      </div>

      {/* Eligible Accounts Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 text-gray-500 font-medium">
                <th className="py-3 px-4 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === eligible.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 text-left">Telegram Account</th>
                <th className="py-3 px-4 text-left">Username</th>
                <th className="py-3 px-4 text-left">Telegram ID</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((acc) => {
                const isSelected = selectedIds.includes(acc.id);
                return (
                  <tr
                    key={acc.id}
                    className={cn(
                      "border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-b-0 cursor-pointer",
                      isSelected && "bg-primary-50/20"
                    )}
                    onClick={() => handleToggleSelect(acc.id)}
                  >
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(acc.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700 text-xs shrink-0">
                          {acc.first_name ? acc.first_name[0].toUpperCase() : "U"}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {acc.first_name || "Unnamed"} {acc.last_name || ""}
                          </p>
                          <p className="text-xs font-mono text-gray-500">{acc.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {acc.username ? `@${acc.username}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {acc.telegram_id || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sell Floating Action Panel */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 sm:p-5 flex flex-col space-y-4 animate-in slide-in-from-bottom-6 duration-200">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
              <span>Selected Accounts:</span>
              <span className="font-bold text-gray-900">{selectedIds.length} accounts</span>
            </div>
            <div className="flex justify-between items-center text-sm font-semibold text-gray-900 border-t border-gray-100 pt-2">
              <span>{_("orders.balanceToReceive")}:</span>
              <span className="text-emerald-600 text-lg font-bold">
                Rp {totalReceive.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 italic">
              Price: Rp {sellPrice.toLocaleString()} / account. You'll only be paid when a buyer purchases.
            </p>
          </div>
          <Button
            onClick={() => setSellConfirmOpen(true)}
            className="w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white border-none shadow-sm font-semibold"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Sell {selectedIds.length} Account(s)
          </Button>
        </div>
      )}

      {/* Multi-Sell Confirmation Dialog */}
      <ConfirmDialog
        open={sellConfirmOpen}
        onOpenChange={setSellConfirmOpen}
        onConfirm={handleSellConfirm}
        title={_("orders.confirmSellTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              Are you sure you want to sell these {selectedIds.length} Telegram account(s)? This will stop all active broadcasting and auto-replies immediately.
            </p>
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Selected Accounts:</span>
                <span className="font-semibold text-gray-900">{selectedIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Price per account:</span>
                <span className="font-semibold text-gray-900">Rp {sellPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                <span className="text-gray-900">{_("orders.balanceToReceive")}:</span>
                <span className="text-emerald-600 font-bold">
                  Rp {totalReceive.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-xs text-amber-700">
              <p className="font-semibold mb-0.5">⏳ Deferred Payment</p>
              <p>Your balance will <strong>not</strong> be credited now. You only receive payment when a buyer purchases your listed account(s).</p>
            </div>
          </div>
        }
        confirmText={_("orders.sellAccount")}
        cancelText={_("navbar.cancel")}
        variant="warning"
        loading={selling}
      />
    </div>
  );
}
