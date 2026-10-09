"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { DataPagination } from "@/components/ui/pagination";
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
import { Checkbox } from "@/components/ui/checkbox";
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

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
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

  // Reset pagination on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, spamFilter]);

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
          (acc.username && acc.username.toLowerCase().includes(q)) ||
          (acc.telegram_id && String(acc.telegram_id).includes(q))
      );
    }

    if (spamFilter === "clean") {
      list = list.filter((acc) => acc.spam_status === "normal");
    }

    return list;
  }, [eligible, searchQuery, spamFilter]);

  // Only active (non-expired) accounts can be selected and listed
  const sellableAccounts = useMemo(() => {
    return filteredEligible.filter((acc) => acc.is_active !== false);
  }, [filteredEligible]);

  const totalPages = Math.max(1, Math.ceil(filteredEligible.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEligible = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEligible.slice(start, start + PAGE_SIZE);
  }, [filteredEligible, currentPage]);

  const allFilteredSelected =
    sellableAccounts.length > 0 &&
    sellableAccounts.every((acc) => selectedIds.includes(acc.id));

  const someFilteredSelected =
    selectedIds.length > 0 &&
    !allFilteredSelected &&
    sellableAccounts.some((acc) => selectedIds.includes(acc.id));

  const handleSelectAll = () => {
    if (sellableAccounts.length === 0) return;
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sellableAccounts.map((acc) => acc.id));
    }
  };

  const handleToggleSelect = (acc: Account) => {
    if (acc.is_active === false) {
      toast({
        variant: "warning",
        title: _("orders.accountExpiredCannotSell") || "Akun Kedaluwarsa",
        description:
          _("orders.accountExpiredCannotSellDesc") ||
          "Akun kedaluwarsa tidak dapat dijual. Silakan hubungkan ulang akun terlebih dahulu.",
      });
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(acc.id) ? prev.filter((item) => item !== acc.id) : [...prev, acc.id]
    );
  };

  const handleSellConfirm = async () => {
    if (selectedIds.length === 0) return;

    // Guard against expired / inactive accounts
    const expiredSelected = eligible?.find(
      (a) => selectedIds.includes(a.id) && a.is_active === false
    );
    if (expiredSelected) {
      toast({
        variant: "error",
        title: _("orders.submissionFailed") || "Submission Failed",
        description:
          _("orders.accountExpiredCannotSell") ||
          "Akun kedaluwarsa tidak dapat dijual. Periksa status akun lalu coba lagi.",
      });
      return;
    }

    setSelling(true);
    try {
      await sellMutation.mutateAsync(selectedIds);
      void fetchMe();
      toast({
        variant: "success",
        title: _("orders.accountsListedSuccess") || "Accounts Listed For Sale",
        description:
          _("orders.sellSuccess") ||
          `${selectedIds.length} account(s) submitted to marketplace escrow successfully!`,
      });
      setSelectedIds([]);
      setSellConfirmOpen(false);
    } catch (err: any) {
      console.error(err);
      const isUnknownOutcome = isMarketplaceSellUnknownOutcome(err);
      const rawDetail = err?.response?.data?.detail;
      let errorDesc = rawDetail;
      if (typeof rawDetail === "string" && rawDetail.toLowerCase().includes("inactive account")) {
        errorDesc = _("orders.accountExpiredCannotSell") || "Akun kedaluwarsa tidak dapat dijual";
      }
      toast({
        variant: "error",
        title: isUnknownOutcome
          ? (_("orders.saleStatusNeedsConfirmation") || "Sale status needs confirmation")
          : (_("orders.submissionFailed") || "Submission Failed"),
        description: isUnknownOutcome
          ? (_("orders.saleStatusUnknownDesc") || "Telegram may have finished updating this account. We refreshed your accounts—check its sale status before trying again.")
          : errorDesc || (_("orders.accountExpiredCannotSell") || "Failed to list account(s) for sale."),
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
            <Eyebrow>{_("orders.liquidationDesk") || "Liquidation // OTC Desk"}</Eyebrow>
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {_("orders.automatedAppraisal") || "Automated Appraisal"}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {_("orders.sellAccounts") || "Sell Telegram Accounts"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {_("orders.sellDesc") || "Monetize your verified Telegram sessions. Once listed, your accounts are presented to active buyers and settled directly into your platform wallet."}
          </p>
        </div>

        {/* Unified Balance Card */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="space-y-0.5 min-w-[120px]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {_("orders.yourBalance") || "Available Balance"}
                </p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  Rp {(user?.balance ?? 0).toLocaleString("id-ID")}
                </p>
              </div>
              <Link href="/wallet">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs font-semibold">
                  <Plus className="h-3.5 w-3.5" />
                  {_("orders.topUp") || "Top Up"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Readout Bar ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricReadout
          label={_("orders.eligibleAccounts") || "Eligible Accounts"}
          value={eligible?.length ?? 0}
          subtext={_("orders.verifiedSessions") || "Ready for instant marketplace listing"}
          icon={<UserCheck className="h-4 w-4 text-primary" />}
        />
        <MetricReadout
          label={_("orders.estimatedValue") || "Estimated Value"}
          value={<PriceTag value={totalPotentialValue} size="lg" />}
          subtext={_("orders.potentialPayout") || "Total potential liquidation payout"}
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
        />
        <MetricReadout
          label={_("orders.settlementRail") || "Settlement Rail"}
          value={_("orders.instantPayout") || "Instant Payout"}
          subtext={_("orders.directWalletCredit") || "Direct wallet credit upon buyer checkout"}
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
                {_("orders.pricingNoticeTitle") || "Algorithmic Pricing & Escrow Settlement Rules"}
              </h3>
              <Chip tone="caution" dot>{_("orders.escrowNoticeBadge") || "Escrow Notice"}</Chip>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs text-muted-foreground">
              <div className="space-y-1 rounded-xl bg-background/50 border border-border/40 p-2.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-amber-500 font-bold">1.</span> {_("orders.ruleDynamicTitle") || "Dynamic Prefix Appraisal"}
                </span>
                <p className="text-[11px] leading-relaxed">
                  {_("orders.ruleDynamicDesc") || "Price is computed automatically based on carrier country prefix, account registration age, and SpamBot health status."}
                </p>
              </div>
              <div className="space-y-1 rounded-xl bg-background/50 border border-border/40 p-2.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-amber-500 font-bold">2.</span> {_("orders.ruleDeferredTitle") || "Deferred Settlement"}
                </span>
                <p className="text-[11px] leading-relaxed">
                  {_("orders.ruleDeferredDesc") || "Funds are not credited immediately. Balance will be deposited the exact instant a buyer purchases your listed account."}
                </p>
              </div>
              <div className="space-y-1 rounded-xl bg-background/50 border border-border/40 p-2.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-amber-500 font-bold">3.</span> {_("orders.ruleCustodyTitle") || "Session Custody & Integrity"}
                </span>
                <p className="text-[11px] leading-relaxed">
                  {_("orders.ruleCustodyDesc") || "Active broadcasts and auto-replies for the listed accounts will be paused to preserve session integrity for the buyer."}
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
            <p className="font-semibold">{_("orders.unableToLoadEligible") || "Unable to Load Eligible Accounts"}</p>
            <p className="opacity-90">{_("orders.errorFetchingEligible") || "There was a network or server error fetching your accounts."}</p>
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
                {_("orders.noSellableAccountsTitle") || "No Eligible Accounts For Sale"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {_("orders.noSellableAccountsDesc") || "All your connected Telegram sessions are either currently listed in escrow, sold, or unverified. Connect fresh sessions to monetize them."}
              </p>
            </div>
            <Link href="/accounts">
              <ButtonInButton
                size="sm"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                className="mx-auto"
              >
                {_("orders.goToAccountsHub") || "Go to Accounts Hub"}
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
                id="sell-accounts-search"
                name="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={_("orders.searchSellPlaceholder") || "Search by phone, name, or username"}
                placeholder={_("orders.searchSellPlaceholder") || "Search by phone, name, or username..."}
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
                <span>{_("orders.cleanSpamBotOnly") || "Clean SpamBot Only"}</span>
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
                  {_("orders.accountsEligibleCount", { filtered: filteredEligible.length, total: eligible.length })}
                </span>
                {selectedIds.length > 0 && (
                  <Chip tone="accent">
                    {_("orders.selectedCount", { count: selectedIds.length })}
                  </Chip>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-8 rounded-lg text-xs font-semibold"
                disabled={sellableAccounts.length === 0}
              >
                {allFilteredSelected ? (_("orders.clearSelection") || "Clear Selection") : (_("orders.selectAllAvailable") || "Select All Available")}
              </Button>
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 bg-muted/10">
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                        onCheckedChange={handleSelectAll}
                        disabled={sellableAccounts.length === 0}
                        aria-label="Select all eligible accounts"
                      />
                    </TableHead>
                    <TableHead>{_("orders.accountIdentity") || "Account Identity"}</TableHead>
                    <TableHead className="w-28 text-center">{_("orders.accountAgeCol") || "Account Age"}</TableHead>
                    <TableHead className="w-28 text-center">{_("orders.spamHealthCol") || "Spam Health"}</TableHead>
                    <TableHead className="w-24 text-center">{_("accountDetail.contacts") || "Contacts"}</TableHead>
                    <TableHead className="w-36">{_("accountDetail.username") || "Username"}</TableHead>
                    <TableHead className="w-36 text-right">{_("orders.appraisedPayout") || "Appraised Payout"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEligible.map((acc) => {
                    const isSelected = selectedIds.includes(acc.id);
                    const isExpired = acc.is_active === false;
                    const price = acc.sell_price || 0;

                    return (
                      <TableRow
                        key={acc.id}
                        className={cn(
                          "transition-colors",
                          isExpired
                            ? "opacity-60 bg-muted/20 cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted/30",
                          isSelected && "bg-primary/[0.04]"
                        )}
                        onClick={() => handleToggleSelect(acc)}
                      >
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={isExpired}
                            onCheckedChange={() => handleToggleSelect(acc)}
                            aria-label={`Select account ${acc.phone}`}
                            title={isExpired ? (_("orders.accountExpiredCannotSell") || "Akun kedaluwarsa tidak dapat dijual") : undefined}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary border border-primary/20">
                              {acc.first_name ? acc.first_name[0].toUpperCase() : "U"}
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {acc.first_name || (_("orders.unnamedAccount") || "Unnamed Account")}{" "}
                                  {acc.last_name || ""}
                                </p>
                                {acc.is_resale && <Chip tone="accent">{_("orders.resale") || "Resale"}</Chip>}
                                {isExpired && (
                                  <Chip tone="negative">{_("accountsList.expired") || "Kedaluwarsa"}</Chip>
                                )}
                              </div>
                              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground flex-wrap">
                                <span>{acc.phone}</span>
                                <span>•</span>
                                <span className="font-semibold text-foreground/80">
                                  User ID: {acc.telegram_id ? acc.telegram_id : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-center text-xs text-muted-foreground font-medium">
                          {acc.est_reg_date_age || "—"}
                        </TableCell>

                        <TableCell className="text-center">
                          {isExpired ? (
                            <Chip tone="negative" dot>{_("accountsList.expired") || "Kedaluwarsa"}</Chip>
                          ) : acc.spam_status === "normal" ? (
                            <Chip tone="positive" dot>{_("orders.clean") || "Clean"}</Chip>
                          ) : acc.spam_status === "limited" ? (
                            <Chip tone="negative" dot>{_("orders.limited") || "Limited"}</Chip>
                          ) : (
                            <Chip tone="neutral">{_("orders.uncheckedSpam") || "Unchecked"}</Chip>
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
              {paginatedEligible.map((acc) => {
                const isSelected = selectedIds.includes(acc.id);
                const isExpired = acc.is_active === false;
                const price = acc.sell_price || 0;

                return (
                  <div
                    key={acc.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => handleToggleSelect(acc)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleToggleSelect(acc);
                      }
                    }}
                    className={cn(
                      "flex items-start gap-3 p-4 transition-colors",
                      isExpired
                        ? "opacity-60 bg-muted/20 cursor-not-allowed"
                        : "cursor-pointer hover:bg-muted/30",
                      isSelected && "bg-primary/[0.04]"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isExpired}
                      onCheckedChange={() => handleToggleSelect(acc)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select account ${acc.phone}`}
                      className="mt-1"
                      title={isExpired ? (_("orders.accountExpiredCannotSell") || "Akun kedaluwarsa tidak dapat dijual") : undefined}
                    />

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {acc.first_name || (_("orders.unnamedAccount") || "Unnamed")} {acc.last_name || ""}
                            </p>
                            {isExpired && (
                              <Chip tone="negative">{_("accountsList.expired") || "Kedaluwarsa"}</Chip>
                            )}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">
                            {acc.phone} • <span className="font-semibold text-foreground/80">User ID: {acc.telegram_id ? acc.telegram_id : "—"}</span>
                          </p>
                        </div>
                        <PriceTag value={price} size="md" />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {isExpired ? (
                          <Chip tone="negative" dot>{_("accountsList.expired") || "Kedaluwarsa"}</Chip>
                        ) : acc.spam_status === "normal" ? (
                          <Chip tone="positive" dot>{_("orders.clean") || "Clean"}</Chip>
                        ) : acc.spam_status === "limited" ? (
                          <Chip tone="negative" dot>{_("orders.limited") || "Limited"}</Chip>
                        ) : (
                          <Chip tone="neutral">{_("orders.uncheckedSpam") || "Unchecked"}</Chip>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {_("orders.accountAgeCol") || "Age"}: {acc.est_reg_date_age || "—"}
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 bg-muted/10 px-4 py-3 sm:px-6">
                <div className="text-xs text-muted-foreground">
                  {_("accountsList.showingAccounts", {
                    start: (currentPage - 1) * PAGE_SIZE + 1,
                    end: Math.min(currentPage * PAGE_SIZE, filteredEligible.length),
                    total: filteredEligible.length,
                  }) || `Menampilkan ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, filteredEligible.length)} dari ${filteredEligible.length} akun`}
                </div>
                <div className="hidden sm:block">
                  <DataPagination
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
                <div className="sm:hidden">
                  <DataPagination
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    compact
                  />
                </div>
              </div>
            )}
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
                    {_("orders.selectedLabel") || "Selected"}
                  </span>
                  <p className="text-sm font-bold text-foreground">
                    {selectedIds.length} {selectedIds.length === 1 ? "Account" : "Accounts"}
                  </p>
                </div>

                <div className="text-right space-y-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {_("orders.totalPayoutLabel") || "Total Payout:"}
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
                <span>{_("orders.sellSelectedBtn") || `List ${selectedIds.length} Account(s) For Sale`}</span>
              </Button>

              <p className="text-center text-xs text-muted-foreground/80 leading-tight">
                {_("orders.settledHint") || "Funds settled into wallet immediately upon buyer purchase."}
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
        title={_("orders.confirmSellModalTitle") || "Confirm Marketplace Liquidation"}
        message={
          <div className="space-y-4 text-left">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {_("orders.sellAgreementDialogNotice", { count: selectedIds.length }) ||
                `Are you sure you want to list these ${selectedIds.length} Telegram account(s) for sale? Active automation (broadcasting and auto-replies) will be suspended on these sessions to maintain buyer trust.`}
            </p>

            <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {_("orders.itemizedValuation") || "Itemized Valuation Breakdown"}
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs divide-y divide-border/40">
                {selectedIds.map((id) => {
                  const acc = eligible?.find((a) => a.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between pt-1.5 first:pt-0">
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-semibold text-foreground">
                          {acc?.first_name || (_("orders.unnamedAccount") || "Unnamed")} ({acc?.phone})
                          {acc?.telegram_id ? ` • UID: ${acc.telegram_id}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {_("orders.accountAgeCol") || "Age"}: {acc?.est_reg_date_age || "—"} · {_("accountDetail.contacts") || "Contacts"}: {acc?.contacts_count || 0}
                        </p>
                      </div>
                      <PriceTag value={getPriceForAccount(id)} size="sm" />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-2 font-medium">
                <span className="text-foreground text-xs font-semibold">{_("orders.estimatedPayoutTotal") || "Total Estimated Payout:"}</span>
                <PriceTag value={totalReceive} size="lg" className="text-emerald-600 dark:text-emerald-400 font-bold" />
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-400 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {_("orders.ruleDeferredTitle") || "Deferred Wallet Settlement"}
              </p>
              <p className="text-[11px] leading-relaxed opacity-90">
                {_("orders.deferredSettlementDesc") ||
                  "Your wallet balance is credited automatically at the moment a buyer pays for your listed account. You can withdraw or use these credits immediately upon sale."}
              </p>
            </div>
          </div>
        }
        confirmText={_("orders.confirmListingBtn") || "Confirm & List For Sale"}
        cancelText={_("orders.cancel") || "Cancel"}
        variant="warning"
        loading={selling}
      />
    </div>
  );
}