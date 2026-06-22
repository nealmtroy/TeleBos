"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  ShoppingCart,
  Globe,
  Shield,
  Mail,
  Sparkles,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMarketplaceStock,
  useMarketplaceStockAccounts,
  useBuyAccount,
} from "@/hooks/use-marketplace";

export default function BuyAccountsPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: stock, isLoading: stockLoading, refetch: refetchStock } = useMarketplaceStock();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  
  // Confirmation Modal
  const [buyConfirmOpen, setBuyConfirmOpen] = useState(false);
  const [pendingBuyAccount, setPendingBuyAccount] = useState<{
    id: string;
    telegram_id: number | null;
    price: number;
    country_code: string;
  } | null>(null);

  // Success Modal
  const [successOpen, setSuccessOpen] = useState(false);
  const [boughtAccount, setBoughtAccount] = useState<{
    id: string;
    telegram_id: number | null;
    phone: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
  } | null>(null);

  const buyMutation = useBuyAccount();

  const handleBuyConfirm = async () => {
    if (!pendingBuyAccount) return;
    try {
      const res = await buyMutation.mutateAsync(pendingBuyAccount.id);
      setBoughtAccount(res);
      await fetchMe();
      await refetchStock();
      setBuyConfirmOpen(false);
      setPendingBuyAccount(null);
      setSuccessOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("orders.buyAccounts")}</h1>
          <p className="text-gray-500 mt-0.5 sm:mt-1 text-sm sm:text-base">
            Purchase verified Telegram accounts directly from the pool.
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

      {stockLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !stock || stock.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
          <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="font-semibold text-gray-900 mb-1">{_("orders.noOrders") || "No Ready Stock"}</h3>
          <p className="text-sm text-gray-500">Check back later for newly added stock!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stock Category Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stock.map((cat) => {
              const isExpanded = selectedCountry === cat.country_code;
              return (
                <Card
                  key={cat.country_code}
                  className={cn(
                    "hover:shadow-md transition cursor-pointer border-2",
                    isExpanded ? "border-primary-500 shadow-sm" : "border-gray-200"
                  )}
                  onClick={() => setSelectedCountry(isExpanded ? null : cat.country_code)}
                >
                  <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-gray-400" />
                          <span className="font-bold text-gray-900">{cat.country_name}</span>
                        </div>
                        <p className="text-sm font-mono text-gray-500 font-semibold">{cat.country_code}</p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-primary-50 text-primary-700 border-primary-200 font-semibold px-2.5 py-1">
                        {cat.ready_stock} {_("orders.readyStock")}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400 font-medium">{_("orders.pricePerAccount")}:</span>
                      <span className="text-base font-bold text-gray-900">Rp {cat.price.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Expanded Country Account Details */}
          {selectedCountry && (
            <CountryAccountsList
              countryCode={selectedCountry}
              price={stock.find((c) => c.country_code === selectedCountry)?.price || 0}
              onBuyClick={(acc) => {
                setPendingBuyAccount({
                  id: acc.id,
                  telegram_id: acc.telegram_id,
                  price: stock.find((c) => c.country_code === selectedCountry)?.price || 0,
                  country_code: selectedCountry,
                });
                setBuyConfirmOpen(true);
              }}
            />
          )}
        </div>
      )}

      {/* Buy Confirmation Dialog */}
      <ConfirmDialog
        open={buyConfirmOpen}
        onOpenChange={setBuyConfirmOpen}
        onConfirm={handleBuyConfirm}
        title={_("orders.confirmBuyTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              {_("orders.confirmBuyMsg")}
            </p>
            {pendingBuyAccount && (
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>User ID:</span>
                  <span className="font-semibold text-gray-900">{pendingBuyAccount.telegram_id || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Country Prefix:</span>
                  <span className="font-semibold text-gray-900 font-mono">{pendingBuyAccount.country_code}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                  <span className="text-gray-900">Total Price:</span>
                  <span className="text-primary-600 font-bold">
                    Rp {pendingBuyAccount.price.toLocaleString()}
                  </span>
                </div>
                {user && (
                  <div className="flex justify-between text-[11px] pt-1">
                    <span>{_("orders.yourBalance")}:</span>
                    <span className={cn("font-medium", user.balance < pendingBuyAccount.price ? "text-red-600" : "text-green-600")}>
                      Rp {user.balance.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        }
        confirmText={_("orders.buyAccounts")}
        cancelText={_("navbar.cancel")}
        variant="info"
        loading={buyMutation.isPending}
      />

      {/* Purchase Success Modal */}
      {successOpen && boughtAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {_("orders.buySuccess")}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                The account has been transferred to your custody. Here are the account details:
              </p>

              <div className="w-full bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 text-left text-xs space-y-2.5 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone Number:</span>
                  <span className="font-semibold text-gray-900 font-mono">{boughtAccount.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">User ID:</span>
                  <span className="font-semibold text-gray-900 font-mono">{boughtAccount.telegram_id || "—"}</span>
                </div>
                {(boughtAccount.first_name || boughtAccount.last_name) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name:</span>
                    <span className="font-semibold text-gray-900">
                      {boughtAccount.first_name || ""} {boughtAccount.last_name || ""}
                    </span>
                  </div>
                )}
                {boughtAccount.username && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Username:</span>
                    <span className="font-semibold text-gray-900 font-mono font-semibold">@{boughtAccount.username}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 w-full">
                <Button
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                    window.location.href = "/accounts";
                  }}
                  className="w-full"
                >
                  View in My Accounts
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                  }}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountryAccountsList({
  countryCode,
  price,
  onBuyClick,
}: {
  countryCode: string;
  price: number;
  onBuyClick: (acc: any) => void;
}) {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: accounts, isLoading, error } = useMarketplaceStockAccounts(countryCode);

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4 p-4 border border-gray-150 rounded-xl bg-gray-50/50">
        <Skeleton className="h-6 w-32 animate-pulse bg-gray-200" />
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full animate-pulse bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mt-4 text-xs">
        <AlertCircle className="h-4 w-4" />
        <p>Failed to load accounts for this country.</p>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl mt-4 text-xs text-gray-500 bg-white">
        No accounts available in this country.
      </div>
    );
  }

  return (
    <Card className="mt-4 border border-gray-200">
      <CardHeader className="py-4 px-5 bg-gray-50/50 border-b border-gray-100 flex flex-row justify-between items-center">
        <div>
          <CardTitle className="text-sm font-bold text-gray-900">
            Stock Details ({countryCode})
          </CardTitle>
          <CardDescription className="text-xs">
            Hiding sensitive details. Purchase to unlock full credentials.
          </CardDescription>
        </div>
        <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
          Rp {price.toLocaleString()} per account
        </Badge>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-gray-150">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-medium">
                <th className="text-left py-2.5 px-5">Telegram User ID</th>
                <th className="text-center py-2.5 px-5">2FA Password Status</th>
                <th className="text-center py-2.5 px-5">Recovery Email</th>
                <th className="text-right py-2.5 px-5">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                  <td className="py-3 px-5 font-mono text-gray-900 font-semibold">
                    {acc.telegram_id || "—"}
                  </td>
                  <td className="py-3 px-5 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                      acc.twofa_enabled
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-gray-50 text-gray-500 border-gray-200"
                    )}>
                      <Shield className="h-3 w-3" />
                      {acc.twofa_enabled ? "Required" : "Not Required"}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                      acc.recovery_email_available
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-gray-50 text-gray-500 border-gray-200"
                    )}>
                      <Mail className="h-3 w-3" />
                      {acc.recovery_email_available ? "Available" : "Not Available"}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <Button
                      size="sm"
                      onClick={() => onBuyClick(acc)}
                      disabled={user ? user.balance < price : false}
                      className="text-xs h-8"
                    >
                      <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                      Buy Account
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden divide-y divide-gray-100">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-400 font-medium">User ID:</span>
                <span className="text-sm font-semibold text-gray-900 font-mono">{acc.telegram_id || "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <p className="text-gray-400 font-medium">2FA Password</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                    acc.twofa_enabled ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  )}>
                    {acc.twofa_enabled ? "Required" : "Not Required"}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 font-medium">Recovery Email</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                    acc.recovery_email_available ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  )}>
                    {acc.recovery_email_available ? "Available" : "Not Available"}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => onBuyClick(acc)}
                disabled={user ? user.balance < price : false}
                className="w-full text-xs"
              >
                <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                Buy Account (Rp {price.toLocaleString()})
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
