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
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [sellConfirmOpen, setSellConfirmOpen] = useState(false);
  const [selling, setSelling] = useState(false);

  const sellMutation = useSellAccounts();

  const defaultSellPrice = pricing?.sell_price || 5500;

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

  const handlePriceChange = (id: string, value: string) => {
    // Allow empty for editing, but only store valid numbers
    setPrices((prev) => ({ ...prev, [id]: value }));
  };

  const getPriceForAccount = (id: string): number => {
    const val = prices[id];
    if (val === undefined || val === "") return defaultSellPrice;
    const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
    return isNaN(num) || num <= 0 ? defaultSellPrice : num;
  };

  const handleSellConfirm = async () => {
    if (selectedIds.length === 0) return;
    setSelling(true);
    try {
      const accounts = selectedIds.map((id) => ({
        account_id: id,
        sell_price: getPriceForAccount(id),
      }));
      await sellMutation.mutateAsync(accounts);
      await fetchMe();
      setSelectedIds([]);
      setPrices({});
      setSellConfirmOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSelling(false);
    }
  };

  const totalEstimate = selectedIds.reduce((sum, id) => sum + getPriceForAccount(id), 0);

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
            List your Telegram accounts for sale. Set a price per account — you'll be credited when someone buys.
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
          <p className="font-semibold">Per-Account Pricing</p>
          <p>
            Set a custom price for each account. Your balance will <strong>not</strong> be credited immediately —
            you only get paid when a buyer purchases your account. Default price is <strong>Rp {defaultSellPrice.toLocaleString()}</strong>.
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
            Select accounts and set your price. Sold accounts immediately cease active broadcasting and auto-replies.
          </p>
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
                <th className="py-3 px-4 text-left">Your Price (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((acc) => {
                const isSelected = selectedIds.includes(acc.id);
                const price = getPriceForAccount(acc.id);
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
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 text-xs">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={prices[acc.id] !== undefined ? prices[acc.id] : ""}
                          onChange={(e) => handlePriceChange(acc.id, e.target.value)}
                          placeholder={defaultSellPrice.toLocaleString()}
                          disabled={!isSelected}
                          className={cn(
                            "w-28 border rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                            isSelected
                              ? "border-gray-300 bg-white text-gray-900"
                              : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                          )}
                        />
                      </div>
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
              <span>Total estimated value:</span>
              <span className="text-emerald-600 text-lg font-bold">
                Rp {totalEstimate.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 italic">
              You will only be paid when a buyer purchases your account(s).
            </p>
          </div>
          <Button
            onClick={() => setSellConfirmOpen(true)}
            className="w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white border-none shadow-sm font-semibold"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            List {selectedIds.length} Account(s) for Sale
          </Button>
        </div>
      )}

      {/* Multi-Sell Confirmation Dialog */}
      <ConfirmDialog
        open={sellConfirmOpen}
        onOpenChange={setSellConfirmOpen}
        onConfirm={handleSellConfirm}
        title="List Accounts for Sale"
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              These {selectedIds.length} account(s) will be listed in the marketplace at your set prices.
              All active broadcasts and auto-replies will stop immediately.
            </p>
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Selected Accounts:</span>
                <span className="font-semibold text-gray-900">{selectedIds.length}</span>
              </div>
              <div className="space-y-1.5 border-t border-gray-200 pt-2">
                <p className="font-semibold text-gray-900 text-[11px] uppercase tracking-wider">Price Breakdown</p>
                {selectedIds.map((id) => {
                  const acc = eligible.find((a) => a.id === id);
                  return (
                    <div key={id} className="flex justify-between text-[11px]">
                      <span className="truncate mr-2">{acc?.phone || id.slice(0, 8)}</span>
                      <span className="font-semibold text-gray-900">Rp {getPriceForAccount(id).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                <span className="text-gray-900">Total:</span>
                <span className="text-emerald-600 font-bold">
                  Rp {totalEstimate.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-xs text-amber-700">
              <p className="font-semibold mb-0.5">⏳ Important</p>
              <p>Your balance will <strong>not</strong> be credited now. You only receive payment when a buyer purchases your listed account(s).</p>
            </div>
          </div>
        }
        confirmText="List for Sale"
        cancelText={_("navbar.cancel")}
        variant="warning"
        loading={selling}
      />
    </div>
  );
}
