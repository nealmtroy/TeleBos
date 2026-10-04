"use client";

import { useEffect, useMemo, useState } from "react";
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
  QrCode,
  Download,
  ArrowLeft,
  Check,
  Sparkles,
  Settings,
  CreditCard,
  Building2,
  Search,
  Filter,
  X,
  Eye,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useBankAccountStore,
  type WalletTransaction,
  type TransactionStatus,
} from "@/store/bank-account-store";
import {
  useWalletTransactions,
  useRequestTopup,
  useRequestWithdraw,
} from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ActivePayment {
  id: string;
  amount: number;
  note: string;
  createdAt: string;
  expiresAt: string;
  qrString: string;
}

/** Preset top-up amounts, in IDR. */
const TOPUP_PRESETS = [50_000, 100_000, 250_000, 500_000, 1_000_000];

/** Preset withdraw amounts, in IDR. */
const WITHDRAW_PRESETS = [25_000, 50_000, 100_000, 250_000, 500_000];

const WITHDRAW_METHODS = [
  { id: "bank", labelKey: "wallet.bankTransfer" },
  { id: "ewallet", labelKey: "wallet.ewallet" },
] as const;

const QRIS_SUPPORTED_CHANNELS = [
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "GoPay",
  "OVO",
  "DANA",
  "ShopeePay",
];

const STATUS_STYLES: Record<TransactionStatus, string> = {
  pending:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  rejected:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
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

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Standard EMVCo-compliant QRIS payload generator. */
function generateQrisString(invoiceId: string, amount: number): string {
  const pad = (num: number, size: number) => String(num).padStart(size, "0");
  const amountStr = String(amount);
  return `00020101021226610014ID.LINKAJA.WWW0118936009110022304930020300051440014ID.DANA.WWW01189360091100223049300203000520458125303360540${pad(amountStr.length, 2)}${amountStr}5802ID5911TELEBOS PAY6007JAKARTA61051294062${pad(invoiceId.length + 4, 2)}01${pad(invoiceId.length, 2)}${invoiceId}6304A1B2`;
}

const SEED_REQUESTS: WalletTransaction[] = [];

export default function WalletPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const balance = user?.balance ?? 0;

  // Real backend wallet hooks
  const { data: walletData, isLoading: isTxLoading, refetch: refetchTxs } = useWalletTransactions({ limit: 100 });
  const requestTopup = useRequestTopup();
  const requestWithdraw = useRequestWithdraw();

  // Bank account store integration
  const accounts = useBankAccountStore((s) => s.accounts);
  const defaultAccount = useMemo(() => accounts.find((a) => a.isDefault) ?? accounts[0] ?? null, [accounts]);

  const [tab, setTab] = useState<"topup" | "withdraw">("topup");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("bank");
  const [note, setNote] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("manual");
  const [requests, setRequests] = useState<WalletTransaction[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // History Filter & Search State
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"all" | "topup" | "withdraw">("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | null>(null);

  // Active QRIS Payment State
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(15 * 60);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);

  // Hydrate store on mount & load real backend transactions
  useEffect(() => {
    useBankAccountStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (walletData?.transactions) {
      setRequests(
        walletData.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          method: t.method,
          note: t.note || "",
          createdAt: t.created_at,
          status: t.status,
          adminNote: t.admin_note || undefined,
          userId: t.user_id,
          userEmail: t.user_email || undefined,
          processedAt: t.processed_at || undefined,
        }))
      );
    }
  }, [walletData?.transactions]);

  // Countdown timer when payment is active
  useEffect(() => {
    if (!activePayment) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activePayment]);

  const presets = tab === "topup" ? TOPUP_PRESETS : WITHDRAW_PRESETS;

  const parsedAmount = useMemo(() => {
    const digits = amount.replace(/[^0-9]/g, "");
    return digits === "" ? null : parseInt(digits, 10);
  }, [amount]);

  /** Withdrawals cannot exceed the spendable balance. */
  const exceedsBalance = tab === "withdraw" && parsedAmount !== null && parsedAmount > balance;
  const belowMinimum = parsedAmount !== null && parsedAmount < 10_000;
  const canSubmit = parsedAmount !== null && !exceedsBalance && !belowMinimum && !submitting;

  function handlePreset(value: number) {
    setAmount(String(value));
    setNotice(null);
  }

  function handleAccountSelect(accId: string) {
    setSelectedAccountId(accId);
    if (accId === "manual") {
      setNote("");
    } else {
      const acc = accounts.find((a) => a.id === accId);
      if (acc) {
        setMethod(acc.type);
        setNote(`${acc.provider} • ${acc.accountNumber} (${acc.accountHolder})`);
      }
    }
  }

  async function handleCopyAmount() {
    if (!activePayment) return;
    try {
      await navigator.clipboard.writeText(String(activePayment.amount));
      setCopiedAmount(true);
      toast.success(_("wallet.copied"));
      setTimeout(() => setCopiedAmount(false), 2000);
    } catch {
      toast.error(_("wallet.copyFailed"));
    }
  }

  async function handleCopyInvoice() {
    if (!activePayment) return;
    try {
      await navigator.clipboard.writeText(activePayment.id);
      setCopiedInvoice(true);
      toast.success(_("wallet.copied"));
      setTimeout(() => setCopiedInvoice(false), 2000);
    } catch {
      toast.error(_("wallet.copyFailed"));
    }
  }

  function handleDownloadQR() {
    try {
      const svgElement = document.getElementById("qris-qr-code") as SVGSVGElement | null;
      if (!svgElement || !activePayment) {
        toast.error(_("wallet.copyFailed") || "Gagal mengunduh QR Code");
        return;
      }

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URLObj = window.URL || window.webkitURL || window;
      const blobURL = URLObj.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const qrSize = 300;
        const cardWidth = 400;
        const cardHeight = 540;

        const canvas = document.createElement("canvas");
        canvas.width = cardWidth;
        canvas.height = cardHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          const downloadLink = document.createElement("a");
          downloadLink.download = `QRIS-${activePayment.id}.svg`;
          downloadLink.href = blobURL;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          toast.success(_("wallet.downloadQrSuccess"));
          return;
        }

        // Card background
        ctx.fillStyle = "#ffffff";
        if (typeof (ctx as any).roundRect === "function") {
          (ctx as any).roundRect(0, 0, cardWidth, cardHeight, 16);
          ctx.fill();
        } else {
          ctx.fillRect(0, 0, cardWidth, cardHeight);
        }

        // Outer border
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#e2e8f0";
        ctx.stroke();

        // Top QRIS Red Accent
        ctx.fillStyle = "#EE1D24";
        ctx.fillRect(0, 0, cardWidth, 20);

        // Header Title
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("QRIS", cardWidth / 2, 58);

        ctx.fillStyle = "#64748b";
        ctx.font = "600 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText("STANDAR PEMBAYARAN NASIONAL", cardWidth / 2, 76);

        // Divider
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(24, 90);
        ctx.lineTo(cardWidth - 24, 90);
        ctx.stroke();

        // Merchant Name & ID
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText("TELEBOS", cardWidth / 2, 114);

        ctx.fillStyle = "#64748b";
        ctx.font = "11px monospace";
        ctx.fillText(`NMID: ID1020042918290 • ${activePayment.id}`, cardWidth / 2, 132);

        // QR Code
        const qrX = (cardWidth - qrSize) / 2;
        const qrY = 145;
        ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

        // Amount & instructions at bottom
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px monospace";
        ctx.fillText(formatIDR(activePayment.amount), cardWidth / 2, 480);

        ctx.fillStyle = "#64748b";
        ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText("Scan & Bayar Otomatis via m-Banking / E-Wallet", cardWidth / 2, 504);

        // Trigger download
        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QRIS-${activePayment.id}.png`;
        downloadLink.href = pngUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        URLObj.revokeObjectURL(blobURL);
        toast.success(_("wallet.downloadQrSuccess"));
      };

      image.onerror = () => {
        URLObj.revokeObjectURL(blobURL);
        toast.error("Gagal memproses gambar QR");
      };

      image.src = blobURL;
    } catch {
      toast.error("Gagal mengunduh QR Code");
    }
  }

  function handleConfirmPayment() {
    if (!activePayment) return;
    setVerifying(true);

    window.setTimeout(() => {
      refetchTxs();
      toast.success("Invoice pembayaran telah dicatat. Mohon tunggu verifikasi otomatis/admin.");
      setActivePayment(null);
      setVerifying(false);
    }, 800);
  }

  async function handleSubmit() {
    if (!canSubmit || parsedAmount === null) return;
    setSubmitting(true);
    setNotice(null);

    if (tab === "topup") {
      try {
        const res = await requestTopup.mutateAsync({
          amount: parsedAmount,
          method: "QRIS",
          note: note.trim() || "QRIS TeleBos",
        });

        const newPayment: ActivePayment = {
          id: res.id,
          amount: res.amount,
          note: res.note || "QRIS",
          createdAt: res.created_at || new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          qrString: res.qr_string,
        };

        setActivePayment(newPayment);
        setTimeLeft(15 * 60);
        setAmount("");
        setNote("");
        setSubmitting(false);
        setNotice({
          type: "success",
          text: _("wallet.topupSubmitted"),
        });
        refetchTxs();
      } catch (err: any) {
        setSubmitting(false);
        toast.error(err?.response?.data?.detail || "Gagal membuat invoice top up");
      }
    } else {
      const chosenAcc = selectedAccountId !== "manual" ? accounts.find((a) => a.id === selectedAccountId) : null;
      const finalMethod = chosenAcc ? chosenAcc.provider : method;
      const finalNote = note.trim() || (chosenAcc ? `${chosenAcc.provider} • ${chosenAcc.accountNumber}` : method.toUpperCase());

      try {
        await requestWithdraw.mutateAsync({
          amount: parsedAmount,
          method: finalMethod,
          note: finalNote,
        });

        setAmount("");
        setNote("");
        setSelectedAccountId("manual");
        setSubmitting(false);
        setNotice({
          type: "success",
          text: _("wallet.withdrawSubmitted"),
        });
        refetchTxs();
      } catch (err: any) {
        setSubmitting(false);
        toast.error(err?.response?.data?.detail || "Gagal mengajukan penarikan");
      }
    }
  }

  // Statistics
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const totalApprovedTopup = useMemo(
    () =>
      requests
        .filter((r) => r.type === "topup" && r.status === "approved")
        .reduce((sum, r) => sum + r.amount, 0),
    [requests]
  );
  const totalApprovedWithdraw = useMemo(
    () =>
      requests
        .filter((r) => r.type === "withdraw" && r.status === "approved")
        .reduce((sum, r) => sum + r.amount, 0),
    [requests]
  );

  // Filtered transactions for the history view
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (historyTypeFilter !== "all" && r.type !== historyTypeFilter) return false;
      if (historyStatusFilter !== "all" && r.status !== historyStatusFilter) return false;
      if (historySearch.trim()) {
        const query = historySearch.toLowerCase().trim();
        const matchId = r.id.toLowerCase().includes(query);
        const matchMethod = r.method.toLowerCase().includes(query);
        const matchNote = r.note.toLowerCase().includes(query);
        if (!matchId && !matchMethod && !matchNote) return false;
      }
      return true;
    });
  }, [requests, historyTypeFilter, historyStatusFilter, historySearch]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-50">
            {_("wallet.title")}
          </h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            {_("wallet.desc")}
          </p>
        </div>

        <Link
          href="/settings?tab=bank-accounts"
          className="inline-flex items-center gap-2 self-start sm:self-auto px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-gray-700 dark:text-slate-200 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition shadow-2xs cursor-pointer"
        >
          <CreditCard className="h-4 w-4 text-primary-500" />
          <span>{_("wallet.manageBankAccounts")}</span>
          <ExternalLink className="h-3 w-3 text-gray-400 ml-0.5" />
        </Link>
      </div>

      {/* ── Balance Card ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-900 p-5 sm:p-6 text-white shadow-xs">
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

      {/* ── Main Operations Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* ── Request form / QRIS Payment Card (Col 1-3) ── */}
        <Card className="lg:col-span-3 border-gray-200 dark:border-slate-800 shadow-xs">
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
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer",
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
                  setActivePayment(null);
                  setAmount("");
                  setNotice(null);
                }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer",
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
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                    : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
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

            {/* ── CASE 1: ACTIVE QRIS PAYMENT DISPLAY ── */}
            {tab === "topup" && activePayment ? (
              <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Header with back button & Status */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActivePayment(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>{_("wallet.cancelPayment")}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {_("wallet.status.pending")}
                    </span>
                  </div>
                </div>

                {/* Expiry countdown bar */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span>{_("wallet.expiresIn")}</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatTimer(timeLeft)}
                  </span>
                </div>

                {/* Invoice & Total Amount Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      {_("wallet.invoiceId")}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                        {activePayment.id}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyInvoice}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition cursor-pointer"
                        title="Copy invoice"
                      >
                        {copiedInvoice ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-primary-50/60 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-900/60 space-y-1">
                    <span className="text-[11px] font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wider">
                      Total Pembayaran
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-primary-900 dark:text-primary-100">
                        {formatIDR(activePayment.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyAmount}
                        className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-700 dark:text-primary-300 transition cursor-pointer"
                        title="Copy amount"
                      >
                        {copiedAmount ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* QR Code Presentation Box */}
                <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  {/* QRIS Red Header Badge */}
                  <div className="flex items-center gap-2">
                    <div className="bg-[#EE1D24] text-white px-2.5 py-0.5 rounded font-black text-xs tracking-wider">
                      QRIS
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Standar Pembayaran Nasional
                    </span>
                  </div>

                  {/* The QR Code itself */}
                  <div
                    id="qris-qr-container"
                    data-keep-white="true"
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs"
                  >
                    <QRCode
                      id="qris-qr-code"
                      value={activePayment.qrString}
                      size={200}
                      level="M"
                      className="h-auto max-w-full"
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      TELEBOS
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      NMID: ID1020042918290
                    </p>
                  </div>

                  {/* Download QR Button */}
                  <div className="w-full max-w-xs pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownloadQR}
                      className="w-full flex items-center justify-center gap-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Download className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      <span>{_("wallet.downloadQr")}</span>
                    </Button>
                  </div>
                </div>

                {/* Supported Payment Channels */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3.5 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    {_("wallet.qrisSupported")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QRIS_SUPPORTED_CHANNELS.map((channel) => (
                      <span
                        key={channel}
                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs"
                      >
                        {channel}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Step by step guide */}
                <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 dark:text-blue-200">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{_("wallet.paymentStepsTitle")}</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-blue-800 dark:text-blue-300/90 leading-relaxed">
                    <li>{_("wallet.paymentStep1")}</li>
                    <li>{_("wallet.paymentStep2")}</li>
                    <li>{_("wallet.paymentStep3")}</li>
                  </ol>
                </div>

                {/* Final Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActivePayment(null)}
                    className="w-full sm:w-auto flex-1 order-2 sm:order-1 cursor-pointer"
                  >
                    {_("wallet.changeAmount")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={verifying}
                    className="w-full sm:w-auto flex-1 order-1 sm:order-2 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>{_("wallet.verifyingPayment")}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        <span>{_("wallet.iHavePaid")}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* ── CASE 2: REGULAR FORM (Top Up Nominal Selection OR Withdraw) ── */
              <div className="space-y-5">
                {/* QRIS Announcement Banner (Only on Top Up) */}
                {tab === "topup" && (
                  <div className="rounded-xl border border-primary-200 dark:border-primary-900/60 bg-primary-50/70 dark:bg-primary-950/30 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="bg-[#EE1D24] text-white px-2 py-0.5 rounded font-black text-[11px] tracking-wider">
                          QRIS
                        </div>
                        <span className="font-semibold text-xs text-primary-900 dark:text-primary-100">
                          {_("wallet.qrisNotice")}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 dark:bg-primary-900/60 text-primary-800 dark:text-primary-200">
                        <Sparkles className="h-3 w-3" />
                        {_("wallet.qrisBadge")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-primary-200/60 dark:border-primary-900/40">
                      <span className="text-[11px] text-primary-700 dark:text-primary-300 font-medium">
                        Mendukung:
                      </span>
                      {QRIS_SUPPORTED_CHANNELS.map((ch) => (
                        <span
                          key={ch}
                          className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-primary-200/60 dark:border-primary-900/40"
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Amount input */}
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

                {/* Quick amount presets */}
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
                          "px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer",
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
                  <div className="space-y-4 pt-1 border-t border-gray-100 dark:border-slate-800">
                    {/* Saved Account Selector */}
                    {accounts.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="wallet-saved-account"
                            className="block text-xs font-semibold text-gray-700 dark:text-slate-300"
                          >
                            {_("wallet.selectSavedAccount")}
                          </label>
                          <Link
                            href="/settings?tab=bank-accounts"
                            className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Settings className="h-3 w-3" />
                            <span>{_("wallet.manageBankAccounts")}</span>
                          </Link>
                        </div>
                        <select
                          id="wallet-saved-account"
                          value={selectedAccountId}
                          onChange={(e) => handleAccountSelect(e.target.value)}
                          className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          <option value="manual">{_("wallet.useManualAccount")}</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.provider} - {acc.accountNumber} ({acc.accountHolder}) {acc.isDefault ? "★ Utama" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Method selector (shown when manual) */}
                    {selectedAccountId === "manual" && (
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
                      tab === "topup" ? "Topup Saldo TeleBos" : "0812 3456 7890"
                    }
                    className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>

                {/* Submit button */}
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : tab === "topup" ? (
                    <QrCode className="h-4 w-4 mr-2" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4 mr-2" />
                  )}
                  {tab === "topup" ? _("wallet.submitTopup") : _("wallet.submitWithdraw")}
                </Button>

                <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">
                  {tab === "topup"
                    ? "Setelah menekan Buat Pembayaran, Anda dapat memindai atau mengunduh kode QRIS untuk menyelesaikan transaksi."
                    : _("wallet.manualNotice")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Saved Account Quick View & Info Cards (Col 4-5) ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Card: Rekening Penarikan Tersimpan */}
          <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
            <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary-500" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                  Rekening Penarikan
                </h3>
              </div>
              <Link
                href="/settings?tab=bank-accounts"
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Kelola</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <CardContent className="p-4 sm:p-5 space-y-3">
              {defaultAccount ? (
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary-100 dark:bg-primary-900/60 text-primary-800 dark:text-primary-200">
                      {defaultAccount.provider}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Utama
                    </span>
                  </div>
                  <p className="font-mono text-sm font-bold text-gray-900 dark:text-slate-100">
                    {defaultAccount.accountNumber}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    A.N. {defaultAccount.accountHolder}
                  </p>
                </div>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <CreditCard className="h-8 w-8 mx-auto text-gray-300 dark:text-slate-600" />
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Belum ada rekening penarikan yang disimpan.
                  </p>
                  <Link
                    href="/settings?tab=bank-accounts"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    + Tambah Rekening di Pengaturan
                  </Link>
                </div>
              )}

              <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed pt-1">
                Rekening yang disimpan akan mempermudah Anda melakukan penarikan saldo tanpa harus mengetik ulang nomor rekening.
              </p>
            </CardContent>
          </Card>

          {/* Card: Ketentuan & Bantuan */}
          <Card className="border-gray-200 dark:border-slate-800 shadow-xs bg-slate-50/50 dark:bg-slate-800/30">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-slate-100">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Ketentuan Transaksi</span>
              </div>
              <ul className="text-xs text-gray-500 dark:text-slate-400 space-y-1.5 list-disc list-inside">
                <li>Deposit QRIS otomatis terverifikasi tanpa biaya admin.</li>
                <li>Penarikan diproses manual 1-15 menit pada jam kerja.</li>
                <li>Batas minimum deposit dan penarikan Rp 10.000.</li>
              </ul>
              <div className="pt-2 border-t border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-slate-400">Butuh bantuan?</span>
                <Link
                  href="/help"
                  className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {_("wallet.contactSupport")}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── DEDICATED TRANSACTION HISTORY SECTION (Deposit & Withdrawal History) ── */}
      <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50">
                {_("wallet.history")}
              </h2>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <Clock className="h-3 w-3" />
                  {pendingCount} {_("wallet.pending")}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Catatan lengkap riwayat deposit (isi saldo) dan penarikan dana akun Anda.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-left">
              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 tracking-wider block">
                {_("wallet.totalDeposits")}
              </span>
              <span className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-100">
                + {formatIDR(totalApprovedTopup)}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-left">
              <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300 tracking-wider block">
                {_("wallet.totalWithdrawals")}
              </span>
              <span className="font-mono text-xs font-bold text-blue-900 dark:text-blue-100">
                - {formatIDR(totalApprovedWithdraw)}
              </span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Type Filter Buttons */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-gray-200/70 dark:bg-slate-800 self-start">
            <button
              type="button"
              onClick={() => setHistoryTypeFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer",
                historyTypeFilter === "all"
                  ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 shadow-2xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
              )}
            >
              {_("wallet.allTransactions")}
            </button>
            <button
              type="button"
              onClick={() => setHistoryTypeFilter("topup")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer",
                historyTypeFilter === "topup"
                  ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
              )}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>{_("wallet.deposits")}</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryTypeFilter("withdraw")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer",
                historyTypeFilter === "withdraw"
                  ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
              )}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              <span>{_("wallet.withdrawals")}</span>
            </button>
          </div>

          {/* Right: Status selector and Search input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Status Selector */}
            <select
              value={historyStatusFilter}
              onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="all">{_("wallet.allStatus")}</option>
              <option value="pending">{_("wallet.status.pending")}</option>
              <option value="approved">{_("wallet.status.approved")}</option>
              <option value="rejected">{_("wallet.status.rejected")}</option>
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={_("wallet.searchPlaceholder")}
                className="h-9 pl-8 pr-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 w-full sm:w-56"
              />
              {historySearch && (
                <button
                  type="button"
                  onClick={() => setHistorySearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Transaction Items */}
        <CardContent className="p-0">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Banknote className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-gray-600 dark:text-slate-300">
                {requests.length === 0 ? _("wallet.noRequests") : _("wallet.noMatchingTransactions")}
              </p>
              {requests.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryTypeFilter("all");
                    setHistoryStatusFilter("all");
                    setHistorySearch("");
                  }}
                  className="mt-2 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {filteredRequests.map((request) => (
                <li
                  key={request.id}
                  className="p-4 sm:px-6 hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Direction Icon Circle */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5",
                        request.type === "topup"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/80"
                          : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/80"
                      )}
                    >
                      {request.type === "topup" ? (
                        <ArrowDownToLine className="h-4 w-4" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4" />
                      )}
                    </div>

                    {/* Transaction Details */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                          {request.type === "topup" ? "+" : "-"} {formatIDR(request.amount)}
                        </span>

                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                            STATUS_STYLES[request.status]
                          )}
                        >
                          {_(`wallet.status.${request.status}`)}
                        </span>

                        <span className="text-[11px] font-medium px-2 py-0.2 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200/60 dark:border-slate-700">
                          {request.method}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-md">
                        {request.note}
                      </p>

                      <p className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
                        {request.id} · {formatDate(request.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Right Button: View Detail */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTransaction(request)}
                    className="shrink-0 text-xs h-8 px-3 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1 text-gray-400" />
                    <span>Detail</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <span>
              Menampilkan {filteredRequests.length} dari {requests.length} transaksi
            </span>
            <Link
              href="/help"
              className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              {_("wallet.contactSupport")}
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── TRANSACTION DETAIL RECEIPT MODAL ── */}
      {selectedTransaction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    selectedTransaction.type === "topup"
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                  )}
                >
                  {selectedTransaction.type === "topup" ? (
                    <ArrowDownToLine className="h-4 w-4" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                    {_("wallet.transactionDetails")}
                  </h3>
                  <span className="font-mono text-[11px] text-gray-400 dark:text-slate-500">
                    {selectedTransaction.id}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Amount Highlight Banner */}
              <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider block">
                  {selectedTransaction.type === "topup" ? "Nominal Deposit" : "Nominal Penarikan"}
                </span>
                <p className="font-mono text-2xl font-bold text-gray-900 dark:text-slate-100">
                  {selectedTransaction.type === "topup" ? "+" : "-"} {formatIDR(selectedTransaction.amount)}
                </p>
                <div className="pt-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                      STATUS_STYLES[selectedTransaction.status]
                    )}
                  >
                    {_(`wallet.status.${selectedTransaction.status}`)}
                  </span>
                </div>
              </div>

              {/* Data Table */}
              <div className="space-y-3 text-xs divide-y divide-gray-100 dark:divide-slate-800">
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500 dark:text-slate-400">ID Transaksi</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-gray-900 dark:text-slate-100">
                      {selectedTransaction.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedTransaction.id);
                        toast.success(_("wallet.copied"));
                      }}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3">
                  <span className="text-gray-500 dark:text-slate-400">Jenis Transaksi</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    {selectedTransaction.type === "topup" ? "Deposit Saldo" : "Penarikan Dana"}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3">
                  <span className="text-gray-500 dark:text-slate-400">Metode / Provider</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    {selectedTransaction.method}
                  </span>
                </div>

                <div className="flex items-start justify-between pt-3 gap-2">
                  <span className="text-gray-500 dark:text-slate-400 shrink-0">Catatan / Rekening</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100 text-right truncate max-w-[220px]">
                    {selectedTransaction.note}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3">
                  <span className="text-gray-500 dark:text-slate-400">Biaya Admin</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Rp 0 (Gratis)
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3">
                  <span className="text-gray-500 dark:text-slate-400">Waktu Transaksi</span>
                  <span className="font-mono text-gray-900 dark:text-slate-100">
                    {formatDate(selectedTransaction.createdAt)}
                  </span>
                </div>
              </div>

              {/* Status Explanation Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                {selectedTransaction.status === "pending" && (
                  <p className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      Transaksi ini sedang dalam antrean verifikasi otomatis/manual. Saldo akan otomatis bertambah/berkurang setelah disetujui.
                    </span>
                  </p>
                )}
                {selectedTransaction.status === "approved" && (
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>
                      Transaksi telah berhasil diselesaikan. Saldo akun Anda telah diperbarui sesuai nominal transaksi ini.
                    </span>
                  </p>
                )}
                {selectedTransaction.status === "rejected" && (
                  <p className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>
                      Transaksi ini ditolak oleh sistem atau admin. Silakan periksa kembali detail pembayaran atau hubungi pusat bantuan.
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-slate-800 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedTransaction(null)}
                className="w-full sm:w-auto px-5 cursor-pointer"
              >
                {_("wallet.close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
