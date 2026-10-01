"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { DollarSign, AlertCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  const allSelected = !!eligible && selectedIds.length === eligible.length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        <p>Failed to load eligible accounts.</p>
      </div>
    );
  }

  if (!eligible || eligible.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <DollarSign className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h3 className="mb-1 font-semibold text-foreground">
            {_("orders.noEligibleAccounts")}
          </h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            All your connected accounts are already sold or in custody, or you don't have any
            verified accounts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{_("orders.sellAccounts")}</h1>
          <p className="text-sm text-muted-foreground">
            Sell your connected Telegram accounts for platform credit.
          </p>
        </div>

        {user && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[11px] text-muted-foreground">{_("orders.yourBalance")}</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {user.balance?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Deferred payment sits directly above the list it qualifies — this
          changes how every price below should be read. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-800">
          <strong className="font-semibold">Auto-Pricing by Telegram ID Prefix.</strong> Your
          balance will <strong>not</strong> be credited immediately — you only get paid when a
          buyer purchases your account.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <Eyebrow>Eligible</Eyebrow>
              <span className="text-xs text-muted-foreground">
                {eligible.length} {eligible.length === 1 ? "account" : "accounts"}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-7 text-xs">
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      aria-label="Select all accounts"
                      className="h-4 w-4 cursor-pointer rounded border-muted-foreground/40 text-primary"
                    />
                  </TableHead>
                  <TableHead>Telegram Account</TableHead>
                  <TableHead className="w-24 text-center">Age</TableHead>
                  <TableHead className="w-24 text-center">Spam</TableHead>
                  <TableHead className="w-20 text-center">Contacts</TableHead>
                  <TableHead className="w-32">Username</TableHead>
                  <TableHead className="w-28 text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((acc) => {
                  const isSelected = selectedIds.includes(acc.id);
                  const price = acc.sell_price || 0;
                  return (
                    <TableRow
                      key={acc.id}
                      className={cn("cursor-pointer", isSelected && "bg-primary/5")}
                      onClick={() => handleToggleSelect(acc.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(acc.id)}
                          aria-label={`Select account ${acc.phone}`}
                          className="h-4 w-4 cursor-pointer rounded border-muted-foreground/40 text-primary"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {acc.first_name ? acc.first_name[0].toUpperCase() : "U"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {acc.first_name || "Unnamed"} {acc.last_name || ""}
                              </p>
                              {acc.is_resale && <Chip tone="accent">Resale</Chip>}
                            </div>
                            <p className="font-mono text-xs text-muted-foreground">
                              {acc.phone}
                            </p>
                          </div>
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
                      <TableCell className="truncate font-mono text-xs text-muted-foreground">
                        {acc.username ? `@${acc.username}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <PriceTag value={price} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile list */}
          <div className="divide-y sm:hidden">
            {eligible.map((acc) => {
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
                    "flex cursor-pointer items-center gap-3 p-3",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelect(acc.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select account ${acc.phone}`}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-muted-foreground/40 text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {acc.first_name || "Unnamed"} {acc.last_name || ""}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{acc.phone}</p>
                  </div>
                  <PriceTag value={price} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selection bar — appears only once something is picked */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:left-auto sm:right-6 sm:w-96 sm:px-0 sm:pb-0">
          <Card className="border shadow-lg">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {selectedIds.length} selected
                </p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">
                  Rp {totalReceive.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                {selectedIds.slice(0, 3).map((id) => {
                  const acc = eligible.find((a) => a.id === id);
                  return (
                    <div key={id} className="flex justify-between">
                      <span className="truncate">{acc?.phone || id.slice(0, 8)}</span>
                      <span className="font-medium text-foreground">
                        Rp {getPriceForAccount(id).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                {selectedIds.length > 3 && (
                  <p className="text-muted-foreground/70">
                    +{selectedIds.length - 3} more
                  </p>
                )}
              </div>
              <Button
                onClick={() => setSellConfirmOpen(true)}
                className="w-full bg-amber-600 font-semibold text-white hover:bg-amber-700"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Sell {selectedIds.length} Account(s)
              </Button>
              <p className="text-center text-[11px] italic text-muted-foreground">
                You&apos;ll only be paid when a buyer purchases your account(s).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={sellConfirmOpen}
        onOpenChange={setSellConfirmOpen}
        onConfirm={handleSellConfirm}
        title={_("orders.confirmSellTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to sell these {selectedIds.length} Telegram account(s)? This
              will stop all active broadcasting and auto-replies immediately.
            </p>
            <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                Price Breakdown
              </p>
              {selectedIds.map((id) => {
                const acc = eligible.find((a) => a.id === id);
                return (
                  <div key={id} className="flex justify-between">
                    <span className="mr-2 truncate text-muted-foreground">
                      {acc?.phone || id.slice(0, 8)}
                    </span>
                    <span className="font-semibold text-foreground">
                      Rp {getPriceForAccount(id).toLocaleString()}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t pt-1.5 font-medium">
                <span className="text-foreground">Total:</span>
                <span className="font-bold text-emerald-600">
                  Rp {totalReceive.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <p className="font-semibold">⏳ Deferred Payment</p>
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