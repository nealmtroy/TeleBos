"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  ShoppingCart,
  AlertCircle,
  Sparkles,
  ChevronDown,
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
  LayoutGrid,
  List,
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
  getCountryFlag,
} from "@/components/layout/trade-surface";
import {
  useMarketplaceStock,
  useMarketplaceStockAccounts,
  useBuyAccount,
  type StockCategory,
  type MarketplaceAccountSummary,
} from "@/hooks/use-marketplace";

export default function BuyAccountsPage() {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: stock, isLoading: stockLoading, refetch: refetchStock, isRefetching } = useMarketplaceStock();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"bento" | "table">("bento");

  const [buyConfirmOpen, setBuyConfirmOpen] = useState(false);
  const [pendingBuyAccount, setPendingBuyAccount] = useState<{
    id: string;
    telegram_id: number | null;
    buy_price: number;
    country_code: string;
    spam_status?: string | null;
    twofa_enabled?: boolean;
  } | null>(null);

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

  // Filtered country categories
  const filteredStock = useMemo(() => {
    if (!stock) return [];
    if (!searchQuery.trim()) return stock;
    const query = searchQuery.toLowerCase().trim();
    return stock.filter(
      (cat) =>
        cat.country_name.toLowerCase().includes(query) ||
        cat.country_code.toLowerCase().includes(query)
    );
  }, [stock, searchQuery]);

  // Aggregate metrics
  const totalStockCount = useMemo(() => {
    if (!stock) return 0;
    return stock.reduce((sum, item) => sum + (item.ready_stock || 0), 0);
  }, [stock]);

  const lowestPrice = useMemo(() => {
    if (!stock || stock.length === 0) return 0;
    const prices = stock.map((s) => s.price).filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [stock]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      variant: "success",
      title: "Copied",
      description: `${label} copied to clipboard!`,
    });
  };

  return (
    <div className="space-y-6 pb-20">
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
            Acquire pre-warmed, non-restricted Telegram sessions with verified MTProto credentials and 30-minute automated escrow replacement guarantee.
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
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <MetricReadout
          label="Starting From"
          value={<PriceTag value={lowestPrice} size="lg" />}
          subtext="Regional tier pricing"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <MetricReadout
          label="Coverage"
          value={`${stock?.length || 0} Regions`}
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

      {/* ── Search, Filter & View Controls ───────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-y border-border/50 py-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by country name or dial prefix (e.g. Indonesia, +62)..."
            className="w-full h-9 rounded-xl border border-input bg-card/60 pl-9 pr-4 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => refetchStock()}
            disabled={isRefetching}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-card/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh stock"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
          </button>

          <div className="flex items-center rounded-xl border border-input bg-card/60 p-0.5">
            <button
              onClick={() => setViewMode("bento")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all",
                viewMode === "bento"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bento Grid</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all",
                viewMode === "table"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pro Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Catalog Body ─────────────────────────────────────────── */}
      {stockLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-muted/60 animate-pulse border border-border/40" />
          ))}
        </div>
      ) : !filteredStock || filteredStock.length === 0 ? (
        <DoubleBezelShell>
          <div className="py-16 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
              <ShoppingCart className="h-6 w-6 opacity-60" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                {searchQuery ? "No matching countries found" : "No Ready Stock Available"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? "Try clearing your search query or check back for new regional inventory."
                  : "All accounts are currently reserved or sold. Fresh inventory is synchronized regularly."}
              </p>
            </div>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="rounded-xl text-xs"
              >
                Clear Search
              </Button>
            )}
          </div>
        </DoubleBezelShell>
      ) : (
        <div className="space-y-6">
          {/* Bento Grid View */}
          {viewMode === "bento" && (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredStock.map((cat) => {
                const isExpanded = selectedCountry === cat.country_code;
                const affordable = balance >= cat.price;
                const flag = getCountryFlag(cat.country_code);

                return (
                  <DoubleBezelShell
                    key={cat.country_code}
                    hover
                    selected={isExpanded}
                    onClick={() =>
                      setSelectedCountry(isExpanded ? null : cat.country_code)
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedCountry(isExpanded ? null : cat.country_code);
                      }
                    }}
                    innerClassName="p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] text-2xl shadow-2xs">
                          {flag}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold text-foreground text-sm">
                              {cat.country_name}
                            </h3>
                            <span className="font-mono text-xs font-semibold text-muted-foreground/80 bg-foreground/[0.04] px-1.5 py-0.5 rounded-md border border-foreground/[0.06]">
                              {cat.country_code}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {cat.ready_stock > 0
                              ? `${cat.ready_stock} units in pool`
                              : "Out of stock"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Chip
                          tone={cat.ready_stock > 0 ? "positive" : "neutral"}
                          dot={cat.ready_stock > 0}
                        >
                          {cat.ready_stock} ready
                        </Chip>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Starting Price
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <PriceTag value={cat.price} size="lg" />
                          {!affordable && cat.ready_stock > 0 && (
                            <span className="text-[10px] font-medium text-destructive">
                              needs top-up
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary group">
                        <span>{isExpanded ? "Hide Accounts" : "View Accounts"}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform duration-300",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </div>
                    </div>
                  </DoubleBezelShell>
                );
              })}
            </div>
          )}

          {/* Pro Table View */}
          {viewMode === "table" && (
            <DoubleBezelShell innerClassName="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 bg-muted/30">
                    <TableHead className="w-16 text-center">Flag</TableHead>
                    <TableHead>Country / Region</TableHead>
                    <TableHead className="w-28 text-center">Dial Code</TableHead>
                    <TableHead className="w-32 text-center">Ready Stock</TableHead>
                    <TableHead className="w-36 text-right">Unit Price</TableHead>
                    <TableHead className="w-36 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStock.map((cat) => {
                    const isExpanded = selectedCountry === cat.country_code;
                    const affordable = balance >= cat.price;
                    const flag = getCountryFlag(cat.country_code);

                    return (
                      <TableRow
                        key={cat.country_code}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isExpanded && "bg-primary/[0.04]"
                        )}
                        onClick={() =>
                          setSelectedCountry(isExpanded ? null : cat.country_code)
                        }
                      >
                        <TableCell className="text-center text-xl">
                          {flag}
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold text-foreground text-sm">
                            {cat.country_name}
                          </p>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground">
                          {cat.country_code}
                        </TableCell>
                        <TableCell className="text-center">
                          <Chip
                            tone={cat.ready_stock > 0 ? "positive" : "neutral"}
                            dot={cat.ready_stock > 0}
                          >
                            {cat.ready_stock} units
                          </Chip>
                        </TableCell>
                        <TableCell className="text-right">
                          <PriceTag value={cat.price} size="md" />
                          {!affordable && cat.ready_stock > 0 && (
                            <p className="text-[10px] text-destructive">above balance</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={isExpanded ? "secondary" : "outline"}
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg text-xs"
                          >
                            <span>{isExpanded ? "Collapse" : "Explore"}</span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )}
                            />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DoubleBezelShell>
          )}

          {/* ── Expanded Country Accounts Explorer ─────────────────── */}
          {selectedCountry && (
            <CountryAccountsExplorer
              countryCode={selectedCountry}
              countryName={
                stock?.find((s) => s.country_code === selectedCountry)?.country_name ||
                selectedCountry
              }
              onClose={() => setSelectedCountry(null)}
              onBuyClick={(acc) => {
                setPendingBuyAccount({
                  id: acc.id,
                  telegram_id: acc.telegram_id,
                  buy_price: acc.buy_price ?? acc.sell_price ?? 7000,
                  country_code: selectedCountry,
                  spam_status: acc.spam_status,
                  twofa_enabled: acc.twofa_enabled,
                });
                setBuyConfirmOpen(true);
              }}
            />
          )}
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
                        Region: {pendingBuyAccount.country_code}
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

/**
 * ── Country Accounts Explorer Component ─────────────────────────────
 * Shows granular list of accounts available under the chosen country.
 */
function CountryAccountsExplorer({
  countryCode,
  countryName,
  onClose,
  onBuyClick,
}: {
  countryCode: string;
  countryName: string;
  onClose: () => void;
  onBuyClick: (acc: MarketplaceAccountSummary) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: accounts, isLoading, error } = useMarketplaceStockAccounts(countryCode);
  const [filterSpamOnly, setFilterSpamOnly] = useState(false);

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    if (!filterSpamOnly) return accounts;
    return accounts.filter((a) => a.spam_status === "normal");
  }, [accounts, filterSpamOnly]);

  const flag = getCountryFlag(countryCode);

  if (isLoading) {
    return (
      <DoubleBezelShell>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </DoubleBezelShell>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold">Unable to Load Regional Inventory</p>
          <p className="opacity-90">There was a problem querying accounts for {countryName}.</p>
        </div>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <DoubleBezelShell>
        <div className="py-12 text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            No active listings found for {countryName} ({countryCode})
          </p>
          <p className="text-xs text-muted-foreground">
            Stock might have been claimed by other buyers. Please select another country.
          </p>
        </div>
      </DoubleBezelShell>
    );
  }

  return (
    <DoubleBezelShell innerClassName="p-0 overflow-hidden">
      {/* Explorer Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{flag}</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                {countryName} Available Accounts
              </h2>
              <span className="font-mono text-xs font-semibold text-muted-foreground bg-foreground/[0.04] px-1.5 py-0.5 rounded border border-foreground/[0.06]">
                {countryCode}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? "session" : "sessions"} available · each verified individually
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterSpamOnly(!filterSpamOnly)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors",
              filterSpamOnly
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                filterSpamOnly ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              )}
            />
            <span>Clean SpamBot Only</span>
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 rounded-lg text-xs"
          >
            Close Explorer
          </Button>
        </div>
      </div>

      {/* Desktop Accounts Table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/60 bg-muted/10">
              <TableHead className="w-36">Telegram User ID</TableHead>
              <TableHead className="w-24 text-center">Account Age</TableHead>
              <TableHead className="w-28 text-center">Spam Health</TableHead>
              <TableHead className="w-24 text-center">Contacts</TableHead>
              <TableHead className="w-24 text-center">2FA Shield</TableHead>
              <TableHead className="w-28 text-center">Recovery Email</TableHead>
              <TableHead className="w-32 text-right">Price</TableHead>
              <TableHead className="w-28 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.map((acc) => {
              const price = acc.buy_price ?? acc.sell_price ?? 7000;
              const canAfford = !user || user.balance >= price;

              return (
                <TableRow
                  key={acc.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="font-mono font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground">{acc.telegram_id || "—"}</span>
                      {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
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
                  <TableCell className="text-center">
                    <Chip tone={acc.twofa_enabled ? "caution" : "neutral"}>
                      <Lock className="mr-1 h-3 w-3 inline" />
                      {acc.twofa_enabled ? "Required" : "None"}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-center">
                    <Chip tone={acc.recovery_email_available ? "accent" : "neutral"}>
                      <Mail className="mr-1 h-3 w-3 inline" />
                      {acc.recovery_email_available ? "Available" : "None"}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceTag value={price} size="md" />
                  </TableCell>
                  <TableCell className="text-right">
                    <ButtonInButton
                      size="sm"
                      onClick={() => onBuyClick(acc)}
                      disabled={!canAfford}
                      className={cn(
                        "h-8 text-xs font-semibold",
                        !canAfford && "opacity-40"
                      )}
                      icon={<ShoppingCart className="h-3 w-3" />}
                    >
                      {canAfford ? "Buy" : "Need Funds"}
                    </ButtonInButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Accounts List */}
      <div className="divide-y divide-border/60 sm:hidden">
        {filteredAccounts.map((acc) => {
          const price = acc.buy_price ?? acc.sell_price ?? 7000;
          const canAfford = !user || user.balance >= price;

          return (
            <div key={acc.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {acc.telegram_id || "Unassigned"}
                    </span>
                    {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Age: {acc.est_reg_date_age || "Unknown"} · Contacts: {acc.contacts_count || 0}
                  </p>
                </div>
                <PriceTag value={price} size="md" />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {acc.spam_status === "normal" ? (
                  <Chip tone="positive" dot>Clean</Chip>
                ) : acc.spam_status === "limited" ? (
                  <Chip tone="negative" dot>Limited</Chip>
                ) : (
                  <Chip tone="neutral">Unchecked</Chip>
                )}
                <Chip tone={acc.twofa_enabled ? "caution" : "neutral"}>
                  2FA: {acc.twofa_enabled ? "Required" : "None"}
                </Chip>
                <Chip tone={acc.recovery_email_available ? "accent" : "neutral"}>
                  Email: {acc.recovery_email_available ? "Yes" : "No"}
                </Chip>
              </div>

              <ButtonInButton
                size="sm"
                onClick={() => onBuyClick(acc)}
                disabled={!canAfford}
                className="w-full justify-center"
                icon={<ShoppingCart className="h-3 w-3" />}
              >
                {canAfford ? "Purchase Account" : "Insufficient Balance"}
              </ButtonInButton>
            </div>
          );
        })}
      </div>
    </DoubleBezelShell>
  );
}