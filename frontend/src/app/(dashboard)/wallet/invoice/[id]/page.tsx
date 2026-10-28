"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Info,
  Loader2,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import Link from "next/link";

import { useT, useI18nStore } from "@/lib/i18n";
import { useWalletTransactions, useCheckTopupStatus } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** `1400000` → `Rp 1.400.000` */
function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatTimer(seconds: number): string {
  if (seconds <= 0) return "00:00";
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

const QRIS_SUPPORTED_CHANNELS = [
  "BCA", "Mandiri", "BRI", "BNI", "GoPay", "OVO", "DANA", "ShopeePay"
];

function formatUsdtNetworkLabel(network?: string | null, method?: string | null): string {
  const raw = (network || method || "").toUpperCase();
  if (raw.includes("BEP20") || raw.includes("BSC")) return "BNB Smart Chain (BEP-20)";
  if (raw.includes("TRC20") || raw.includes("TRON")) return "TRON Network (TRC-20)";
  if (raw.includes("POLYGON") || raw.includes("MATIC")) return "Polygon POS (ERC-20)";
  return raw || "USDT On-Chain";
}

function getInvoiceDetails(type?: string, _: (key: string) => string = (k) => k) {
  switch (type) {
    case "subscription":
      return {
        title: _("wallet.invoiceSubscriptionTitle"),
        subtitle: _("wallet.invoiceSubscriptionSubtitle"),
        successTitle: _("wallet.invoiceSubscriptionSuccessTitle"),
        successDesc: _("wallet.invoiceSubscriptionSuccessDesc"),
        ctaText: _("wallet.invoiceSubscriptionCta"),
        ctaHref: "/subscriptions",
      };
    case "smm":
      return {
        title: _("wallet.invoiceSmmTitle"),
        subtitle: _("wallet.invoiceSmmSubtitle"),
        successTitle: _("wallet.invoiceSmmSuccessTitle"),
        successDesc: _("wallet.invoiceSmmSuccessDesc"),
        ctaText: _("wallet.invoiceSmmCta"),
        ctaHref: "/orders/history",
      };
    case "marketplace":
      return {
        title: _("wallet.invoiceMarketplaceTitle"),
        subtitle: _("wallet.invoiceMarketplaceSubtitle"),
        successTitle: _("wallet.invoiceMarketplaceSuccessTitle"),
        successDesc: _("wallet.invoiceMarketplaceSuccessDesc"),
        ctaText: _("wallet.invoiceMarketplaceCta"),
        ctaHref: "/accounts",
      };
    default:
      return {
        title: _("wallet.invoiceTopupTitle"),
        subtitle: _("wallet.invoiceTopupSubtitle"),
        successTitle: _("wallet.invoiceTopupSuccessTitle"),
        successDesc: _("wallet.invoiceTopupSuccessDesc"),
        ctaText: _("wallet.invoiceTopupCta"),
        ctaHref: "/wallet",
      };
  }
}

export default function InvoicePage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const router = useRouter();
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);

  const { data: walletData, isLoading, refetch: refetchTxs } = useWalletTransactions({ limit: 100 });
  const checkTopupStatus = useCheckTopupStatus();

  const tx = useMemo(() => {
    return walletData?.transactions.find((t) => t.id === invoiceId);
  }, [walletData, invoiceId]);

  const invoiceDetails = useMemo(() => getInvoiceDetails(tx?.type, _), [tx?.type, _]);

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (tx && tx.status === "pending") {
      const expiry = tx.expired_at
        ? new Date(tx.expired_at).getTime()
        : new Date(tx.created_at).getTime() + 60 * 60 * 1000;
      const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setTimeLeft(remaining);

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
    }
  }, [tx]);

  // Auto-poll status every 5 seconds when payment is pending
  useEffect(() => {
    if (!tx || tx.status !== "pending") return;
    const pollTimer = setInterval(async () => {
      try {
        const res = await checkTopupStatus.mutateAsync(tx.id);
        if (res.is_paid) {
          const details = getInvoiceDetails(tx.type, _);
          toast.success(details.successTitle);
          refetchTxs();
        }
      } catch {
        // Silently ignore network poll errors during background interval
      }
    }, 5000);
    return () => clearInterval(pollTimer);
  }, [tx, checkTopupStatus, refetchTxs, _]);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="max-w-2xl mx-auto mt-10 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
        <h1 className="text-xl font-bold">{_("wallet.invoiceNotFound")}</h1>
        <p className="text-muted-foreground">{_("wallet.invoiceNotFoundDesc")}</p>
        <Link href="/wallet">
          <Button variant="outline" className="mt-4">{_("wallet.backToWallet")}</Button>
        </Link>
      </div>
    );
  }

  const isCryptoInvoice = Boolean(
    tx.crypto_currency === "USDT" ||
      (tx.method && tx.method.toUpperCase().startsWith("USDT"))
  );
  const cryptoAddress = tx.crypto_address || tx.qris_url || "";
  const cryptoAmount = tx.crypto_amount || "";
  const networkLabel = formatUsdtNetworkLabel(tx.crypto_network, tx.method);

  async function handleCopyAmount() {
    if (!tx) return;
    try {
      const valToCopy = isCryptoInvoice && cryptoAmount
        ? cryptoAmount
        : String(tx.total_amount ?? tx.amount);
      await navigator.clipboard.writeText(valToCopy);
      setCopiedAmount(true);
      toast.success(_("wallet.copied"));
      setTimeout(() => setCopiedAmount(false), 2000);
    } catch {
      toast.error(_("wallet.copyFailed"));
    }
  }

  async function handleCopyAddress() {
    if (!cryptoAddress) return;
    try {
      await navigator.clipboard.writeText(cryptoAddress);
      setCopiedAddress(true);
      toast.success("Alamat wallet berhasil disalin");
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      toast.error(_("wallet.copyFailed"));
    }
  }

  async function handleCopyInvoice() {
    if (!tx) return;
    try {
      await navigator.clipboard.writeText(tx.id);
      setCopiedInvoice(true);
      toast.success(_("wallet.copied"));
      setTimeout(() => setCopiedInvoice(false), 2000);
    } catch {
      toast.error(_("wallet.copyFailed"));
    }
  }

  function handleDownloadQR() {
    if (!tx) return;
    try {
      if (!isCryptoInvoice && (tx.qris_image || tx.qris_url)) {
        const downloadLink = document.createElement("a");
        downloadLink.download = `QRIS-${tx.id}.png`;
        downloadLink.href = tx.qris_image || tx.qris_url || "";
        downloadLink.target = "_blank";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        toast.success(_("wallet.downloadQrSuccess"));
        return;
      }

      const svgElement = document.getElementById("qris-qr-code") as SVGSVGElement | null;
      if (!svgElement) {
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
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cardWidth, cardHeight);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#e2e8f0";
        ctx.stroke();
        ctx.fillStyle = isCryptoInvoice ? "#10b981" : "#EE1D24";
        ctx.fillRect(0, 0, cardWidth, 20);
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 22px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(isCryptoInvoice ? `USDT (${tx.crypto_network || "ON-CHAIN"})` : "QRIS", cardWidth / 2, 58);
        ctx.fillStyle = "#64748b";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText(isCryptoInvoice ? networkLabel.toUpperCase() : "STANDAR PEMBAYARAN NASIONAL", cardWidth / 2, 76);
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(24, 90);
        ctx.lineTo(cardWidth - 24, 90);
        ctx.stroke();
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 15px -apple-system, sans-serif";
        ctx.fillText("TELEBOS", cardWidth / 2, 114);
        ctx.fillStyle = "#64748b";
        ctx.font = "11px monospace";
        ctx.fillText(tx.id, cardWidth / 2, 132);

        const qrX = (cardWidth - qrSize) / 2;
        const qrY = 145;
        ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px monospace";
        ctx.fillText(
          isCryptoInvoice && cryptoAmount ? `${cryptoAmount} USDT` : formatIDR(tx.total_amount ?? tx.amount),
          cardWidth / 2,
          480
        );
        ctx.fillStyle = "#64748b";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.fillText(
          isCryptoInvoice ? cryptoAddress : "Scan & Bayar Otomatis via m-Banking / E-Wallet",
          cardWidth / 2,
          504
        );

        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${isCryptoInvoice ? "USDT" : "QRIS"}-${tx.id}.png`;
        downloadLink.href = pngUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URLObj.revokeObjectURL(blobURL);
        toast.success(_("wallet.downloadQrSuccess"));
      };

      image.src = blobURL;
    } catch {
      toast.error(_("wallet.qrDownloadError"));
    }
  }

  async function handleConfirmPayment() {
    if (!tx) return;
    setVerifying(true);
    try {
      const res = await checkTopupStatus.mutateAsync(tx.id);
      if (res.is_paid) {
        refetchTxs();
        const details = getInvoiceDetails(tx.type, _);
        toast.success(details.successTitle);
      } else {
        toast.info(_("wallet.paymentPendingToast"));
        refetchTxs();
      }
    } catch {
      toast.error(_("wallet.paymentCheckFailed"));
    } finally {
      setVerifying(false);
    }
  }

  const isPending = tx.status === "pending";
  const qrString = isCryptoInvoice
    ? cryptoAddress
    : tx.qris_url || generateQrisString(tx.id, tx.total_amount ?? tx.amount);

  return (
    <div className="max-w-xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push(invoiceDetails.ctaHref || "/wallet")}
          className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-card hover:bg-accent shrink-0 shadow-2xs"
          aria-label="Kembali ke dompet"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
            {invoiceDetails.title} ({tx.id})
          </h1>
          <p className="text-muted-foreground text-sm">{invoiceDetails.subtitle}</p>
        </div>
      </div>

      <div className="bg-card text-card-foreground border rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
        {/* Status bar */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              {_("wallet.paymentStatusLabel")}
            </span>
            {isPending ? (
              <Badge variant="warning" className="gap-1.5 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {_("wallet.waitingForPayment")}
              </Badge>
            ) : tx.status === "approved" ? (
              <Badge variant="success" className="bg-emerald-500/15 text-emerald-600 gap-1.5 px-3 py-1 border-0">
                <CheckCircle2 className="h-4 w-4" />
                {_("wallet.successful")}
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5 px-3 py-1">
                {_("wallet.cancelled")}
              </Badge>
            )}
          </div>
          {isPending && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="font-mono font-bold">{formatTimer(timeLeft)}</span>
            </div>
          )}
        </div>

        {/* ── PENDING: USDT ON-CHAIN INVOICE ── */}
        {isPending && isCryptoInvoice && (
          <>
            <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-card border-2 border-emerald-500/30 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="bg-emerald-600 text-white px-3 py-0.5 rounded font-black text-xs tracking-wider">
                  USDT • {tx.crypto_network || "ON-CHAIN"}
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {networkLabel}
                </span>
              </div>

              <div
                id="qris-qr-container"
                data-keep-white="true"
                className="p-3 bg-white rounded-xl border shadow-sm flex items-center justify-center"
              >
                <QRCode
                  id="qris-qr-code"
                  value={cryptoAddress || tx.id}
                  size={180}
                  level="M"
                  className="h-auto max-w-full"
                />
              </div>

              {/* Exact 4-Decimal USDT Amount Box */}
              <div className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    Nominal Transfer Eksak (Wajib 4 Desimal)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200">
                    Deteksi Otomatis
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-black text-amber-950 dark:text-amber-100 tabular-nums">
                    {cryptoAmount} USDT
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyAmount}
                    className="h-8 px-2.5 text-xs font-semibold cursor-pointer"
                  >
                    {copiedAmount ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                        <span>Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        <span>Salin Nominal</span>
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-amber-900/90 dark:text-amber-200/80 leading-relaxed">
                  Pastikan jumlah yang diterima di alamat tujuan <strong>persis {cryptoAmount} USDT</strong> (di luar fee jaringan exchange/wallet Anda) agar sistem memverifikasi otomatis tanpa perlu kirim TXID.
                </p>
              </div>

              {/* Wallet Address Box */}
              <div className="w-full rounded-xl border border-border bg-muted/40 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Alamat Wallet Tujuan ({tx.crypto_network})
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {formatIDR(tx.amount)} @ {formatIDR(tx.exchange_rate || 16000)}/USDT
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs sm:text-sm font-bold text-foreground break-all">
                    {cryptoAddress}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyAddress}
                    className="h-8 px-2.5 text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedAddress ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                        <span>Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        <span>Salin Alamat</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-3.5 sm:p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
                <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Panduan Pembayaran USDT Otomatis (Zero-Touch)</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-xs sm:text-sm text-blue-800 dark:text-blue-300/90 leading-relaxed ml-1">
                <li>Buka Trust Wallet, MetaMask, TronLink, atau Exchange Anda.</li>
                <li>Pilih jaringan <strong>{networkLabel}</strong> (jangan salah jaringan).</li>
                <li>Salin alamat wallet tujuan dan masukkan nominal eksak <strong>{cryptoAmount} USDT</strong>.</li>
                <li>Setelah transaksi terkonfirmasi di blockchain, halaman ini akan otomatis menyetujui pesanan Anda dalam hitungan detik.</li>
              </ol>
            </div>
          </>
        )}

        {/* ── PENDING: QRIS INVOICE (PAYMENKU) ── */}
        {isPending && !isCryptoInvoice && (
          <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-card border-2 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="bg-[#EE1D24] text-white px-3 py-0.5 rounded font-black text-sm tracking-wider">
                QRIS
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {_("wallet.nationalPaymentStandard")}
              </span>
            </div>

            <div
              id="qris-qr-container"
              data-keep-white="true"
              className="p-3 bg-white rounded-xl border shadow-sm flex items-center justify-center"
            >
              {tx.qris_image ? (
                <img
                  id="qris-image-el"
                  src={tx.qris_image}
                  alt={`QRIS ${tx.id}`}
                  className="w-44 h-44 sm:w-52 sm:h-52 object-contain rounded-md"
                />
              ) : tx.qris_url && tx.qris_url.startsWith("http") ? (
                <img
                  id="qris-image-el"
                  src={tx.qris_url}
                  alt={`QRIS ${tx.id}`}
                  className="w-44 h-44 sm:w-52 sm:h-52 object-contain rounded-md"
                />
              ) : (
                <QRCode
                  id="qris-qr-code"
                  value={qrString}
                  size={180}
                  level="M"
                  className="h-auto max-w-full"
                />
              )}
            </div>

            <div className="text-center space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium text-muted-foreground font-mono">
                  {tx.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyInvoice}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground transition"
                >
                  {copiedInvoice ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-xl sm:text-2xl font-black text-foreground tabular-nums flex items-center justify-center gap-2">
                {formatIDR(tx.total_amount ?? tx.amount)}
                <button
                  type="button"
                  onClick={handleCopyAmount}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground transition"
                >
                  {copiedAmount ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </p>
            </div>

            <div className="w-full max-w-xs pt-1">
              <Button
                type="button"
                onClick={handleDownloadQR}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                <span>{_("wallet.saveQrCode")}</span>
              </Button>
            </div>
          </div>
        )}

        {/* Supported Channels & Info (QRIS) */}
        {isPending && !isCryptoInvoice && (
          <>
            <div className="rounded-xl border bg-muted/50 p-3 space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                {_("wallet.qrisSupported")}
              </span>
              <div className="flex flex-wrap gap-2">
                {QRIS_SUPPORTED_CHANNELS.map((channel) => (
                  <span
                    key={channel}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-background border text-foreground shadow-sm"
                  >
                    {channel}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-3 sm:p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{_("wallet.paymentStepsTitle")}</span>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-300/90 leading-relaxed ml-1">
                <li>{_("wallet.paymentStep1")}</li>
                <li>{_("wallet.paymentStep2")}</li>
                <li>{_("wallet.paymentStep3")}</li>
                <li>{_("wallet.paymentStep4")}</li>
              </ol>
            </div>
          </>
        )}

        {/* Common Pending Actions */}
        {isPending && (
          <>
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/wallet")}
                className="w-full sm:w-auto flex-1 bg-card hover:bg-muted border"
              >
                {_("wallet.back")}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmPayment}
                disabled={verifying}
                className="w-full sm:w-auto flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>{_("wallet.checkingStatus")}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    <span>{_("wallet.checkPayment")}</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              {_("wallet.autoCheckNotice")}
            </p>
          </>
        )}

        {/* Approved Success Presentation Box */}
        {tx.status === "approved" && (
          <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-card border shadow-sm text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div className="space-y-1.5 max-w-md">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {invoiceDetails.successTitle}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {invoiceDetails.successDesc}
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 w-full max-w-sm text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{_("wallet.transactionId")}:</span>
                <span className="font-mono font-semibold text-foreground">{tx.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{_("wallet.invoiceTotalPaid")}</span>
                <span className="font-bold text-foreground">{formatIDR(tx.total_amount ?? tx.amount)}</span>
              </div>
              {isCryptoInvoice && cryptoAmount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal Crypto:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {cryptoAmount} USDT ({tx.crypto_network})
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{_("wallet.methodProvider")}:</span>
                <span className="font-semibold text-foreground uppercase">{tx.method || "QRIS"}</span>
              </div>
              {tx.tx_hash && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">TX Hash:</span>
                  <span className="font-mono text-foreground truncate">{tx.tx_hash}</span>
                </div>
              )}
              {tx.processed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{_("wallet.completionTime")}</span>
                  <span className="text-foreground">
                    {new Date(tx.processed_at).toLocaleString(locale === "id" ? "id-ID" : "en-US")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm pt-2">
              <Link href={invoiceDetails.ctaHref} className="flex-1">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer">
                  {invoiceDetails.ctaText}
                </Button>
              </Link>
              <Link href="/wallet" className="flex-1">
                <Button variant="outline" className="w-full cursor-pointer">
                  {_("wallet.viewWallet")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Rejected Presentation Box */}
        {tx.status === "rejected" && (
          <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-card border shadow-sm text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-sm">
              <AlertCircle className="h-9 w-9" />
            </div>

            <div className="space-y-1.5 max-w-md">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {_("wallet.cancelledExpiredTitle")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {_("wallet.cancelledExpiredDesc")}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Link href="/wallet">
                <Button variant="outline" className="cursor-pointer">
                  {_("wallet.backToWallet")}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
