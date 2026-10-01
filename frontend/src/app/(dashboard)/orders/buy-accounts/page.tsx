"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  ShoppingCart,
  Shield,
  Mail,
  Sparkles,
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  TradeSurface,
  Eyebrow,
  TradeButton,
  TradeGhostButton,
  Chip,
  Rule,
  Metric,
} from "@/components/layout/trade-surface";
import {
  useMarketplaceStock,
  useMarketplaceStockAccounts,
  useBuyAccount,
} from "@/hooks/use-marketplace";

export default function BuyAccountsPage() {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: stock, isLoading: stockLoading, refetch: refetchStock } = useMarketplaceStock();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Confirmation Modal
  const [buyConfirmOpen, setBuyConfirmOpen] = useState(false);
  const [pendingBuyAccount, setPendingBuyAccount] = useState<{
    id: string;
    telegram_id: number | null;
    buy_price: number;
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
      toast({
        variant: "success",
        title: "Success",
        description: _("orders.buySuccess") || "Account purchased successfully!",
      });
      setBuyConfirmOpen(false);
      setPendingBuyAccount(null);
      setSuccessOpen(true);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "error",
        title: "Error",
        description: err?.response?.data?.detail || "Failed to purchase account.",
      });
    }
  };

  const balance = user?.balance ?? 0;
  const cheapest = stock?.length
    ? stock.reduce((min, c) => (c.price < min ? c.price : min), stock[0].price)
    : 0;
  const totalStock = stock?.reduce((sum, c) => sum + c.ready_stock, 0) ?? 0;

  return (
    <div className="space-y-8">
      {/* Masthead */}
      <TradeSurface>
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl space-y-4">
              <Eyebrow>Marketplace</Eyebrow>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-50">
                {_("orders.buyAccounts")}
              </h1>
              <p className="text-sm sm:text-base leading-relaxed text-slate-500 dark:text-slate-400">
                Purchase verified Telegram accounts directly from sellers. Each account
                carries its own price, age and reputation — compare before you commit.
              </p>
            </div>

            {user && (
              <div className="shrink-0 rounded-2xl bg-slate-900/[0.03] dark:bg-white/[0.04] px-6 py-5 ring-1 ring-slate-900/[0.06] dark:ring-white/[0.07]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {_("orders.yourBalance")}
                </p>
                <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                  {balance.toLocaleString()}
                </p>
                {cheapest > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    From Rp {cheapest.toLocaleString()} · {totalStock} in stock
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </TradeSurface>

      {stockLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-[1.75rem] bg-slate-200/60 animate-pulse" />
          ))}
        </div>
      ) : !stock || stock.length === 0 ? (
        <TradeSurface>
          <div className="px-6 py-20 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900/[0.04] dark:bg-white/[0.05]">
              <ShoppingCart className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {_("orders.noOrders") || "No Ready Stock"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">Check back later for newly added stock!</p>
          </div>
        </TradeSurface>
      ) : (
        <div className="space-y-8">
          {/* Country selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stock.map((cat) => {
              const isExpanded = selectedCountry === cat.country_code;
              const affordable = balance >= cat.price;
              return (
                <TradeSurface key={cat.country_code} className={EASE_PRESS}>
                  <button
                    onClick={() => setSelectedCountry(isExpanded ? null : cat.country_code)}
                    aria-pressed={isExpanded}
                    className="group block w-full text-left"
                  >
                    <div className="px-6 py-6 space-y-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                            {cat.country_name}
                          </p>
                          <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-400">
                            {cat.country_code}
                          </p>
                        </div>
                        <Chip tone={cat.ready_stock > 0 ? "positive" : "neutral"}>
                          {cat.ready_stock} {_("orders.readyStock")}
                        </Chip>
                      </div>

                      <Rule />

                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {_("orders.pricePerAccount")}
                          </p>
                          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                            {cat.price > 0 ? `Rp ${cat.price.toLocaleString()}` : "—"}
                            {cat.price > 0 && (
                              <span className="ml-1 text-sm font-normal text-slate-400">+</span>
                            )}
                          </p>
                        </div>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900/[0.04] dark:bg-white/[0.06] text-slate-500 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>

                      <p className="text-xs text-slate-400">
                        {affordable
                          ? "Prices vary per account. Open to see the full list."
                          : "Your balance is below the starting price for this country."}
                      </p>
                    </div>
                  </button>
                </TradeSurface>
              );
            })}
          </div>

          {/* Expanded country account details */}
          {selectedCountry && (
            <CountryAccountsList
              countryCode={selectedCountry}
              onBuyClick={(acc) => {
                setPendingBuyAccount({
                  id: acc.id,
                  telegram_id: acc.telegram_id,
                  buy_price: acc.buy_price ?? acc.sell_price ?? 7000,
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
            <p className="text-sm text-gray-500">{_("orders.confirmBuyMsg")}</p>
            {pendingBuyAccount && (
              <div className="space-y-2.5 rounded-xl bg-gray-50 p-3.5 text-xs text-gray-600 border border-gray-100">
                <div className="flex justify-between">
                  <span>User ID:</span>
                  <span className="font-semibold text-gray-900">{pendingBuyAccount.telegram_id || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Country Prefix:</span>
                  <span className="font-semibold text-gray-900 font-mono">
                    {pendingBuyAccount.country_code}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                  <span className="text-gray-900">Total Price:</span>
                  <span className="font-bold text-primary-600">
                    Rp {pendingBuyAccount.buy_price.toLocaleString()}
                  </span>
                </div>
                {user && (
                  <div className="flex justify-between pt-1 text-[11px]">
                    <span>{_("orders.yourBalance")}:</span>
                    <span
                      className={cn(
                        "font-medium",
                        user.balance < pendingBuyAccount.buy_price
                          ? "text-red-600"
                          : "text-green-600"
                      )}
                    >
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
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-[1.75rem] bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/10 animate-in fade-in zoom-in duration-300">
            <div className="rounded-[1.5rem] bg-white px-6 py-8">
              <div className="flex flex-col items-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-600/15">
                  <Sparkles className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="mb-1 text-lg font-semibold text-slate-900">
                  {_("orders.buySuccess")}
                </h3>
                <p className="mb-6 text-sm text-slate-500">
                  The account has been transferred to your custody. Here are the account details:
                </p>

                <div className="mb-6 w-full space-y-2.5 rounded-xl bg-emerald-50/50 p-4 text-left text-xs ring-1 ring-emerald-600/10">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone Number:</span>
                    <span className="font-mono font-semibold text-gray-900">{boughtAccount.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">User ID:</span>
                    <span className="font-mono font-semibold text-gray-900">
                      {boughtAccount.telegram_id || "—"}
                    </span>
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
                      <span className="font-mono font-semibold text-gray-900">
                        @{boughtAccount.username}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <TradeButton
                    onClick={() => {
                      setSuccessOpen(false);
                      setBoughtAccount(null);
                      window.location.href = "/accounts";
                    }}
                    className="justify-center flex-1"
                    icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  >
                    View in My Accounts
                  </TradeButton>
                  <TradeGhostButton
                    onClick={() => {
                      setSuccessOpen(false);
                      setBoughtAccount(null);
                    }}
                    className="justify-center flex-1"
                  >
                    Close
                  </TradeGhostButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EASE_PRESS = "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]";

function CountryAccountsList({
  countryCode,
  onBuyClick,
}: {
  countryCode: string;
  onBuyClick: (acc: any) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: accounts, isLoading, error } = useMarketplaceStockAccounts(countryCode);

  if (isLoading) {
    return (
      <TradeSurface>
        <div className="space-y-3 p-6">
          <Skeleton className="h-6 w-32 animate-pulse bg-slate-200" />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full animate-pulse bg-slate-100" />
          ))}
        </div>
      </TradeSurface>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-xs text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300">
        <AlertCircle className="h-4 w-4" />
        <p>Failed to load accounts for this country.</p>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500 dark:border-slate-700">
        No accounts available in this country.
      </div>
    );
  }

  return (
    <TradeSurface>
      {/* Panel head */}
      <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow>{countryCode}</Eyebrow>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Available accounts
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Each account has its own price. Purchase to unlock full credentials.
          </p>
        </div>
        <p className="shrink-0 text-sm text-slate-400">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </p>
      </div>

      <Rule />

      {/* Desktop rows */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_minmax(0,0.9fr)_auto] items-center gap-x-3 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          <span>User ID</span>
          <span className="text-center">Age</span>
          <span className="text-center">Spam</span>
          <span className="text-center">Contacts</span>
          <span className="text-center">2FA</span>
          <span className="text-center">Recovery</span>
          <span className="text-right">Price</span>
          <span className="w-24" />
        </div>

        {accounts.map((acc, i) => {
          const price = acc.buy_price ?? acc.sell_price ?? 7000;
          const canAfford = !user || user.balance >= price;
          return (
            <div
              key={acc.id}
              className={cn(
                "grid grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_minmax(0,0.9fr)_auto] items-center gap-x-3 px-6 py-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.02]",
                i > 0 && "border-t border-slate-900/[0.05] dark:border-white/[0.06]"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {acc.telegram_id || "—"}
                </span>
                {acc.is_resale && (
                  <Chip tone="accent">Resale</Chip>
                )}
              </div>

              <div className="flex justify-center">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <Clock className="h-3 w-3 text-slate-400" />
                  {acc.est_reg_date_age || "—"}
                </span>
              </div>

              <div className="flex justify-center">
                {acc.spam_status === "normal" ? (
                  <Chip tone="positive" icon={<CheckCircle2 className="h-3 w-3" />}>
                    Clean
                  </Chip>
                ) : acc.spam_status === "limited" ? (
                  <Chip tone="negative" icon={<AlertTriangle className="h-3 w-3" />}>
                    Limited
                  </Chip>
                ) : (
                  <Chip>Unchecked</Chip>
                )}
              </div>

              <div className="flex justify-center">
                <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                  <Users className="h-3 w-3 text-slate-400" />
                  {acc.contacts_count || 0}
                </span>
              </div>

              <div className="flex justify-center">
                <Chip
                  tone={acc.twofa_enabled ? "caution" : "neutral"}
                  icon={<Shield className="h-3 w-3" />}
                >
                  {acc.twofa_enabled ? "Required" : "None"}
                </Chip>
              </div>

              <div className="flex justify-center">
                <Chip
                  tone={acc.recovery_email_available ? "accent" : "neutral"}
                  icon={<Mail className="h-3 w-3" />}
                >
                  {acc.recovery_email_available ? "Available" : "None"}
                </Chip>
              </div>

              <div className="text-right">
                <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  Rp {price.toLocaleString()}
                </span>
              </div>

              <div className="flex w-24 justify-end">
                <TradeButton
                  onClick={() => onBuyClick(acc)}
                  disabled={!canAfford}
                  className="h-9 pl-4 text-xs"
                  icon={<ShoppingCart className="h-3.5 w-3.5" />}
                >
                  Buy
                </TradeButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden">
        {accounts.map((acc, i) => {
          const price = acc.buy_price ?? acc.sell_price ?? 7000;
          const canAfford = !user || user.balance >= price;
          return (
            <div
              key={acc.id}
              className={cn(
                "space-y-4 px-6 py-5",
                i > 0 && "border-t border-slate-900/[0.05] dark:border-white/[0.06]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {acc.telegram_id || "—"}
                  </span>
                  {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                </div>
                <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  Rp {price.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Metric label="Age" value={acc.est_reg_date_age || "—"} />
                <Metric label="Contacts" value={acc.contacts_count || 0} />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {acc.spam_status === "normal" ? (
                  <Chip tone="positive" icon={<CheckCircle2 className="h-3 w-3" />}>
                    Spam clean
                  </Chip>
                ) : acc.spam_status === "limited" ? (
                  <Chip tone="negative" icon={<AlertTriangle className="h-3 w-3" />}>
                    Spam limited
                  </Chip>
                ) : (
                  <Chip>Spam unchecked</Chip>
                )}
                <Chip
                  tone={acc.twofa_enabled ? "caution" : "neutral"}
                  icon={<Shield className="h-3 w-3" />}
                >
                  {acc.twofa_enabled ? "2FA required" : "No 2FA"}
                </Chip>
                <Chip
                  tone={acc.recovery_email_available ? "accent" : "neutral"}
                  icon={<Mail className="h-3 w-3" />}
                >
                  {acc.recovery_email_available ? "Recovery email" : "No recovery"}
                </Chip>
              </div>

              <TradeButton
                onClick={() => onBuyClick(acc)}
                disabled={!canAfford}
                className="w-full justify-center"
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
              >
                Buy
              </TradeButton>
            </div>
          );
        })}
      </div>
    </TradeSurface>
  );
}