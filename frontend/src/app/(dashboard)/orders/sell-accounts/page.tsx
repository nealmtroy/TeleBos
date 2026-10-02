"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  DollarSign,
  AlertCircle,
  Wallet,
  ShieldAlert,
  Check,
  Search,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowRight,
  UserCheck,
  Calendar,
  Lock,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  Eyebrow,
  Chip,
  PriceTag,
  DoubleBezelShell,
  ButtonInButton,
  MetricReadout,
} from "@/components/layout/trade-surface";
import {
  isMarketplaceSellUnknownOutcome,
  useSellEligibleAccounts,
  useSellAccounts,
} from "@/hooks/use-marketplace";
import type { Account } from "@/hooks/use-accounts";

export default function SellAccountsPage() {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: eligible, isLoading, error, refetch, isRefetching } = useSellEligibleAccounts();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sellConfirmOpen, setSellConfirmOpen] = useState(false);
  const [selling, setSelling] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [spamFilter, setSpamFilter] = useState<"all" | "clean">("all");

  const sellMutation = useSellAccounts();

  const getPriceForAccount = (id: string): number => {
    if (!eligible) return 0;
    const acc = eligible.find((a) => a.id === id);
    return acc?.sell_price || 0;
  };

  // Filtered accounts
  const filteredEligible = useMemo(() => {
    if (!eligible) return [];
    let list = eligible;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (acc) =>
          acc.phone.toLowerCase().includes(q) ||
          (acc.first_name && acc.first_name.toLowerCase().includes(q)) ||
          (acc.last_name && acc.last_name.toLowerCase().includes(q)) ||
          (acc.username && acc.username.toLowerCase().includes(q))
      );
    }

    if (spamFilter === "clean") {
      list = list.filter((acc) => acc.spam_status === "normal");
    }

    return list;
  }, [eligible, searchQuery, spamFilter]);

  const handleSelectAll = () => {
    if (!filteredEligible) return;
    if (selectedIds.length === filteredEligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredEligible.map((acc) => acc.id));
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
        title: "Accounts Listed For Sale",
        description: _("orders.sellSuccess") || `${selectedIds.length} account(s) submitted to marketplace escrow successfully!`,
      });
      setSelectedIds([]);
      setSellConfirmOpen(false);
    } catch (err: any) {
      console.error(err);
      const isUnknownOutcome = isMarketplaceSellUnknownOutcome(err);
      toast({
        variant: "error",
        title: isUnknownOutcome ? "Sale status needs confirmation" : "Submission Failed",
        description: isUnknownOutcome
          ? "Telegram may have finished updating this account. We refreshed your accounts—check its sale status before trying again."
          : err?.response?.data?.detail || "Failed to list account(s) for sale.",
      });
      if (isUnknownOutcome) {
        setSelectedIds([]);
        setSellConfirmOpen(false);
      }
    } finally {
      setSelling(false);
    }
  };

  const totalReceive = selectedIds.reduce(
    (sum, id) => sum + getPriceForAccount(id),
    0
  );
  const allFilteredSelected =
    filteredEligible.length > 0 && selectedIds.length === filteredEligible.length;

  const totalPotentialValue = useMemo(() => {
    if (!eligible) return 0;
    return eligible.reduce((sum, acc) => sum + (acc.sell_price || 0), 0);
  }, [eligible]);

  return (
    <div className="space-y-6 pb-32">
      {/* ── Top Command Bar ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Eyebrow>Liquidation // OTC Desk</Eyebrow>
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Automated Appraisal
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {_("orders.sellAccounts") || "Sell Telegram Accounts"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Monetize your verified Telegram sessions. Once listed, your accounts are presented to active buyers and settled directly into your platform wallet.
          </p>
        </div>

        {/* Balance Card */}
        <div className="flex items-center gap-3 shrink-0">
          <DoubleBezelShell className="w-full sm:w-auto" innerClassName="p-3 sm:p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="space-y-0.5 min-w-[120px]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {_("orders.yourBalance") || "Available Balance"}
                </p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  Rp {(user?.balance ?? 0).toLocaleString()}
                </p>
              </div>
              <Link href="/wallet">
                <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg text-xs font-semibold">
                  <Plus className="h-3 w-3" />
                  Wallet
                </Button>
              </Link>
            </div>
          </DoubleBezelShell>
        </div>
      </div>

      {/* ── KPI Readout Bar ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricReadout
          label="Eligible Accounts"
          value={eligible?.length ?? 0}
          subtext="Ready for instant marketplace listing"
          icon={<UserCheck className="h-4 w-4 text-primary" />}
        />
        <MetricReadout
          label="Estimated Value"
          value={<PriceTag value={totalPotentialValue} size="lg" />}
          subtext="Total potential liquidation payout"
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
        />
        <MetricReadout
          label="Settlement Rail"
          value="Instant Payout"
          subtext="Direct wallet credit upon buyer checkout"
          icon={<Sparkles className="h-4 w-4 text-amber-500" />}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* ── Terms & Deferred Settlement Notice ───────────────────── */}
      <DoubleBezelShell
        tone="amber"
        innerClassName="p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <DollarSign className="h-5 w-5" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Algorithmic Pricing & Escrow Settlement Rules
              </h3>
              <Chip tone="caution" dot>Escrow Notice</Chip>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs text-muted-foreground">
              <div className="space-y-1 rounded-xl bg-background/50 border border-border/40 p-2.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-amber-500">1.</span> Dynamic Prefix Appraisal
                </span>
                <p className="text-[11px] leading-relaxed">
                  Price is computed automatically based on carrier country prefix, account registration age, and SpamBot health status.
                </p>
              </div>
              <div className="space-y-1 rounded-xl bg-background/50 border border-border/40 p-2.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-amber-500">2.</span> Deferred Settlement
                </span>
                <p className="text-[11px] leading-relaxed">
                  Funds are <strong>not</strong> credited immediately. Balance will be deposited the exact instant a buyer purchases your listed account.
                </p>
              </div>
              <div className="space-y-1 rounded-xl bg-background/50 border border-border/40 p-2.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-amber-500">3.</span> Automated Custody
                </span>
                <p className="text-[11px] leading-relaxed">
                  Active broadcasts and auto-replies for the listed accounts will be paused to preserve session integrity for the buyer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DoubleBezelShell>

      {/* ── Loading, Error or Empty States ───────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/60 animate-pulse border border-border/40" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">Unable to Load Eligible Accounts</p>
            <p className="opacity-90">There was a network or server error fetching your accounts.</p>
          </div>
        </div>
      ) : !eligible || eligible.length === 0 ? (
        <DoubleBezelShell>
          <div className="py-16 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
              <DollarSign className="h-7 w-7 opacity-60" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-foreground">
                {_("orders.noEligibleAccounts") || "No Eligible Accounts For Sale"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All your connected Telegram sessions are either currently listed in escrow, sold, or unverified. Connect fresh sessions to monetize them.
              </p>
            </div>
            <Link href="/accounts">
              <ButtonInButton
                size="sm"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                className="mx-auto"
              >
                Go to Accounts Hub
              </ButtonInButton>
            </Link>
          </div>
        </DoubleBezelShell>
      ) : (
        <div className="space-y-4">
          {/* ── Search & Filter Controls ───────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-y border-border/50 py-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by phone, name, or username..."
                className="w-full h-9 rounded-xl border border-border/90 dark:border-slate-700/80 bg-card/60 dark:bg-slate-900/90 pl-9 pr-4 text-xs font-medium text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 focus:ring-offset-transparent focus:border-primary transition-[border-color,box-shadow] duration-150"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() =>
                  setSpamFilter(spamFilter === "all" ? "clean" : "all")
                }
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
                  spamFilter === "clean"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-card/60 text-muted-foreground border-input hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    spamFilter === "clean" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                  )}
                />
                <span>Clean SpamBot Only</span>
              </button>

              <button
                onClick={() => refetch()}
                disabled={isRefetching}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-card/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Refresh list"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* ── Inventory Table Container ──────────────────────────── */}
          <DoubleBezelShell innerClassName="p-0 overflow-hidden">
            {/* Table Header Bar */}
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2.5">
                <Eyebrow>Inventory</Eyebrow>
                <span className="text-xs text-muted-foreground">
                  {filteredEligible.length} of {eligible.length} accounts eligible
                </span>
                {selectedIds.length > 0 && (
                  <Chip tone="accent">
                    {selectedIds.length} selected
                  </Chip>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-8 rounded-lg text-xs font-semibold"
              >
                {allFilteredSelected ? "Clear Selection" : "Select All Available"}
              </Button>
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 bg-muted/10">
                    <TableHead className="w-12 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={handleSelectAll}
                        aria-label="Select all eligible accounts"
                        className="h-4 w-4 cursor-pointer rounded-md border-border text-primary focus:ring-primary/40"
                      />
                    </TableHead>
                    <TableHead>Account Identity</TableHead>
                    <TableHead className="w-28 text-center">Account Age</TableHead>
                    <TableHead className="w-28 text-center">Spam Health</TableHead>
                    <TableHead className="w-24 text-center">Contacts</TableHead>
                    <TableHead className="w-36">Username</TableHead>
                    <TableHead className="w-36 text-right">Appraised Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEligible.map((acc) => {
                    const isSelected = selectedIds.includes(acc.id);
                    const price = acc.sell_price || 0;

                    return (
                      <TableRow
                        key={acc.id}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/30",
                          isSelected && "bg-primary/[0.04]"
                        )}
                        onClick={() => handleToggleSelect(acc.id)}
                      >
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(acc.id)}
                            aria-label={`Select account ${acc.phone}`}
                            className="h-4 w-4 cursor-pointer rounded-md border-border text-primary focus:ring-primary/40"
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary border border-primary/20">
                              {acc.first_name ? acc.first_name[0].toUpperCase() : "U"}
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {acc.first_name || "Unnamed Account"}{" "}
                                  {acc.last_name || ""}
                                </p>
                                {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                              </div>
                              <p className="font-mono text-xs font-medium text-muted-foreground">
                                {acc.phone}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-center text-xs text-muted-foreground font-medium">
                          {acc.est_reg_date_age || "—"}
                        </TableCell>

                        <TableCell className="text-center">
                          {acc.spam_status === "normal" ? (
                            <Chip tone="positive" dot>Clean</Chip>
                          ) : acc.spam_status === "limited" ? (
                            <Chip tone="negative" dot>Limited</Chip>
                          ) : (
                            <Chip tone="neutral">Unchecked</Chip>
                          )}
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {acc.contacts_count || 0}
                        </TableCell>

                        <TableCell className="truncate font-mono text-xs text-muted-foreground">
                          {acc.username ? `@${acc.username}` : "—"}
                        </TableCell>

                        <TableCell className="text-right">
                          <PriceTag value={price} size="md" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile List View */}
            <div className="divide-y divide-border/60 sm:hidden">
              {filteredEligible.map((acc) => {
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
                      "flex cursor-pointer items-start gap-3 p-4 transition-colors",
                      isSelected && "bg-primary/[0.04]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(acc.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select account ${acc.phone}`}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded-md border-border text-primary focus:ring-primary/40"
                    />

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {acc.first_name || "Unnamed"} {acc.last_name || ""}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{acc.phone}</p>
                        </div>
                        <PriceTag value={price} size="md" />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {acc.spam_status === "normal" ? (
                          <Chip tone="positive" dot>Clean</Chip>
                        ) : acc.spam_status === "limited" ? (
                          <Chip tone="negative" dot>Limited</Chip>
                        ) : (
                          <Chip tone="neutral">Unchecked</Chip>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          Age: {acc.est_reg_date_age || "—"}
                        </span>
                        {acc.username && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            @{acc.username}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </DoubleBezelShell>
        </div>
      )}

      {/* ── Sticky Liquidation Bottom Dock Island ─────────────────── */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4 sm:left-auto sm:right-6 sm:w-[420px] sm:px-0">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xl">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Selected For Liquidation
                  </span>
                  <p className="text-sm font-bold text-foreground">
                    {selectedIds.length} {selectedIds.length === 1 ? "Account" : "Accounts"}
                  </p>
                </div>

                <div className="text-right space-y-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Estimated Proceeds
                  </span>
                  <div className="text-emerald-600 dark:text-emerald-400">
                    <PriceTag value={totalReceive} size="lg" className="text-emerald-600 dark:text-emerald-400 font-bold" />
                  </div>
                </div>
              </div>

              {/* Selected Accounts Mini Scroll */}
              <div className="max-h-24 overflow-y-auto space-y-1 rounded-lg bg-muted/40 p-2 text-xs divide-y divide-border/40">
                {selectedIds.map((id) => {
                  const acc = eligible?.find((a) => a.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between py-1 first:pt-0 last:pb-0">
                      <span className="font-mono text-muted-foreground truncate max-w-[180px]">
                        {acc?.phone || id.slice(0, 8)}
                      </span>
                      <PriceTag value={getPriceForAccount(id)} size="sm" />
                    </div>
                  );
                })}
              </div>

              <Button
                variant="default"
                size="default"
                onClick={() => setSellConfirmOpen(true)}
                className="w-full justify-center gap-2 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs shadow-sm"
              >
                <DollarSign className="h-4 w-4" />
                <span>List {selectedIds.length} Account(s) For Sale</span>
              </Button>

              <p className="text-center text-xs text-muted-foreground/80 leading-tight">
                Funds settled into wallet immediately upon buyer purchase.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── High-End Sell Confirmation Modal ──────────────────────── */}
      <ConfirmDialog
        open={sellConfirmOpen}
        onOpenChange={setSellConfirmOpen}
        onConfirm={handleSellConfirm}
        title="Confirm Marketplace Liquidation"
        message={
          <div className="space-y-4 text-left">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to list these {selectedIds.length} Telegram account(s) for sale?
              Active automation (broadcasting and auto-replies) will be suspended on these sessions to maintain buyer trust.
            </p>

            <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Itemized Valuation Breakdown
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs divide-y divide-border/40">
                {selectedIds.map((id) => {
                  const acc = eligible?.find((a) => a.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between pt-1.5 first:pt-0">
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-semibold text-foreground">
                          {acc?.first_name || "Unnamed"} ({acc?.phone})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Age: {acc?.est_reg_date_age || "—"} · Contacts: {acc?.contacts_count || 0}
                        </p>
                      </div>
                      <PriceTag value={getPriceForAccount(id)} size="sm" />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-2 font-medium">
                <span className="text-foreground text-xs font-semibold">Total Estimated Payout:</span>
                <PriceTag value={totalReceive} size="lg" className="text-emerald-600 dark:text-emerald-400 font-bold" />
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-400 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Deferred Wallet Settlement
              </p>
              <p className="text-[11px] leading-relaxed opacity-90">
                Your wallet balance is credited automatically at the moment a buyer pays for your listed account. You can withdraw or use these credits immediately upon sale.
              </p>
            </div>
          </div>
        }
        confirmText="Confirm & List For Sale"
        cancelText="Cancel"
        variant="warning"
        loading={selling}
      />
    </div>
  );
}