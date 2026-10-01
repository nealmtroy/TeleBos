"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  DollarSign,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  TradeSurface,
  Eyebrow,
  TradeButton,
  TradeGhostButton,
  Chip,
  Rule,
} from "@/components/layout/trade-surface";
import {
  isMarketplaceSellUnknownOutcome,
  useSellEligibleAccounts,
  useSellAccounts,
} from "@/hooks/use-marketplace";

export default function SellAccountsPage() {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: eligible, isLoading, error } = useSellEligibleAccounts();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sellConfirmOpen, setSellConfirmOpen] = useState(false);
  const [selling, setSelling] = useState(false);

  const sellMutation = useSellAccounts();

  const getPriceForAccount = (id: string): number => {
    if (!eligible) return 0;
    const acc = eligible.find((a) => a.id === id);
    return acc?.sell_price || 0;
  };

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
      void fetchMe();
      toast({
        variant: "success",
        title: "Success",
        description: _("orders.sellSuccess") || "Account(s) listed successfully!",
      });
      setSelectedIds([]);
      setSellConfirmOpen(false);
    } catch (err: any) {
      console.error(err);
      const isUnknownOutcome = isMarketplaceSellUnknownOutcome(err);
      toast({
        variant: "error",
        title: isUnknownOutcome ? "Sale status needs confirmation" : "Error",
        description: isUnknownOutcome
          ? "Telegram may have finished updating this account. We refreshed your accounts—check its sale status before trying again."
          : err?.response?.data?.detail || "Failed to sell account(s).",
      });
      if (isUnknownOutcome) {
        setSelectedIds([]);
        setSellConfirmOpen(false);
      }
    } finally {
      setSelling(false);
    }
  };

  const totalReceive = selectedIds.reduce((sum, id) => sum + getPriceForAccount(id), 0);
  const balance = user?.balance ?? 0;
  const allSelected = !!eligible && selectedIds.length === eligible.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-[1.75rem] bg-slate-200/60 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300">
        <AlertCircle className="h-5 w-5" />
        <p>Failed to load eligible accounts.</p>
      </div>
    );
  }

  if (!eligible || eligible.length === 0) {
    return (
      <TradeSurface>
        <div className="px-6 py-20 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900/[0.04] dark:bg-white/[0.05]">
            <DollarSign className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {_("orders.noEligibleAccounts")}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            All your connected accounts are already sold or in custody, or you don't have any
            verified accounts.
          </p>
        </div>
      </TradeSurface>
    );
  }

  return (
    <div className="space-y-8 pb-32">
      {/* Masthead */}
      <TradeSurface>
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl space-y-4">
              <Eyebrow>Marketplace</Eyebrow>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-50">
                {_("orders.sellAccounts")}
              </h1>
              <p className="text-sm sm:text-base leading-relaxed text-slate-500 dark:text-slate-400">
                Sell your connected Telegram accounts for platform credit. Pricing is set per
                Telegram ID prefix by the platform owner.
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
                {selectedIds.length > 0 && (
                  <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    +{totalReceive.toLocaleString()} pending
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </TradeSurface>

      {/* Deferred payment notice — placed ahead of the list because it changes
          how every price on this page should be read. */}
      <TradeSurface>
        <div className="flex items-start gap-4 px-6 py-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-600/15 dark:bg-amber-500/10 dark:ring-amber-400/20">
            <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Payment is deferred until a buyer purchases
            </p>
            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Your balance will <strong className="font-semibold text-slate-700 dark:text-slate-300">not</strong>{" "}
              be credited immediately — you only get paid when a buyer purchases your account.
            </p>
          </div>
        </div>
      </TradeSurface>

      {/* Eligible accounts */}
      <TradeSurface>
        <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>Eligible</Eyebrow>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Accounts ready to list
            </h2>
          </div>
          <TradeGhostButton onClick={handleSelectAll} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            {allSelected ? "Clear selection" : `Select all ${eligible.length}`}
          </TradeGhostButton>
        </div>

        <Rule />

        {/* Column header */}
        <div className="hidden lg:grid grid-cols-[2.25rem_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-x-4 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          <span className="flex justify-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              aria-label="Select all accounts"
              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-900 dark:accent-white"
            />
          </span>
          <span>Account</span>
          <span className="text-center">Age</span>
          <span className="text-center">Spam</span>
          <span className="text-center">Contacts</span>
          <span>Username</span>
          <span className="text-right">Price</span>
        </div>

        {/* Rows */}
        {eligible.map((acc, i) => {
          const isSelected = selectedIds.includes(acc.id);
          const price = acc.sell_price || 0;
          return (
            <div
              key={acc.id}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => handleToggleSelect(acc.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggleSelect(acc.id);
                }
              }}
              className={cn(
                "grid cursor-pointer grid-cols-1 items-center gap-4 px-6 py-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:grid-cols-[2.25rem_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-x-4",
                i > 0 && "border-t border-slate-900/[0.05] dark:border-white/[0.06]",
                isSelected
                  ? "bg-slate-900/[0.03] dark:bg-white/[0.04]"
                  : "hover:bg-slate-900/[0.015] dark:hover:bg-white/[0.015]"
              )}
            >
              {/* checkbox */}
              <div className="flex justify-center lg:justify-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleSelect(acc.id)}
                  aria-label={`Select account ${acc.phone}`}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-900 dark:accent-white"
                />
              </div>

              {/* account */}
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300",
                    isSelected
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-900/[0.06] text-slate-600 dark:bg-white/[0.08] dark:text-slate-300"
                  )}
                >
                  {acc.first_name ? acc.first_name[0].toUpperCase() : "U"}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {acc.first_name || "Unnamed"} {acc.last_name || ""}
                    </p>
                    {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                  </div>
                  <p className="truncate font-mono text-xs text-slate-400">
                    {acc.phone} · {acc.telegram_id ? `#${acc.telegram_id}` : "—"}
                  </p>
                </div>
              </div>

              {/* age */}
              <div className="flex items-center gap-2 lg:justify-center">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {acc.est_reg_date_age || "—"}
                </span>
              </div>

              {/* spam */}
              <div className="flex items-center gap-2 lg:justify-center">
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

              {/* contacts */}
              <div className="flex items-center gap-2 lg:justify-center">
                <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                  <Users className="h-3 w-3 text-slate-400" />
                  {acc.contacts_count || 0}
                </span>
              </div>

              {/* username */}
              <div className="truncate font-mono text-xs text-slate-500">
                {acc.username ? `@${acc.username}` : "—"}
              </div>

              {/* price */}
              <div className="text-right">
                {price > 0 ? (
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                    Rp {price.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">No price set</span>
                )}
              </div>
            </div>
          );
        })}
      </TradeSurface>

      {/* Selection action bar — only appears once something is picked */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:inset-x-auto sm:right-6 sm:w-[26rem] sm:px-0 sm:pb-0">
          <TradeSurface>
            <div className="px-5 py-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedIds.length} selected
                </p>
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                  Rp {totalReceive.toLocaleString()}
                </p>
              </div>

              <p className="mt-1 text-xs text-slate-400">
                {_("orders.balanceToReceive")} — paid when a buyer purchases.
              </p>

              <div className="mt-4 flex gap-2">
                <TradeButton
                  onClick={() => setSellConfirmOpen(true)}
                  className="flex-1 justify-center"
                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                >
                  List {selectedIds.length} account{selectedIds.length === 1 ? "" : "s"}
                </TradeButton>
                <TradeGhostButton onClick={() => setSelectedIds([])} className="px-4">
                  Clear
                </TradeGhostButton>
              </div>
            </div>
          </TradeSurface>
        </div>
      )}

      {/* Multi-sell confirmation */}
      <ConfirmDialog
        open={sellConfirmOpen}
        onOpenChange={setSellConfirmOpen}
        onConfirm={handleSellConfirm}
        title={_("orders.confirmSellTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              Are you sure you want to sell these {selectedIds.length} Telegram account(s)? This
              will stop all active broadcasting and auto-replies immediately.
            </p>
            <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3.5 text-xs text-gray-600">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-900">
                Price Breakdown
              </p>
              {selectedIds.map((id) => {
                const acc = eligible.find((a) => a.id === id);
                const price = getPriceForAccount(id);
                return (
                  <div key={id} className="flex justify-between">
                    <span className="mr-2 truncate">{acc?.phone || id.slice(0, 8)}</span>
                    <span className="font-semibold text-gray-900">Rp {price.toLocaleString()}</span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                <span className="text-gray-900">Total:</span>
                <span className="font-bold text-emerald-600">
                  Rp {totalReceive.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
              <p className="mb-0.5 font-semibold">⏳ Deferred Payment</p>
              <p>
                Your balance will <strong>not</strong> be credited now. You only receive payment
                when a buyer purchases your listed account(s).
              </p>
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