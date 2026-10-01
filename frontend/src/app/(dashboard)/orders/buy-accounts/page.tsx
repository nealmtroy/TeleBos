"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { ShoppingCart, AlertCircle, Sparkles, ChevronDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
import { Eyebrow, Chip, PriceTag } from "@/components/layout/trade-surface";
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

  const [buyConfirmOpen, setBuyConfirmOpen] = useState(false);
  const [pendingBuyAccount, setPendingBuyAccount] = useState<{
    id: string;
    telegram_id: number | null;
    buy_price: number;
    country_code: string;
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

  return (
    <div className="space-y-6">
      {/* Header: title left, balance right. Balance is the number that gates
          every action on this page, so it sits at the same weight as the
          title rather than inside a chip competing with it. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{_("orders.buyAccounts")}</h1>
          <p className="text-sm text-muted-foreground">
            Purchase verified Telegram accounts directly from sellers.
          </p>
        </div>

        {user && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[11px] text-muted-foreground">{_("orders.yourBalance")}</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {balance.toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {stockLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !stock || stock.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <h3 className="mb-1 font-semibold text-foreground">
              {_("orders.noOrders") || "No Ready Stock"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Check back later for newly added stock!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Country picker. Price leads because it is what you are comparing;
              stock count is secondary. Clicking expands the list below. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stock.map((cat) => {
              const isExpanded = selectedCountry === cat.country_code;
              const affordable = balance >= cat.price;
              return (
                <Card
                  key={cat.country_code}
                  size="sm"
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/40",
                    isExpanded && "border-primary"
                  )}
                  onClick={() => setSelectedCountry(isExpanded ? null : cat.country_code)}
                >
                  <CardContent className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {cat.country_name}
                        </p>
                        <span className="font-mono text-xs text-muted-foreground">
                          {cat.country_code}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <PriceTag value={cat.price} />
                        {cat.price > 0 && (
                          <span className="text-xs text-muted-foreground">+</span>
                        )}
                        {!affordable && (
                          <span className="text-xs font-medium text-destructive">
                            above balance
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Chip tone={cat.ready_stock > 0 ? "positive" : "neutral"}>
                        {cat.ready_stock} ready
                      </Chip>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

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

      <ConfirmDialog
        open={buyConfirmOpen}
        onOpenChange={setBuyConfirmOpen}
        onConfirm={handleBuyConfirm}
        title={_("orders.confirmBuyTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-muted-foreground">{_("orders.confirmBuyMsg")}</p>
            {pendingBuyAccount && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User ID:</span>
                  <span className="font-semibold text-foreground">
                    {pendingBuyAccount.telegram_id || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Country Prefix:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {pendingBuyAccount.country_code}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span className="text-foreground">Total Price:</span>
                  <span className="font-bold text-primary">
                    Rp {pendingBuyAccount.buy_price.toLocaleString()}
                  </span>
                </div>
                {user && (
                  <div className="flex justify-between pt-0.5 text-[11px]">
                    <span className="text-muted-foreground">{_("orders.yourBalance")}:</span>
                    <span
                      className={cn(
                        "font-medium",
                        user.balance < pendingBuyAccount.buy_price
                          ? "text-destructive"
                          : "text-emerald-600"
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

      {successOpen && boughtAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md animate-in fade-in zoom-in rounded-2xl border bg-card p-6 duration-200 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <Sparkles className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="mb-1 font-bold text-foreground">{_("orders.buySuccess")}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                The account has been transferred to your custody. Here are the account details:
              </p>

              <div className="mb-6 w-full space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-left text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone Number:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {boughtAccount.phone}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User ID:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {boughtAccount.telegram_id || "—"}
                  </span>
                </div>
                {(boughtAccount.first_name || boughtAccount.last_name) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-semibold text-foreground">
                      {boughtAccount.first_name || ""} {boughtAccount.last_name || ""}
                    </span>
                  </div>
                )}
                {boughtAccount.username && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-mono font-semibold text-foreground">
                      @{boughtAccount.username}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex w-full gap-2">
                <Button
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                    window.location.href = "/accounts";
                  }}
                  className="flex-1"
                >
                  View in My Accounts
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                  }}
                  className="flex-1"
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
  onBuyClick,
}: {
  countryCode: string;
  onBuyClick: (acc: any) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: accounts, isLoading, error } = useMarketplaceStockAccounts(countryCode);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 p-4">
          <Skeleton className="h-5 w-28 animate-pulse" />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
        <AlertCircle className="h-4 w-4" />
        <p>Failed to load accounts for this country.</p>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center text-xs text-muted-foreground">
        No accounts available in this country.
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <Eyebrow>{countryCode}</Eyebrow>
            <span className="text-xs text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"} · each priced
              separately
            </span>
          </div>
        </div>

        {/* Desktop table. Price and action sit together on the right so the
            eye lands on what is actionable, and the reputation columns sit
            between as quieter reference. */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">User ID</TableHead>
                <TableHead className="w-20 text-center">Age</TableHead>
                <TableHead className="w-24 text-center">Spam</TableHead>
                <TableHead className="w-20 text-center">Contacts</TableHead>
                <TableHead className="w-24 text-center">2FA</TableHead>
                <TableHead className="w-28 text-center">Recovery</TableHead>
                <TableHead className="w-28 text-right">Price</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((acc) => {
                const price = acc.buy_price ?? acc.sell_price ?? 7000;
                const canAfford = !user || user.balance >= price;
                return (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span>{acc.telegram_id || "—"}</span>
                        {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {acc.est_reg_date_age || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {acc.spam_status === "normal" ? (
                        <Chip tone="positive">Clean</Chip>
                      ) : acc.spam_status === "limited" ? (
                        <Chip tone="negative">Limited</Chip>
                      ) : (
                        <Chip>Unchecked</Chip>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {acc.contacts_count || 0}
                    </TableCell>
                    <TableCell className="text-center">
                      <Chip tone={acc.twofa_enabled ? "caution" : "neutral"}>
                        {acc.twofa_enabled ? "Required" : "None"}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center">
                      <Chip tone={acc.recovery_email_available ? "accent" : "neutral"}>
                        {acc.recovery_email_available ? "Available" : "None"}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-right">
                      <PriceTag value={price} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => onBuyClick(acc)}
                        disabled={!canAfford}
                        className="h-8 text-xs"
                      >
                        <ShoppingCart className="mr-1 h-3 w-3" />
                        Buy
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile list */}
        <div className="divide-y sm:hidden">
          {accounts.map((acc) => {
            const price = acc.buy_price ?? acc.sell_price ?? 7000;
            const canAfford = !user || user.balance >= price;
            return (
              <div key={acc.id} className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-semibold text-foreground">
                      {acc.telegram_id || "—"}
                    </span>
                    {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                  </div>
                  <PriceTag value={price} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Age: {acc.est_reg_date_age || "—"}</span>
                  <span className="text-right">Contacts: {acc.contacts_count || 0}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {acc.spam_status === "normal" ? (
                    <Chip tone="positive">Clean</Chip>
                  ) : acc.spam_status === "limited" ? (
                    <Chip tone="negative">Limited</Chip>
                  ) : (
                    <Chip>Unchecked</Chip>
                  )}
                  <Chip tone={acc.twofa_enabled ? "caution" : "neutral"}>
                    {acc.twofa_enabled ? "2FA" : "No 2FA"}
                  </Chip>
                  <Chip tone={acc.recovery_email_available ? "accent" : "neutral"}>
                    {acc.recovery_email_available ? "Recovery" : "No recovery"}
                  </Chip>
                </div>

                <Button
                  size="sm"
                  onClick={() => onBuyClick(acc)}
                  disabled={!canAfford}
                  className="w-full text-xs"
                >
                  <ShoppingCart className="mr-1 h-3 w-3" />
                  Buy
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}