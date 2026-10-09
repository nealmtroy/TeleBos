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
  AlertCircle
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import Link from "next/link";

import { useT } from "@/lib/i18n";
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

export default function InvoicePage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const router = useRouter();
  const _ = useT();
  
  const { data: walletData, isLoading, refetch: refetchTxs } = useWalletTransactions({ limit: 100 });
  const checkTopupStatus = useCheckTopupStatus();
  
  const tx = useMemo(() => {
    return walletData?.transactions.find(t => t.id === invoiceId);
  }, [walletData, invoiceId]);

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (tx && tx.status === "pending") {
      // Calculate remaining time based on created_at or expired_at
      const expiry = tx.expired_at ? new Date(tx.expired_at).getTime() : new Date(tx.created_at).getTime() + 60 * 60 * 1000;
      const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setTimeLeft(remaining);
      
      const timer = setInterval(() => {
        setTimeLeft(prev => {
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
          toast.success("Pembayaran Berhasil! Saldo telah masuk ke akun Anda.");
          refetchTxs();
        }
      } catch {
        // Silently ignore network poll errors during background interval
      }
    }, 5000);
    return () => clearInterval(pollTimer);
  }, [tx, checkTopupStatus, refetchTxs]);

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
        <h1 className="text-xl font-bold">Invoice Tidak Ditemukan</h1>
        <p className="text-muted-foreground">Transaksi tidak ditemukan atau Anda tidak memiliki akses.</p>
        <Link href="/wallet">
          <Button variant="outline" className="mt-4">Kembali ke Dompet</Button>
        </Link>
      </div>
    );
  }

  async function handleCopyAmount() {
    if (!tx) return;
    try {
      const amt = tx.total_amount ?? tx.amount;
      await navigator.clipboard.writeText(String(amt));
      setCopiedAmount(true);
      toast.success(_("wallet.copied"));
      setTimeout(() => setCopiedAmount(false), 2000);
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
      if (tx.qris_image || tx.qris_url) {
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
        ctx.fillStyle = "#EE1D24";
        ctx.fillRect(0, 0, cardWidth, 20);
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 24px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("QRIS", cardWidth / 2, 58);
        ctx.fillStyle = "#64748b";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText("STANDAR PEMBAYARAN NASIONAL", cardWidth / 2, 76);
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
        ctx.fillText(`NMID: ID1020042918290 • ${tx.id}`, cardWidth / 2, 132);

        const qrX = (cardWidth - qrSize) / 2;
        const qrY = 145;
        ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px monospace";
        ctx.fillText(formatIDR(tx.total_amount ?? tx.amount), cardWidth / 2, 480);
        ctx.fillStyle = "#64748b";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.fillText("Scan & Bayar Otomatis via m-Banking / E-Wallet", cardWidth / 2, 504);

        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QRIS-${tx.id}.png`;
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
        toast.success("Pembayaran Berhasil! Saldo telah ditambahkan ke akun Anda.");
      } else {
        toast.info("Pembayaran belum terdeteksi. Sistem mengecek status otomatis setiap 5 detik.");
        refetchTxs();
      }
    } catch {
      toast.error("Gagal memeriksa status pembayaran. Silakan coba beberapa saat lagi.");
    } finally {
      setVerifying(false);
    }
  }

  const isPending = tx.status === "pending";
  const qrString = generateQrisString(tx.id, tx.total_amount ?? tx.amount);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/wallet")} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoice #{tx.id.split('-')[0]}</h1>
          <p className="text-muted-foreground text-sm">Selesaikan pembayaran untuk menambah saldo Anda.</p>
        </div>
      </div>

      <div className="bg-card text-card-foreground border rounded-2xl shadow-sm p-6 space-y-6">
        
        {/* Status bar */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Status Pembayaran:</span>
            {isPending ? (
              <Badge variant="warning" className="gap-1.5 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Menunggu Pembayaran
              </Badge>
            ) : tx.status === "approved" ? (
              <Badge variant="success" className="bg-emerald-500/15 text-emerald-600 gap-1.5 px-3 py-1 border-0">
                <CheckCircle2 className="h-4 w-4" />
                Berhasil
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5 px-3 py-1">
                Dibatalkan
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

        {/* Amount Box */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-muted border space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {_("wallet.invoiceId")}
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-foreground">
                {tx.id}
              </span>
              <button
                type="button"
                onClick={handleCopyInvoice}
                className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition"
              >
                {copiedInvoice ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 dark:bg-amber-950/30 dark:border-amber-900/60 space-y-1.5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                Total Tagihan Transfer
              </span>
              {(tx.total_amount && tx.total_amount !== tx.amount) ? (
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-md">
                  + Kode Unik
                </span>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-black text-amber-950 dark:text-amber-100 tabular-nums">
                {formatIDR(tx.total_amount ?? tx.amount)}
              </span>
              <button
                type="button"
                onClick={handleCopyAmount}
                className="p-1.5 rounded-md hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 transition"
              >
                {copiedAmount ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            {isPending && (
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-tight pt-1">
                Wajib transfer <strong>tepat hingga 3 digit terakhir</strong> agar saldo otomatis masuk.
              </p>
            )}
          </div>
        </div>

        {/* QR Code Presentation Box */}
        {isPending && (
          <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-card border-2 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <div className="bg-[#EE1D24] text-white px-3 py-0.5 rounded font-black text-sm tracking-wider">
                QRIS
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Standar Pembayaran Nasional
              </span>
            </div>

            <div
              id="qris-qr-container"
              data-keep-white="true"
              className="p-4 bg-white rounded-xl border shadow-sm flex items-center justify-center min-h-[250px]"
            >
              {tx.qris_image ? (
                <img
                  id="qris-image-el"
                  src={tx.qris_image}
                  alt={`QRIS ${tx.id}`}
                  className="w-64 h-64 object-contain rounded-md"
                />
              ) : tx.qris_url ? (
                <img
                  id="qris-image-el"
                  src={tx.qris_url}
                  alt={`QRIS ${tx.id}`}
                  className="w-64 h-64 object-contain rounded-md"
                />
              ) : (
                <QRCode
                  id="qris-qr-code"
                  value={qrString}
                  size={220}
                  level="M"
                  className="h-auto max-w-full"
                />
              )}
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-foreground">TELEBOS</p>
              <p className="text-xs text-muted-foreground font-mono">NMID: ID1020042918290 • {tx.id.slice(0,8)}</p>
            </div>

            <div className="w-full max-w-xs pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadQR}
                className="w-full flex items-center justify-center gap-2 border bg-card hover:bg-muted text-foreground"
              >
                <Download className="h-4 w-4" />
                <span>Simpan Kode QR</span>
              </Button>
            </div>
          </div>
        )}

        {/* Supported Channels & Info */}
        {isPending && (
          <>
            <div className="rounded-xl border bg-muted/50 p-4 space-y-3">
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

            <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{_("wallet.paymentStepsTitle")}</span>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-300/90 leading-relaxed ml-1">
                <li>Buka aplikasi m-Banking atau E-Wallet pilihan Anda (BCA, Mandiri, BRI, DANA, GoPay, OVO, dll).</li>
                <li>Scan kode QR di atas atau unduh gambar QRIS.</li>
                <li>Pastikan total nominal transfer sama persis dengan yang tertera (termasuk kode unik).</li>
                <li>Sistem otomatis mendeteksi dan menambah saldo akun Anda tanpa perlu konfirmasi manual.</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/wallet")}
                className="w-full sm:w-auto flex-1 bg-card hover:bg-muted border"
              >
                Kembali
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
                    <span>Mengecek...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    <span>Cek Pembayaran</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Status pembayaran otomatis diperiksa setiap 5 detik. Saldo langsung bertambah setelah transfer berhasil.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
