"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  ShoppingCart,
  AlertCircle,
  Sparkles,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Search,
  ArrowRight,
  Lock,
  Mail,
  RefreshCw,
  Plus,
  Users,
  Calendar,
  Zap,
  SlidersHorizontal,
  X,
  ThumbsDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Eyebrow,
  Chip,
  PriceTag,
  DoubleBezelShell,
  ButtonInButton,
  MetricReadout,
  getCountryFlag,
} from "@/components/layout/trade-surface";
import {
  useMarketplaceStock,
  useMarketplaceStockAccounts,
  useBuyAccount,
  type MarketplaceAccountSummary,
} from "@/hooks/use-marketplace";

export default function BuyAccountsPage() {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  // Stock categories for filter counts
  const {
    data: stockCategories,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
    isRefetching: categoriesRefetching,
  } = useMarketplaceStock();

  // Filters State
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [spamFilter, setSpamFilter] = useState<"all" | "clean" | "risk">("all");
  const [twofaFilter, setTwofaFilter] = useState<"all" | "disabled" | "required">("all");
  const [resaleFilter, setResaleFilter] = useState<"all" | "fresh" | "resale">("all");
  const [sortBy, setSortBy] = useState<"price-asc" | "price-desc" | "contacts-desc">("price-asc");

  // Query accounts based on selected country (or 'all' by default)
  const {
    data: rawAccounts,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
    isRefetching: accountsRefetching,
    error: accountsError,
  } = useMarketplaceStockAccounts(selectedCountry);

  // Buy Dialog State
  const [buyConfirmOpen, setBuyConfirmOpen] = useState(false);
  const [pendingBuyAccount, setPendingBuyAccount] = useState<{
    id: string;
    telegram_id: number | null;
    buy_price: number;
    country_code: string;
    country_name?: string;
    spam_status?: string | null;
    twofa_enabled?: boolean;
    contacts_count?: number;
    est_reg_date_age?: string | null;
  } | null>(null);

  // Success Modal State
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
      await Promise.all([refetchCategories(), refetchAccounts()]);
      toast({
        variant: "success",
        title: "Order Fulfilled",
        description: _("orders.buySuccess") || "Account purchased successfully and transferred to your custody!",
      });
      setBuyConfirmOpen(false);
      setPendingBuyAccount(null);
      setSuccessOpen(true);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "error",
        title: "Purchase Failed",
        description: err?.response?.data?.detail || "Failed to complete account purchase.",
      });
    }
  };

  const balance = user?.balance ?? 0;

  // Total ready stock count across categories
  const totalStockCount = useMemo(() => {
    if (!stockCategories) return 0;
    return stockCategories.reduce((sum, item) => sum + (item.ready_stock || 0), 0);
  }, [stockCategories]);

  // Lowest starting price
  const lowestPrice = useMemo(() => {
    if (!stockCategories || stockCategories.length === 0) return 0;
    const prices = stockCategories.map((s) => s.price).filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [stockCategories]);

  // Filter & sort account list
  const filteredAccounts = useMemo(() => {
    if (!rawAccounts) return [];
    let list = [...rawAccounts];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((acc) => {
        const tid = String(acc.telegram_id || "");
        const ccode = (acc.country_code || "").toLowerCase();
        const cname = (acc.country_name || "").toLowerCase();
        return tid.includes(q) || ccode.includes(q) || cname.includes(q);
      });
    }

    // Filter by SpamBot health
    if (spamFilter === "clean") {
      list = list.filter((acc) => acc.spam_status === "normal");
    } else if (spamFilter === "risk") {
      list = list.filter((acc) => acc.spam_status === "limited" || acc.spam_status === "risk");
    }

    // Filter by 2FA
    if (twofaFilter === "disabled") {
      list = list.filter((acc) => !acc.twofa_enabled);
    } else if (twofaFilter === "required") {
      list = list.filter((acc) => acc.twofa_enabled);
    }

    // Filter by Resale
    if (resaleFilter === "fresh") {
      list = list.filter((acc) => !acc.is_resale);
    } else if (resaleFilter === "resale") {
      list = list.filter((acc) => acc.is_resale);
    }

    // Sort
    list.sort((a, b) => {
      const priceA = a.buy_price ?? a.sell_price ?? 7000;
      const priceB = b.buy_price ?? b.sell_price ?? 7000;
      if (sortBy === "price-asc") return priceA - priceB;
      if (sortBy === "price-desc") return priceB - priceA;
      if (sortBy === "contacts-desc") return (b.contacts_count || 0) - (a.contacts_count || 0);
      return 0;
    });

    return list;
  }, [rawAccounts, searchQuery, spamFilter, twofaFilter, resaleFilter, sortBy]);

  const hasActiveFilters =
    selectedCountry !== "all" ||
    searchQuery.trim() !== "" ||
    spamFilter !== "all" ||
    twofaFilter !== "all" ||
    resaleFilter !== "all";

  const clearAllFilters = () => {
    setSelectedCountry("all");
    setSearchQuery("");
    setSpamFilter("all");
    setTwofaFilter("all");
    setResaleFilter("all");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      variant: "success",
      title: "Copied",
      description: `${label} copied to clipboard!`,
    });
  };

  const isRefreshing = categoriesRefetching || accountsRefetching;

  return (
    <div className="space-y-6 pb-28">
      {/* ── Top Command Bar & Atmosphere ─────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Eyebrow>Marketplace // Escrow Exchange</Eyebrow>
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Custody Pool
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {_("orders.buyAccounts") || "Buy Telegram Accounts"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Acquire pre-warmed, non-restricted Telegram sessions with verified MTProto credentials and 30-minute automated escrow replacement warranty.
          </p>
        </div>

        {/* Balance Card & Wallet Top-up */}
        <div className="flex items-center gap-3 shrink-0">
          <DoubleBezelShell className="w-full sm:w-auto" innerClassName="p-3 sm:p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="space-y-0.5 min-w-[120px]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {_("orders.yourBalance") || "Available Balance"}
                </p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  Rp {balance.toLocaleString()}
                </p>
              </div>
              <Link href="/wallet">
                <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg text-xs font-semibold">
                  <Plus className="h-3 w-3" />
                  Top Up
                </Button>
              </Link>
            </div>
          </DoubleBezelShell>
        </div>
      </div>

      {/* ── KPI & Escrow Readout Bar ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricReadout
          label="Total Ready Stock"
          value={totalStockCount.toLocaleString()}
          subtext="Verified MTProto sessions"
          icon={<ShoppingCart className="h-4 w-4 text-primary" />}
        />
        <MetricReadout
          label="Starting From"
          value={<PriceTag value={lowestPrice} size="lg" />}
          subtext="Regional tier pricing"
          icon={<Sparkles className="h-4 w-4 text-amber-500" />}
        />
        <MetricReadout
          label="Coverage"
          value={`${stockCategories?.length || 0} Regions`}
          subtext="Global carrier prefixes"
          icon={<span className="text-base">🌐</span>}
        />
        <MetricReadout
          label="Escrow Protection"
          value="30-Min Warranty"
          subtext="Auto-replacement on login fail"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />}
          badge={<Chip tone="positive" dot>Active</Chip>}
        />
      </div>

      {/* ── Filter Engine (Country Pills + Search + Filters) ─────────── */}
      <div className="space-y-3.5 rounded-2xl border border-border/80 bg-card/40 p-4 sm:p-5 backdrop-blur-sm shadow-xs">
        {/* Country Filter Pills Ribbon */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>Filter By Country / Region</span>
              {stockCategories && (
                <span className="text-foreground/70 font-mono text-[10px]">({stockCategories.length} available)</span>
              )}
            </span>

            <button
              onClick={() => {
                refetchCategories();
                refetchAccounts();
              }}
              disabled={isRefreshing}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
              <span>Refresh Pool</span>
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {/* 'All Countries' Pill */}
            <button
              onClick={() => setSelectedCountry("all")}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all select-none border",
                selectedCountry === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-card border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              <span className="text-sm">🌐</span>
              <span>All Countries</span>
              <span
                className={cn(
                  "ml-0.5 rounded-md px-1.5 py-0.2 font-mono text-[10px]",
                  selectedCountry === "all" ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {totalStockCount}
              </span>
            </button>

            {/* Individual Country Category Pills */}
            {stockCategories?.map((cat) => {
              const flag = getCountryFlag(cat.country_code);
              const isSelected = selectedCountry === cat.country_code;

              return (
                <button
                  key={cat.country_code}
                  onClick={() => setSelectedCountry(isSelected ? "all" : cat.country_code)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all select-none border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                      : "bg-card border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <span className="text-sm">{flag}</span>
                  <span>{cat.country_name}</span>
                  <span className="font-mono text-[10px] opacity-70">({cat.country_code})</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.2 font-mono text-[10px]",
                      isSelected ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {cat.ready_stock}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Filters Bar: Search + Tag Controls + Sorting */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-t border-border/50 pt-3.5">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, country name, or dial prefix..."
              className="w-full h-8.5 rounded-xl border border-input bg-background/80 pl-8.5 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Quick Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Spam Filter */}
            <div className="flex items-center rounded-lg border border-input bg-background/60 p-0.5 text-xs">
              <button
                onClick={() => setSpamFilter("all")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  spamFilter === "all" ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Spam: All
              </button>
              <button
                onClick={() => setSpamFilter("clean")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors flex items-center gap-1",
                  spamFilter === "clean" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Clean Only
              </button>
            </div>

            {/* 2FA Filter */}
            <div className="flex items-center rounded-lg border border-input bg-background/60 p-0.5 text-xs">
              <button
                onClick={() => setTwofaFilter("all")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  twofaFilter === "all" ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                2FA: All
              </button>
              <button
                onClick={() => setTwofaFilter("disabled")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  twofaFilter === "disabled" ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Disabled
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-lg border border-input bg-background/80 px-2.5 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="price-asc">Price: Lowest First</option>
              <option value="price-desc">Price: Highest First</option>
              <option value="contacts-desc">Most Contacts</option>
            </select>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Status Count Bar ─────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <p>
          Showing <strong className="text-foreground font-semibold">{filteredAccounts.length}</strong> available accounts
          {selectedCountry !== "all" && ` in ${stockCategories?.find((s) => s.country_code === selectedCountry)?.country_name || selectedCountry}`}
        </p>
      </div>

      {/* ── Account Cards Feed ──────────────────────────────────── */}
      {accountsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted/60 animate-pulse border border-border/40" />
          ))}
        </div>
      ) : accountsError ? (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">Unable to Load Accounts</p>
            <p className="opacity-90">There was an error communicating with the marketplace inventory.</p>
          </div>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <DoubleBezelShell>
          <div className="py-14 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
              <ShoppingCart className="h-6 w-6 opacity-60" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                {hasActiveFilters ? "No accounts match current filters" : "No Ready Stock in this Category"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {hasActiveFilters
                  ? "Try adjusting your search query, country selection, or spam filters to see more results."
                  : "All accounts in this category are currently sold out. Fresh sessions arrive continuously."}
              </p>
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="rounded-xl text-xs font-semibold"
              >
                Clear All Filters
              </Button>
            )}
          </div>
        </DoubleBezelShell>
      ) : (
        <div className="space-y-3.5">
          {filteredAccounts.map((acc) => {
            const price = acc.buy_price ?? acc.sell_price ?? 7000;
            const canAfford = !user || user.balance >= price;
            const countryCode = acc.country_code || selectedCountry;
            const flag = getCountryFlag(countryCode);
            const countryName = acc.country_name || (countryCode === "+62" ? "Indonesia" : countryCode === "+91" ? "India" : "Telegram Account");

            return (
              <DoubleBezelShell
                key={acc.id}
                hover
                innerClassName="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* ── Left Content (Identity + Tags + Metadata) ─────── */}
                <div className="space-y-2.5 min-w-0 flex-1">
                  {/* Title & Identity Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl sm:text-2xl shrink-0 leading-none select-none">
                      {flag}
                    </span>
                    <h3 className="font-bold text-foreground text-sm sm:text-base flex items-center gap-1.5">
                      <span>{countryName}</span>
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        ({countryCode})
                      </span>
                      <span className="text-muted-foreground/60">•</span>
                      <span className="font-mono text-xs font-semibold text-foreground/90">
                        ID: {acc.telegram_id || "Unassigned"}
                      </span>
                      <span className="text-muted-foreground/60">•</span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {acc.is_resale ? "Resale Asset" : "Standard MTProto"}
                      </span>
                    </h3>
                  </div>

                  {/* Badges / Chips Row (Inspired by Padang Store screenshot reference) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* SpamBot Health Chip */}
                    {acc.spam_status === "normal" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Check className="h-3 w-3 shrink-0" />
                        Spam Clean
                      </span>
                    ) : acc.spam_status === "limited" || acc.spam_status === "risk" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        <ThumbsDown className="h-3 w-3 shrink-0" />
                        Spam Risk
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium bg-muted/80 text-muted-foreground border border-border/60">
                        Unchecked
                      </span>
                    )}

                    {/* Account Age Chip */}
                    <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium bg-foreground/[0.04] text-foreground border border-foreground/[0.08]">
                      {acc.est_reg_date_age ? `Age: ${acc.est_reg_date_age}` : "New Session"}
                    </span>

                    {/* 2FA Status Chip */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium border",
                        acc.twofa_enabled
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                          : "bg-foreground/[0.04] text-foreground border-foreground/[0.08]"
                      )}
                    >
                      <Lock className="h-3 w-3 shrink-0 opacity-70" />
                      {acc.twofa_enabled ? "2FA Required" : "2FA Disabled"}
                    </span>

                    {/* Category Type Chip */}
                    <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-medium bg-foreground/[0.03] text-muted-foreground border border-foreground/[0.06]">
                      {acc.is_resale ? "Resale" : "Personal"}
                    </span>

                    {/* Recovery Email Chip */}
                    {acc.recovery_email_available && (
                      <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                        <Mail className="h-3 w-3" />
                        Recovery Email
                      </span>
                    )}
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-3.5 text-xs text-muted-foreground/90 pt-0.5">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
                      <span>{acc.contacts_count || 0} contacts</span>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
                      <span>
                        {acc.est_reg_date
                          ? `Registered ${new Date(acc.est_reg_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
                          : "Verified MTProto"}
                      </span>
                    </span>

                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>30-Min Warranty Escrow</span>
                    </span>
                  </div>
                </div>

                {/* ── Right Content (Verification Badge + Price + Actions) ── */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 shrink-0 border-t lg:border-t-0 border-border/50 pt-3 lg:pt-0">
                  {/* Verified Escrow Desk Badge */}
                  <div className="hidden lg:flex items-center gap-1.5 text-right">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                      ✓
                    </div>
                    <div className="space-y-0 text-[11px]">
                      <span className="font-semibold text-foreground">TeleBos Escrow</span>
                      <span className="text-[10px] text-muted-foreground block">Verified Seller Pool</span>
                    </div>
                  </div>

                  {/* Price Tag */}
                  <div className="text-left lg:text-right space-y-0.5">
                    <PriceTag
                      value={price}
                      size="xl"
                      className="text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                    />
                    {!canAfford && (
                      <p className="text-[10px] font-medium text-destructive">
                        Needs Rp {(price - balance).toLocaleString()} more
                      </p>
                    )}
                  </div>

                  {/* Action CTA Button */}
                  <div className="flex items-center gap-2">
                    <ButtonInButton
                      size="md"
                      onClick={() => {
                        setPendingBuyAccount({
                          id: acc.id,
                          telegram_id: acc.telegram_id,
                          buy_price: price,
                          country_code: countryCode,
                          country_name: countryName,
                          spam_status: acc.spam_status,
                          twofa_enabled: acc.twofa_enabled,
                          contacts_count: acc.contacts_count,
                          est_reg_date_age: acc.est_reg_date_age,
                        });
                        setBuyConfirmOpen(true);
                      }}
                      disabled={!canAfford}
                      className={cn(
                        "h-10 px-5 text-xs font-bold rounded-xl",
                        canAfford
                          ? "bg-amber-500 hover:bg-amber-600 text-black shadow-md shadow-amber-500/20"
                          : "opacity-40"
                      )}
                      icon={<Zap className="h-3.5 w-3.5" />}
                    >
                      {canAfford ? "Buy Now" : "Insufficient Balance"}
                    </ButtonInButton>
                  </div>
                </div>
              </DoubleBezelShell>
            );
          })}
        </div>
      )}

      {/* ── High-End Double-Bezel Confirmation Modal ──────────────── */}
      <ConfirmDialog
        open={buyConfirmOpen}
        onOpenChange={setBuyConfirmOpen}
        onConfirm={handleBuyConfirm}
        title="Confirm Telegram Account Purchase"
        message={
          <div className="space-y-4 text-left">
            <p className="text-xs text-muted-foreground leading-relaxed">
              You are acquiring permanent custody of this verified Telegram account. The session archive will be decrypted and delivered to your account vault immediately.
            </p>

            {pendingBuyAccount && (
              <DoubleBezelShell innerClassName="p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {getCountryFlag(pendingBuyAccount.country_code)}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Region: {pendingBuyAccount.country_name || pendingBuyAccount.country_code} ({pendingBuyAccount.country_code})
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        User ID: {pendingBuyAccount.telegram_id || "Unassigned"}
                      </p>
                    </div>
                  </div>
                  <Chip
                    tone={pendingBuyAccount.spam_status === "normal" ? "positive" : "neutral"}
                    dot={pendingBuyAccount.spam_status === "normal"}
                  >
                    {pendingBuyAccount.spam_status === "normal" ? "Clean SpamBot" : "Standard"}
                  </Chip>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unit Price:</span>
                    <PriceTag value={pendingBuyAccount.buy_price} size="sm" />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Escrow Verification Fee:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Rp 0 (Waived)</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1.5 font-medium">
                    <span className="text-foreground">Total Deducted:</span>
                    <PriceTag value={pendingBuyAccount.buy_price} size="md" className="text-primary font-bold" />
                  </div>
                </div>

                {user && (
                  <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] border border-border/40 px-2.5 py-1.5 text-[11px]">
                    <span className="text-muted-foreground">Your Balance:</span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        user.balance < pendingBuyAccount.buy_price
                          ? "text-destructive"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      Rp {user.balance.toLocaleString()}
                    </span>
                  </div>
                )}
              </DoubleBezelShell>
            )}

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <p className="leading-relaxed text-[11px]">
                <strong>30-Minute Escrow Warranty:</strong> If session credentials or MTProto auth keys fail upon initial sync, your balance will be refunded immediately.
              </p>
            </div>
          </div>
        }
        confirmText="Confirm & Pay"
        cancelText="Cancel"
        variant="info"
        loading={buyMutation.isPending}
      />

      {/* ── High-End Success & Custody Transfer Modal ─────────────── */}
      {successOpen && boughtAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-md"
            onClick={() => setSuccessOpen(false)}
          />
          <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <DoubleBezelShell
              tone="emerald"
              innerClassName="p-6 text-center space-y-5"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
                <CheckCircle2 className="h-7 w-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  Account Custody Transferred!
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The MTProto session has been bound to your workspace. Full credentials and session keys are ready.
                </p>
              </div>

              {/* Credential Data Box */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 text-left space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Phone Number:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-foreground">
                      {boughtAccount.phone}
                    </span>
                    <button
                      onClick={() => copyToClipboard(boughtAccount.phone, "Phone")}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title="Copy Phone"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">User ID:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-foreground">
                      {boughtAccount.telegram_id || "—"}
                    </span>
                    {boughtAccount.telegram_id && (
                      <button
                        onClick={() =>
                          copyToClipboard(String(boughtAccount.telegram_id), "User ID")
                        }
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        title="Copy User ID"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {(boughtAccount.first_name || boughtAccount.last_name) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Profile Name:</span>
                    <span className="font-medium text-foreground">
                      {boughtAccount.first_name || ""} {boughtAccount.last_name || ""}
                    </span>
                  </div>
                )}

                {boughtAccount.username && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-mono text-primary font-medium">
                      @{boughtAccount.username}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <ButtonInButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                    window.location.href = "/accounts";
                  }}
                  className="flex-1 justify-center"
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  Manage in My Accounts
                </ButtonInButton>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                  }}
                  className="h-10 rounded-xl text-xs font-semibold"
                >
                  Continue Shopping
                </Button>
              </div>
            </DoubleBezelShell>
          </div>
        </div>
      )}
    </div>
  );
}