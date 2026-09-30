"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Wallet,
  AlertCircle,
  Info,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Placeholder data ─────────────────────────────────────────────────────────
// The wallet API does not exist yet. Until it does, these local fixtures stand
// in for the real request/response so the layout, states, and copy are settled.
// Replace each with the matching hook call once the endpoints land.

type RequestStatus = "pending" | "approved" | "rejected";

interface WalletRequest {
  id: string;
  type: "topup" | "withdraw";
  amount: number;
  method: string;
  note: string;
  createdAt: string;
  status: RequestStatus;
}

/** Preset top-up amounts, in IDR. */
const TOPUP_PRESETS = [50_000, 100_000, 250_000, 500_000, 1_000_000];

/** Preset withdraw amounts, in IDR. */
const WITHDRAW_PRESETS = [25_000, 50_000, 100_000, 250_000, 500_000];

const WITHDRAW_METHODS = [
  { id: "bank", labelKey: "wallet.bankTransfer" },
  { id: "ewallet", labelKey: "wallet.ewallet" },
] as const;

/**
 * Owner-side bank details shown as the deposit destination.
 *
 * ⚠️ PLACEHOLDER — DO NOT DEPLOY AS-IS. These are not real account details.
 * Replace them with the owner's live bank details, or wire them to the wallet
 * API, before this page is reachable by real users; otherwise a user could
 * transfer real money to a stranger's account.
 */
const DEPOSIT_ACCOUNT = {
  bank: "BCA",
  accountNumber: "0000 0000 0000",
  accountName: "PLACEHOLDER — replace with your bank details",
} as const;

const STATUS_STYLES: Record<RequestStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

/** `1400000` → `Rp 1.400.000`, matching Indonesian digit grouping. */
function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Requests shown until the wallet API is wired. */
const SEED_REQUESTS: WalletRequest[] = [
  {
    id: "wrn_8fd21a",
    type: "topup",
    amount: 250_000,
    method: "bank",
    note: "TRX 4471 2209",
    createdAt: "2026-09-28T14:22:00Z",
    status: "approved",
  },
  {
    id: "wrn_3c07be",
    type: "withdraw",
    amount: 150_000,
    method: "ewallet",
    note: "0812 3456 7890",
    createdAt: "2026-09-26T09:05:00Z",
    status: "pending",
  },
  {
    id: "wrn_9b41c7",
    type: "withdraw",
    amount: 75_000,
    method: "bank",
    note: "Mandiri 1122 0098 7712",
    createdAt: "2026-09-21T18:40:00Z",
    status: "rejected",
  },
];

export default function WalletPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const balance = user?.balance ?? 0;

  const [tab, setTab] = useState<"topup" | "withdraw">("topup");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("bank");
  const [note, setNote] = useState("");
  const [requests, setRequests] = useState<WalletRequest[]>(SEED_REQUESTS);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const presets = tab === "topup" ? TOPUP_PRESETS : WITHDRAW_PRESETS;

  const parsedAmount = useMemo(() => {
    const digits = amount.replace(/[^0-9]/g, "");
    return digits === "" ? null : parseInt(digits, 10);
  }, [amount]);

  /** Withdrawals cannot exceed the spendable balance. */
  const exceedsBalance = tab === "withdraw" && parsedAmount !== null && parsedAmount > balance;
  const belowMinimum = parsedAmount !== null && parsedAmount < 10_000;
  const canSubmit =
    parsedAmount !== null && !exceedsBalance && !belowMinimum && !submitting;

  function handlePreset(value: number) {
    setAmount(String(value));
    setNotice(null);
  }

  async function handleCopyAccount() {
    const text = `${DEPOSIT_ACCOUNT.bank} ${DEPOSIT_ACCOUNT.accountNumber} a.n. ${DEPOSIT_ACCOUNT.accountName}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ type: "error", text: _("wallet.copyFailed") });
    }
  }

  function handleSubmit() {
    if (!canSubmit || parsedAmount === null) return;
    setSubmitting(true);
    setNotice(null);

    // Stand-in for the create-request call. The optimistic row keeps the table
    // honest about what the API will return once it exists.
    const request: WalletRequest = {
      id: `wrn_${Math.random().toString(16).slice(2, 8)}`,
      type: tab,
      amount: parsedAmount,
      method,
      note: note.trim() || (tab === "topup" ? "—" : method.toUpperCase()),
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    window.setTimeout(() => {
      setRequests((prev) => [request, ...prev]);
      setAmount("");
      setNote("");
      setSubmitting(false);
      setNotice({
        type: "success",
        text:
          tab === "topup"
            ? _("wallet.topupSubmitted")
            : _("wallet.withdrawSubmitted"),
      });
    }, 600);
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-50">
          {_("wallet.title")}
        </h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          {_("wallet.desc")}
        </p>
      </div>

      {/* Blocks accidental release of the placeholder payout details below. */}
      {DEPOSIT_ACCOUNT.accountNumber.startsWith("0000") && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40"
        >
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold">{_("wallet.placeholderWarning")}</p>
            <p className="text-xs mt-0.5 text-amber-800 dark:text-amber-300/90">
              {_("wallet.placeholderWarningDesc")}
            </p>
          </div>
        </div>
      )}

      {/* Balance */}
      <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-900 p-5 sm:p-6 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {_("wallet.currentBalance")}
            </p>
            <p className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mt-1 tabular-nums">
              {formatIDR(balance)}
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              {_("wallet.balanceHint")}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 shrink-0">
            <Wallet className="h-6 w-6 text-blue-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* ── Request form ── */}
        <Card className="lg:col-span-3 border-gray-200 dark:border-slate-800">
          <div className="p-5 pb-0">
            {/* Tabs */}
            <div
              role="tablist"
              aria-label={_("wallet.title")}
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-slate-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "topup"}
                onClick={() => {
                  setTab("topup");
                  setAmount("");
                  setNotice(null);
                }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition",
                  tab === "topup"
                    ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
                )}
              >
                <ArrowDownToLine className="h-4 w-4" />
                {_("wallet.topUp")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "withdraw"}
                onClick={() => {
                  setTab("withdraw");
                  setAmount("");
                  setNotice(null);
                }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition",
                  tab === "withdraw"
                    ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
                )}
              >
                <ArrowUpFromLine className="h-4 w-4" />
                {_("wallet.withdraw")}
              </button>
            </div>
          </div>

          <CardContent className="p-5 space-y-5">
            {notice && (
              <div
                role="status"
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border text-sm",
                  notice.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                )}
              >
                {notice.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
            )}

            {/* Deposit instructions — only meaningful for a top-up. */}
            {tab === "topup" && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900 dark:text-blue-200">
                    {_("wallet.topupInstruction")}
                  </p>
                </div>
                <div className="rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {DEPOSIT_ACCOUNT.bank}
                    </span>
                    <span className="font-mono text-sm font-bold text-gray-900 dark:text-slate-100">
                      {DEPOSIT_ACCOUNT.accountNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {_("wallet.accountName")}
                    </span>
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-200 text-right">
                      {DEPOSIT_ACCOUNT.accountName}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAccount}
                  className="w-full border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900 text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? _("wallet.copied") : _("wallet.copyAccount")}
                </Button>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <label
                htmlFor="wallet-amount"
                className="block text-xs font-semibold text-gray-700 dark:text-slate-300"
              >
                {_("wallet.amount")}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-bold text-gray-400 dark:text-slate-500 font-mono">
                  Rp
                </span>
                <input
                  id="wallet-amount"
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9]/g, ""));
                    setNotice(null);
                  }}
                  placeholder="0"
                  className={cn(
                    "w-full border rounded-xl pl-10 pr-4 py-2.5 font-mono font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20",
                    exceedsBalance || belowMinimum
                      ? "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"
                      : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  )}
                />
              </div>
              {exceedsBalance && (
                <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {_("wallet.insufficient")}
                </p>
              )}
              {!exceedsBalance && belowMinimum && (
                <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {_("wallet.minimum")}
                </p>
              )}
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <p className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                {_("wallet.quickAmount")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePreset(preset)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition",
                      parsedAmount === preset
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300"
                        : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600"
                    )}
                  >
                    {formatIDR(preset)}
                  </button>
                ))}
              </div>
            </div>

            {/* Withdraw destination */}
            {tab === "withdraw" && (
              <div className="space-y-2">
                <label
                  htmlFor="wallet-method"
                  className="block text-xs font-semibold text-gray-700 dark:text-slate-300"
                >
                  {_("wallet.destinationMethod")}
                </label>
                <select
                  id="wallet-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  {WITHDRAW_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {_(m.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Note / reference */}
            <div className="space-y-2">
              <label
                htmlFor="wallet-note"
                className="block text-xs font-semibold text-gray-700 dark:text-slate-300"
              >
                {tab === "topup" ? _("wallet.transferRef") : _("wallet.accountRef")}{" "}
                <span className="font-normal text-gray-400 dark:text-slate-500">
                  ({_("wallet.optional")})
                </span>
              </label>
              <input
                id="wallet-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  tab === "topup" ? "TRX 4471 2209" : "0812 3456 7890"
                }
                className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : tab === "topup" ? (
                <ArrowDownToLine className="h-4 w-4 mr-2" />
              ) : (
                <ArrowUpFromLine className="h-4 w-4 mr-2" />
              )}
              {tab === "topup" ? _("wallet.submitTopup") : _("wallet.submitWithdraw")}
            </Button>

            <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">
              {_("wallet.manualNotice")}
            </p>
          </CardContent>
        </Card>

        {/* ── Request history ── */}
        <Card className="lg:col-span-2 border-gray-200 dark:border-slate-800">
          <div className="p-5 pb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-50">
              {_("wallet.history")}
            </h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Clock className="h-3 w-3" />
                {pendingCount} {_("wallet.pending")}
              </span>
            )}
          </div>
          <CardContent className="p-5 pt-0">
            {requests.length === 0 ? (
              <div className="text-center py-10">
                <Banknote className="h-10 w-10 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {_("wallet.noRequests")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-slate-800 -mx-1">
                {requests.map((request) => (
                  <li key={request.id} className="py-3 px-1 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {request.type === "topup" ? (
                            <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowUpFromLine className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                            {formatIDR(request.amount)}
                          </span>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                              STATUS_STYLES[request.status]
                            )}
                          >
                            {_(`wallet.status.${request.status}`)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">
                          {request.note}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 font-mono">
                          {request.id} · {formatDate(request.createdAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                {_("wallet.needHelp")}
              </p>
              <Link
                href="/help"
                className="inline-flex items-center text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline mt-1"
              >
                {_("wallet.contactSupport")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
