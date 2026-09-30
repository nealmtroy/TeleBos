"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  Tag, AlertCircle, Shield, Plus, Trash2, Save, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  usePrefixPrices,
  useCreatePrefixPrice,
  useUpdatePrefixPrice,
  useDeletePrefixPrice,
  type TelegramIdPrefixPrice,
} from "@/hooks/use-admin";

export default function AdminAccountPricesPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can manage account prices.</p>
      </div>
    );
  }

  return <AccountPricesContent />;
}

/** Editable draft of both sides of a rule for one prefix. */
type PriceDraft = { sell: string; buy: string };

const EMPTY_DRAFT: PriceDraft = { sell: "", buy: "" };

function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function parseIDR(raw: string): number | null {
  const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) || num <= 0 ? null : num;
}

function AccountPricesContent() {
  const { data: rules, isLoading, error } = usePrefixPrices();
  const createMutation = useCreatePrefixPrice();
  const updateMutation = useUpdatePrefixPrice();
  const deleteMutation = useDeletePrefixPrice();

  const [newPrefix, setNewPrefix] = useState("");
  const [newSellPrice, setNewSellPrice] = useState("");
  const [newBuyPrice, setNewBuyPrice] = useState("");
  const [newNote, setNewNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg("");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg("");
  };

  const extractError = (err: unknown): string => {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return detail || "Something went wrong. Please try again.";
  };

  const handleAdd = async () => {
    const prefix = newPrefix.trim();
    const sell = parseIDR(newSellPrice);
    if (!prefix || sell === null) return;

    // A blank buy price defers to the global default, so it is sent as null
    // rather than 0, which the schema would reject.
    const buy = newBuyPrice.trim() === "" ? null : parseIDR(newBuyPrice);
    if (newBuyPrice.trim() !== "" && buy === null) return;
    if (buy !== null && buy < sell) {
      showError("Buy price must be greater than or equal to sell price.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        id_prefix: prefix,
        sell_price: sell,
        buy_price: buy,
        note: newNote.trim() || undefined,
      });
      setNewPrefix("");
      setNewSellPrice("");
      setNewBuyPrice("");
      setNewNote("");
      showSuccess(`Price rule for prefix "${prefix}" created!`);
    } catch (err) {
      showError(extractError(err));
    }
  };

  /** Parse a row draft into a valid pair, or return why it is not ready. */
  const readDraft = (
    rule: TelegramIdPrefixPrice
  ): { ready: true; sell: number; buy: number | null } | { ready: false; reason: string } => {
    const draft = drafts[rule.id_prefix];
    if (!draft) return { ready: false, reason: "" };

    const sell = parseIDR(draft.sell);
    if (sell === null) return { ready: false, reason: "Enter a valid sell price." };

    const buy = draft.buy.trim() === "" ? rule.buy_price : parseIDR(draft.buy);
    if (draft.buy.trim() !== "" && buy === null) {
      return { ready: false, reason: "Enter a valid buy price." };
    }
    if (buy !== null && buy < sell) {
      return { ready: false, reason: "Buy price must be ≥ sell price." };
    }
    return { ready: true, sell, buy };
  };

  const handleUpdate = async (rule: TelegramIdPrefixPrice) => {
    const parsed = readDraft(rule);
    if (!parsed.ready) {
      showError(parsed.reason);
      return;
    }

    const unchanged =
      parsed.sell === rule.sell_price &&
      (parsed.buy ?? null) === (rule.buy_price ?? null);
    if (unchanged) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rule.id_prefix];
        return next;
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id_prefix: rule.id_prefix,
        sell_price: parsed.sell,
        buy_price: parsed.buy,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rule.id_prefix];
        return next;
      });
      showSuccess(`Updated prefix "${rule.id_prefix}"`);
    } catch (err) {
      showError(extractError(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm);
      showSuccess(`Deleted price rule for prefix "${deleteConfirm}"`);
      setDeleteConfirm(null);
    } catch (err) {
      showError(extractError(err));
    }
  };

  const setDraftField = (id_prefix: string, field: keyof PriceDraft, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    setDrafts((prev) => ({
      ...prev,
      [id_prefix]: { ...(prev[id_prefix] ?? EMPTY_DRAFT), [field]: cleaned },
    }));
  };

  const isDraftDirty = (rule: TelegramIdPrefixPrice) => {
    const draft = drafts[rule.id_prefix];
    if (!draft) return false;
    return draft.sell !== "" || draft.buy !== "";
  };

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
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load price rules</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Telegram ID Prefix Pricing</h1>
        <p className="text-gray-500 mt-1 text-sm max-w-3xl leading-relaxed">
          Set buy and sell prices based on the first digit(s) of the Telegram user ID.
          The <strong>seller receives</strong> the sell price, the <strong>buyer pays</strong> the
          buy price, and the difference is the TeleBos margin. Example: prefix
          &quot;7&quot; = all IDs starting with 7 (7780645374, 7780645371, etc.). The{" "}
          <strong>longest matching prefix</strong> wins.
        </p>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <Tag className="h-4 w-4" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Add new rule */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary-600" />
          Add Price Rule
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="new-prefix" className="block text-xs font-medium text-gray-500 mb-1">
              ID Prefix
            </label>
            <div className="flex items-center gap-1">
              <Hash className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                id="new-prefix"
                type="text"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 7, 77, 1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-sell-price" className="block text-xs font-medium text-gray-500 mb-1">
              Sell Price (seller receives)
            </label>
            <input
              id="new-sell-price"
              type="text"
              inputMode="numeric"
              value={newSellPrice}
              onChange={(e) => setNewSellPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 5000"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
            />
          </div>
          <div>
            <label htmlFor="new-buy-price" className="block text-xs font-medium text-gray-500 mb-1">
              Buy Price (buyer pays) <span className="text-gray-300">(optional)</span>
            </label>
            <input
              id="new-buy-price"
              type="text"
              inputMode="numeric"
              value={newBuyPrice}
              onChange={(e) => setNewBuyPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Uses global default"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
            />
          </div>
          <div>
            <label htmlFor="new-note" className="block text-xs font-medium text-gray-500 mb-1">
              Note <span className="text-gray-300">(optional)</span>
            </label>
            <input
              id="new-note"
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. Premium accounts, old accounts"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!newPrefix.trim() || !newSellPrice || createMutation.isPending}
          size="sm"
          className="mt-1"
        >
          <Plus className="h-4 w-4 mr-1" />
          {createMutation.isPending ? "Adding..." : "Add Rule"}
        </Button>
      </div>

      {/* Rules table */}
      {rules && rules.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-900">Configured Rules ({rules.length})</h2>
          </div>
          {/* On mobile each rule renders as a stacked card rather than a table row. */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50/50 hover:bg-gray-50/50 text-gray-500 font-medium">
                  <TableHead className="py-3 px-4 text-left">ID Prefix</TableHead>
                  <TableHead className="py-3 px-4 text-left">Note</TableHead>
                  <TableHead className="py-3 px-4 text-center">Sell Price</TableHead>
                  <TableHead className="py-3 px-4 text-center">Buy Price</TableHead>
                  <TableHead className="py-3 px-4 text-center">Margin</TableHead>
                  <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rules]
                  .sort((a, b) => b.id_prefix.length - a.id_prefix.length)
                  .map((rule) => {
                    const dirty = isDraftDirty(rule);
                    const draft = drafts[rule.id_prefix] ?? EMPTY_DRAFT;
                    return (
                      <TableRow
                        key={rule.id}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-b-0"
                      >
                        <TableCell className="py-3 px-4 whitespace-normal">
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-primary-500" />
                            <span className="font-bold text-lg text-gray-900 font-mono">
                              {rule.id_prefix}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs text-gray-500 whitespace-normal">{rule.note || "—"}</TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-1 rounded-lg">
                            {formatIDR(rule.sell_price)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <span className="font-mono font-semibold text-primary-700 bg-primary-50 px-2 py-1 rounded-lg">
                            {rule.buy_price !== null ? formatIDR(rule.buy_price) : "Global"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <span
                            className={cn(
                              "font-mono text-xs font-semibold px-2 py-1 rounded-lg",
                              rule.margin > 0
                                ? "text-emerald-700 bg-emerald-50"
                                : "text-gray-400 bg-gray-50"
                            )}
                          >
                            {formatIDR(rule.margin)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 whitespace-normal">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`New sell price for prefix ${rule.id_prefix}`}
                              value={draft.sell}
                              onChange={(e) => setDraftField(rule.id_prefix, "sell", e.target.value)}
                              placeholder={String(rule.sell_price)}
                              className={cn(
                                "w-20 border rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                                draft.sell
                                  ? "border-amber-300 bg-amber-50 text-amber-900"
                                  : "border-gray-200 bg-gray-50 text-gray-400"
                              )}
                            />
                            <span className="text-gray-300 text-xs">/</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`New buy price for prefix ${rule.id_prefix}`}
                              value={draft.buy}
                              onChange={(e) => setDraftField(rule.id_prefix, "buy", e.target.value)}
                              placeholder={rule.buy_price !== null ? String(rule.buy_price) : "Global"}
                              className={cn(
                                "w-20 border rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                                draft.buy
                                  ? "border-amber-300 bg-amber-50 text-amber-900"
                                  : "border-gray-200 bg-gray-50 text-gray-400"
                              )}
                            />
                            {dirty && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdate(rule)}
                                disabled={updateMutation.isPending}
                                className="h-8 px-2"
                                title="Save price changes"
                              >
                                <Save className="h-3.5 w-3.5 text-primary-600" />
                              </Button>
                            )}
                            <button
                              onClick={() => setDeleteConfirm(rule.id_prefix)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete rule"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden divide-y divide-gray-100">
            {[...rules]
              .sort((a, b) => b.id_prefix.length - a.id_prefix.length)
              .map((rule) => {
                const dirty = isDraftDirty(rule);
                const draft = drafts[rule.id_prefix] ?? EMPTY_DRAFT;
                return (
                  <div key={rule.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className="h-4 w-4 text-primary-500 shrink-0" />
                        <span className="font-bold text-lg text-gray-900 font-mono">
                          {rule.id_prefix}
                        </span>
                      </div>
                      <button
                        onClick={() => setDeleteConfirm(rule.id_prefix)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        title="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {rule.note && (
                      <p className="text-xs text-gray-500">{rule.note}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Sell (seller gets)
                        </p>
                        <p className="font-mono text-sm font-bold text-gray-900">
                          {formatIDR(rule.sell_price)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-primary-50 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-600/70">
                          Buy (buyer pays)
                        </p>
                        <p className="font-mono text-sm font-bold text-primary-800">
                          {rule.buy_price !== null ? formatIDR(rule.buy_price) : "Global"}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs font-semibold font-mono inline-block",
                        rule.margin > 0
                          ? "text-emerald-700 bg-emerald-50"
                          : "text-gray-400 bg-gray-50"
                      )}
                    >
                      Margin: {formatIDR(rule.margin)}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex-1 min-w-0">
                        <span className="sr-only">New sell price for prefix {rule.id_prefix}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft.sell}
                          onChange={(e) => setDraftField(rule.id_prefix, "sell", e.target.value)}
                          placeholder={`Sell: ${rule.sell_price}`}
                          className={cn(
                            "w-full border rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                            draft.sell
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : "border-gray-200 bg-gray-50 text-gray-600 placeholder:text-gray-400"
                          )}
                        />
                      </label>
                      <label className="flex-1 min-w-0">
                        <span className="sr-only">New buy price for prefix {rule.id_prefix}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft.buy}
                          onChange={(e) => setDraftField(rule.id_prefix, "buy", e.target.value)}
                          placeholder={
                            rule.buy_price !== null ? `Buy: ${rule.buy_price}` : "Buy: Global"
                          }
                          className={cn(
                            "w-full border rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                            draft.buy
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : "border-gray-200 bg-gray-50 text-gray-600 placeholder:text-gray-400"
                          )}
                        />
                      </label>
                      {dirty && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdate(rule)}
                          disabled={updateMutation.isPending}
                          className="h-9 w-9 shrink-0 px-0"
                          title="Save price changes"
                        >
                          <Save className="h-3.5 w-3.5 text-primary-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-xl">
          <Tag className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500 mb-1">No price rules configured yet</p>
          <p className="text-sm text-gray-400">Add a prefix rule above to get started.</p>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete price rule"
        message={`Delete the pricing rule for prefix "${deleteConfirm}"? Accounts matching it will fall back to the global prices.`}
        onConfirm={handleDelete}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
