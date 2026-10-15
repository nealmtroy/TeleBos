"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Crown,
  Star,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Ticket,
  Check,
  Shield,
  Radio,
  Users,
  ChevronDown,
  Table as TableIcon,
  Wallet,
  QrCode,
  Loader2,
  AlertTriangle,
  ExternalLink,
  History,
  X,
} from "lucide-react";

import { useMySubscription, useRedeemCode, useCheckoutSubscription } from "@/hooks/use-subscriptions";
import { useWalletTransactions } from "@/hooks/use-wallet";
import { useAccountsSummary } from "@/hooks/use-accounts";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PricingCard, PricingFrequencyToggle } from "@/components/ui/pricing";
import { PLANS, type PlanId } from "@/data/plans";

const PLAN_KEYS = ["freetrial", "basic", "pro", "premium"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];
type CurrentPlanKey = PlanKey | "owner";

const PLAN_DISPLAY_NAMES: Record<CurrentPlanKey, string> = {
  freetrial: "Free Trial",
  basic: "Starter",
  pro: "Pro",
  premium: "Business",
  owner: "Owner Access",
};

const ROLE_LIMITS: Record<CurrentPlanKey, number> = {
  freetrial: 1,
  basic: 1,
  pro: 3,
  premium: 5,
  owner: 999999,
};

const PLAN_META: Record<
  CurrentPlanKey,
  {
    icon: typeof Zap;
    statusBg: string;
    statusText: string;
    cardRing: string;
    iconColor: string;
    iconBg: string;
    badgeBg: string;
  }
> = {
  freetrial: {
    icon: Clock,
    statusBg: "bg-sky-50 dark:bg-sky-950/40",
    statusText: "text-sky-700 dark:text-sky-300",
    cardRing: "ring-sky-200 dark:ring-sky-800",
    iconColor: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-100 dark:bg-sky-900/40",
    badgeBg: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
  },
  basic: {
    icon: Zap,
    statusBg: "bg-slate-50 dark:bg-slate-800",
    statusText: "text-slate-700 dark:text-slate-300",
    cardRing: "ring-slate-200 dark:ring-slate-700",
    iconColor: "text-slate-600 dark:text-slate-300",
    iconBg: "bg-slate-100 dark:bg-slate-700",
    badgeBg: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
  pro: {
    icon: Star,
    statusBg: "bg-primary-50/60 dark:bg-primary-950/40",
    statusText: "text-primary-700 dark:text-primary-300",
    cardRing: "ring-primary-200 dark:ring-primary-800",
    iconColor: "text-primary-600 dark:text-primary-400",
    iconBg: "bg-primary-50 dark:bg-primary-900/40",
    badgeBg: "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-950/50 dark:text-primary-300 dark:border-primary-800",
  },
  premium: {
    icon: Crown,
    statusBg: "bg-amber-50/60 dark:bg-amber-950/40",
    statusText: "text-amber-700 dark:text-amber-300",
    cardRing: "ring-amber-200 dark:ring-amber-800",
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-900/40",
    badgeBg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  },
  owner: {
    icon: Shield,
    statusBg: "bg-slate-100 dark:bg-slate-800",
    statusText: "text-slate-800 dark:text-slate-200",
    cardRing: "ring-slate-300 dark:ring-slate-700",
    iconColor: "text-slate-700 dark:text-slate-300",
    iconBg: "bg-slate-200 dark:bg-slate-800",
    badgeBg: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  },
};

const FEATURE_MATRIX: { name: string; freetrial: string; basic: string; pro: string; premium: string }[] = [
  { name: "Kapasitas Akun Telegram", freetrial: "1 Akun", basic: "1 Akun", pro: "Hingga 3 Akun", premium: "Hingga 5 Akun" },
  { name: "Obrolan Teks Langsung", freetrial: "Ya", basic: "Ya", pro: "Ya", premium: "Ya" },
  { name: "Sistem Auto-Reply Otomatis", freetrial: "Ya", basic: "Ya", pro: "Ya", premium: "Ya" },
  { name: "Bebas Watermark Pesan", freetrial: "Tidak (Watermark)", basic: "Tidak (Watermark)", pro: "Ya (Bebas)", premium: "Ya (Bebas)" },
  { name: "Siaran Broadcast Massal", freetrial: "Batas 5 Jam/Hari", basic: "Batas 5 Jam/Hari", pro: "Tanpa Batas", premium: "Tanpa Batas" },
  { name: "Jadwal Kirim Terjadwal", freetrial: "Tidak", basic: "Tidak", pro: "Ya", premium: "Ya" },
  { name: "Auto-Join Grup & Channel", freetrial: "Tidak", basic: "Ya", pro: "Ya", premium: "Ya" },
  { name: "Age Checker Akun Telegram", freetrial: "Tidak", basic: "Tidak", pro: "Ya", premium: "Ya" },
  { name: "Member Inviter & Auto-invite", freetrial: "Tidak", basic: "Tidak", pro: "Ya", premium: "Ya" },
  { name: "Scrape Target Member Komunitas", freetrial: "Tidak", basic: "Tidak", pro: "Tidak", premium: "Ya" },
  { name: "Banding Otomatis SpamBot", freetrial: "Tidak", basic: "Tidak", pro: "Tidak", premium: "Ya" },
  { name: "Rotasi Proxy & Proteksi Multi-Sesi", freetrial: "Standar", basic: "Standar", pro: "Standar", premium: "Terbaik" },
  { name: "Prioritas Antrean Server", freetrial: "Normal", basic: "Normal", pro: "Tinggi", premium: "Tertinggi (#1)" },
  { name: "Dukungan Teknis", freetrial: "Komunitas", basic: "Standar", pro: "Prioritas", premium: "24/7 Dedicated" },
];

export default function SubscriptionPage() {
  const _ = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const { data: subscription, isLoading: subLoading, error: subError } = useMySubscription();
  const { data: accountsSummary, isLoading: accLoading } = useAccountsSummary();
  const { data: txHistoryData, isLoading: txLoading } = useWalletTransactions({
    type: "subscription",
    limit: 20,
  });

  const redeemMutation = useRedeemCode();
  const checkoutMutation = useCheckoutSubscription();

  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [showMatrix, setShowMatrix] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const [paymentModalPlan, setPaymentModalPlan] = useState<{
    id: PlanId;
    title: string;
    price: number;
  } | null>(null);

  const currentPlan = (subscription?.plan || user?.role || "freetrial") as CurrentPlanKey;
  const isActive = subscription?.is_active ?? false;
  const expiresAt = subscription?.expires_at ?? null;
  const daysRemaining = subscription?.days_remaining ?? null;
  const secondsRemaining = subscription?.seconds_remaining ?? null;

  const meta = PLAN_META[currentPlan] || PLAN_META.basic;
  const StatusIcon = meta.icon;

  const currentLimit = ROLE_LIMITS[currentPlan] || 1;
  const accountsConnected = accountsSummary?.total ?? 0;
  const accountUsagePercent =
    currentLimit >= 999999
      ? 0
      : Math.min(100, Math.round((accountsConnected / currentLimit) * 100));

  // Find any pending subscription invoice
  const pendingSubscriptionTx = txHistoryData?.transactions?.find(
    (tx) => tx.type === "subscription" && tx.status === "pending"
  );

  async function handleRedeemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!voucherCode.trim()) return;

    setRedeemError(null);
    try {
      await redeemMutation.mutateAsync(voucherCode.trim().toUpperCase());
      toast.success(_("redeem.success") || "Voucher berhasil diaktifkan!");
      setVoucherCode("");
      setRedeemOpen(false);
      await fetchMe();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        _("redeem.error") ||
        "Gagal menukarkan voucher";
      setRedeemError(msg);
      toast.error(msg);
    }
  }

  async function handleCheckoutWithBalance(planId: PlanId) {
    try {
      const response = await checkoutMutation.mutateAsync({
        plan_id: planId,
        billing_cycle: billingCycle,
        payment_method: "balance",
      });
      toast.success(
        response.message || "Langganan berhasil diaktifkan menggunakan saldo dompet Anda!"
      );
      setPaymentModalPlan(null);
      await fetchMe();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Gagal mengaktifkan langganan dengan saldo";
      toast.error(msg);
    }
  }

  async function handleCheckoutQRIS(planId: PlanId) {
    try {
      const response = await checkoutMutation.mutateAsync({
        plan_id: planId,
        billing_cycle: billingCycle,
        payment_method: "qris",
      });
      if (response.invoice_id) {
        toast.success("Tagihan QRIS berhasil dibuat! Mengalihkan ke halaman pembayaran...");
        setPaymentModalPlan(null);
        router.push(`/wallet/invoice/${response.invoice_id}`);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Gagal membuat tagihan pembayaran QRIS";
      toast.error(msg);
    }
  }

  function handleSelectPlan(planId: PlanId, title: string) {
    const planObj = PLANS.find((p) => p.id === planId);
    if (!planObj) return;

    const price = billingCycle === "yearly" ? planObj.yearlyAmount : planObj.amount;
    const userBalance = user?.balance ?? 0;

    if (userBalance >= price) {
      setPaymentModalPlan({ id: planId, title, price });
    } else {
      toast.info("Saldo dompet tidak mencukupi, membuat tagihan pembayaran QRIS otomatis...");
      handleCheckoutQRIS(planId);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-4 sm:py-8 px-2 sm:px-4">
      {/* ── HEADER TITLE SECTION ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
            <Crown className="h-7 w-7 text-primary" />
            <span>Manajemen Langganan</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Kelola paket langganan aktif, kuota akun, dan perpanjangan otomatis Anda.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRedeemOpen(true)}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer shadow-xs border-border-strong hover:bg-muted"
          >
            <Ticket className="h-4 w-4 text-amber-500" />
            <span>Tukar Voucher</span>
          </Button>
        </div>
      </div>

      {/* ── PENDING TRANSACTION NOTICE (If Any) ───────────────────────────── */}
      {pendingSubscriptionTx && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-900 dark:text-amber-200">
                Tagihan QRIS Menunggu Pembayaran
              </p>
              <p className="text-amber-700 dark:text-amber-300/90 mt-0.5 leading-relaxed">
                Anda memiliki invoice aktif #{pendingSubscriptionTx.id} sebesar{" "}
                <strong>Rp {pendingSubscriptionTx.amount.toLocaleString("id-ID")}</strong>. Selesaikan
                pembayaran agar paket langsung diaktifkan oleh sistem.
              </p>
            </div>
          </div>
          <Link
            href={`/wallet/invoice/${pendingSubscriptionTx.id}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shrink-0 shadow-xs cursor-pointer"
          >
            <span>Bayar QRIS Sekarang</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* ── CURRENT PLAN STATUS & TELEMETRY BENTO ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Active Subscription Overview */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Paket Aktif Saat Ini
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border",
                  currentPlan === "owner"
                    ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    : currentPlan === "freetrial"
                    ? isActive
                      ? "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                      : "bg-muted text-muted-foreground border-border"
                    : isActive
                    ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                )}
              >
                {currentPlan === "owner" ? (
                  <Crown className="h-3.5 w-3.5" />
                ) : currentPlan === "freetrial" ? (
                  isActive ? <Clock className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />
                ) : isActive ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {currentPlan === "owner"
                  ? "Owner Lifetime"
                  : currentPlan === "freetrial"
                  ? isActive
                    ? "Trial Aktif (5 Jam)"
                    : "Trial Kedaluwarsa"
                  : isActive
                  ? "Langganan Aktif"
                  : "Kedaluwarsa"}
              </span>
            </div>

            <div className="flex items-center gap-3.5 mt-4">
              <div className={cn("p-3 rounded-xl border shrink-0", meta.iconBg, meta.badgeBg)}>
                <StatusIcon className={cn("h-6 w-6", meta.iconColor)} />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">
                  {PLAN_DISPLAY_NAMES[currentPlan] || currentPlan}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentPlan === "owner"
                    ? "Akses penuh tak terbatas ke semua fitur platform TeleBos."
                    : currentPlan === "premium"
                    ? "Kapasitas armada akun tinggi & antrean server prioritas #1."
                    : currentPlan === "pro"
                    ? "Kirim siaran pesan massal tanpa watermark dan kelola hingga 3 akun."
                    : currentPlan === "basic"
                    ? "Paket esensial 1 akun dengan auto-reply dan auto-join."
                    : "Masa percobaan 5 jam untuk mencoba sistem sebelum berlangganan."}
                </p>
              </div>
            </div>
          </div>

          {/* Expiry Details */}
          <div className="mt-6 pt-4 border-t border-border/60">
            {currentPlan === "freetrial" ? (
              isActive && secondsRemaining !== null && secondsRemaining > 0 ? (
                <div className="flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300 font-medium">
                  <Clock className="h-4 w-4 shrink-0 text-sky-600" />
                  <span>
                    Sisa Waktu Trial:{" "}
                    <strong>
                      {Math.floor(secondsRemaining / 3600)} jam{" "}
                      {Math.floor((secondsRemaining % 3600) / 60)} menit tersisa
                    </strong>
                  </span>
                  {expiresAt && (
                    <span className="text-muted-foreground font-normal">
                      (hingga {new Date(expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })})
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Masa coba gratis 5 jam telah habis. Pilih paket di bawah untuk mengaktifkan kembali.</span>
                </div>
              )
            ) : currentPlan === "owner" ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                <span>Akun Anda memiliki izin khusus Administrator / Owner permanen.</span>
              </div>
            ) : expiresAt ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    Berlaku hingga:{" "}
                    <strong className="text-foreground font-semibold">
                      {new Date(expiresAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </strong>
                  </span>
                </div>
                {daysRemaining !== null && isActive && (
                  <span className="font-bold text-primary">
                    {daysRemaining} hari tersisa
                  </span>
                )}
                {!isActive && (
                  <span className="font-bold text-rose-500">
                    Kedaluwarsa — Perpanjang Sekarang
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Informasi masa aktif tidak tersedia.
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Account Limit & Usage Quota */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Batas Penggunaan Akun
              </span>
              <Users className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-foreground tabular-nums">
                  {accLoading ? "..." : accountsConnected}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  dari {currentLimit >= 999999 ? "Tanpa Batas" : `${currentLimit} akun`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-2 w-full bg-muted rounded-full overflow-hidden border border-border/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    accountUsagePercent > 90
                      ? "bg-rose-500"
                      : accountUsagePercent > 70
                      ? "bg-amber-500"
                      : "bg-primary"
                  )}
                  style={{ width: `${currentLimit >= 999999 ? 10 : accountUsagePercent}%` }}
                />
              </div>

              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                {currentLimit >= 999999
                  ? "Kapasitas tanpa batas akun untuk akun Owner."
                  : accountUsagePercent >= 100
                  ? "Batas akun tercapai. Upgrade paket untuk menambah kapasitas akun terhubung."
                  : `Tersisa ${Math.max(0, currentLimit - accountsConnected)} slot akun untuk paket ${PLAN_DISPLAY_NAMES[currentPlan]}.`}
              </p>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Siaran Massal:</span>
            <span className="font-semibold text-foreground">
              {currentPlan === "pro" || currentPlan === "premium" || currentPlan === "owner"
                ? "Bebas Watermark"
                : "Watermark Resmi"}
            </span>
          </div>
        </div>
      </div>

      {/* ── PLAN SELECTION CARDS SECTION ─────────────────────────────────── */}
      <div className="space-y-6 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">
              Pilihan Paket Langganan
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pilih paket yang sesuai dengan kebutuhan operasional akun Telegram Anda.
            </p>
          </div>

          {/* Monthly / Yearly Toggle */}
          <PricingFrequencyToggle
            selectedFrequency={billingCycle}
            onFrequencyChange={(val) => setBillingCycle(val as "monthly" | "yearly")}
            variant="dashboard"
          />
        </div>

        {/* 4 Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {PLANS.map((plan) => {
            const isYearly = billingCycle === "yearly";
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
            const period = plan.id === "freetrial" ? undefined : isYearly ? "/tahun" : "/bulan";
            const yearlyEquivalent =
              isYearly && plan.id !== "freetrial"
                ? plan.yearlyEquivalentPrice
                : undefined;
            const discountBadge =
              isYearly && plan.id !== "freetrial"
                ? `Hemat ${plan.yearlyDiscount}`
                : undefined;

            const isCurrent = plan.id === currentPlan;
            const rawPrice = isYearly ? plan.yearlyAmount : plan.amount;
            const userBalance = user?.balance ?? 0;
            const hasSufficientBalance = userBalance >= rawPrice && rawPrice > 0;

            let ctaText = `Pilih ${plan.name}`;
            let ctaDisabled = false;

            if (plan.id === "freetrial") {
              ctaText = isCurrent && isActive ? "Trial Aktif" : "Trial Selesai";
              ctaDisabled = true;
            } else if (isCurrent && isActive) {
              ctaText = "Paket Anda Saat Ini";
              ctaDisabled = true;
            } else if (isCurrent && !isActive) {
              ctaText = `Perpanjang ${plan.name}`;
            }

            return (
              <PricingCard
                key={plan.id}
                id={plan.id}
                name={plan.name}
                tagline={plan.tagline}
                description={plan.description}
                price={price}
                period={period}
                yearlyEquivalent={yearlyEquivalent}
                discountBadge={discountBadge}
                features={plan.features}
                isPopular={plan.isPopular}
                popularBadgeText="Rekomendasi"
                isCurrentPlan={isCurrent && isActive}
                currentPlanText="Paket Anda Saat Ini"
                ctaText={ctaText}
                ctaDisabled={ctaDisabled}
                ctaLoading={checkoutMutation.isPending && paymentModalPlan?.id === plan.id}
                onCtaClick={() => handleSelectPlan(plan.id, plan.name)}
                balanceSufficientNote={hasSufficientBalance ? "Saldo Cukup" : undefined}
                footnote={plan.footnote}
                variant="dashboard"
              />
            );
          })}
        </div>
      </div>

      {/* ── EXPANDABLE FEATURE COMPARISON TABLE ───────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowMatrix((prev) => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <TableIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground">
              Perbandingan Lengkap Fitur Paket
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span>{showMatrix ? "Sembunyikan Tabel" : "Lihat Semua Rincian Fitur"}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                showMatrix && "rotate-180"
              )}
            />
          </div>
        </button>

        {showMatrix && (
          <div className="border-t border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 border-b border-border hover:bg-muted/40">
                  <TableHead className="py-3.5 px-6 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Fitur & Kapasitas
                  </TableHead>
                  {PLAN_KEYS.map((pk) => (
                    <TableHead
                      key={pk}
                      className="text-center py-3.5 px-4 text-xs font-bold text-foreground capitalize whitespace-nowrap"
                    >
                      {PLAN_DISPLAY_NAMES[pk]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {FEATURE_MATRIX.map((row, i) => (
                  <TableRow
                    key={row.name}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      i % 2 === 0 ? "bg-card" : "bg-muted/15"
                    )}
                  >
                    <TableCell className="py-3 px-6 text-xs font-medium text-foreground whitespace-nowrap">
                      {row.name}
                    </TableCell>
                    {PLAN_KEYS.map((pk) => {
                      const val = row[pk];
                      const isPositive = val === "Ya" || val.includes("Hingga") || val === "Bebas" || val === "Tanpa Batas" || val === "Terbaik" || val === "Tertinggi (#1)" || val.includes("24/7");
                      const isNegative = val === "Tidak" || val.includes("Watermark") || val.includes("Kedaluwarsa");

                      return (
                        <TableCell key={pk} className="text-center py-3 px-4 text-xs font-medium whitespace-nowrap">
                          <span
                            className={cn(
                              isPositive
                                ? "text-primary dark:text-blue-400 font-semibold"
                                : isNegative
                                ? "text-muted-foreground"
                                : "text-foreground"
                            )}
                          >
                            {val}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── TRANSACTION / PAYMENT HISTORY TABLE ───────────────────────────── */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">
              Riwayat Transaksi Langganan
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {txHistoryData?.total ?? 0} transaksi tercatat
          </span>
        </div>

        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
          {txLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
              Memuat riwayat transaksi langganan...
            </div>
          ) : !txHistoryData?.transactions || txHistoryData.transactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Belum ada riwayat transaksi langganan pada akun Anda.
            </div>
          ) : (
            <div className="w-full overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 border-b border-border hover:bg-muted/40">
                    <TableHead className="py-3 px-4 text-xs font-semibold text-muted-foreground">
                      ID Transaksi
                    </TableHead>
                    <TableHead className="py-3 px-4 text-xs font-semibold text-muted-foreground">
                      Tanggal
                    </TableHead>
                    <TableHead className="py-3 px-4 text-xs font-semibold text-muted-foreground">
                      Nominal
                    </TableHead>
                    <TableHead className="py-3 px-4 text-xs font-semibold text-muted-foreground">
                      Metode
                    </TableHead>
                    <TableHead className="py-3 px-4 text-xs font-semibold text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="py-3 px-4 text-right text-xs font-semibold text-muted-foreground">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {txHistoryData.transactions.map((tx) => {
                    const isPending = tx.status === "pending";
                    const isApproved = tx.status === "approved";
                    const isRejected = tx.status === "rejected";

                    let planDetails = "Langganan";
                    if (tx.note) {
                      try {
                        const parsed = JSON.parse(tx.note);
                        if (parsed.plan_id) {
                          planDetails = `${parsed.plan_id.toUpperCase()} (${parsed.billing_cycle === "yearly" ? "Tahunan" : "Bulanan"})`;
                        }
                      } catch {}
                    }

                    return (
                      <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="py-3 px-4 font-mono text-xs font-semibold text-foreground">
                          {tx.id}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs font-bold text-foreground whitespace-nowrap">
                          Rp {tx.amount.toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                          {tx.method === "balance" ? "Saldo Dompet" : tx.method}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border",
                              isApproved
                                ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                : isPending
                                ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                            )}
                          >
                            {isApproved ? "Berhasil" : isPending ? "Menunggu Bayar" : "Kedaluwarsa"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right whitespace-nowrap">
                          {isPending ? (
                            <Link
                              href={`/wallet/invoice/${tx.id}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                            >
                              <span>Bayar QRIS</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">{planDetails}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: QUICK VOUCHER REDEEM ──────────────────────────────────── */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground rounded-2xl shadow-xl">
          <form onSubmit={handleRedeemSubmit}>
            <DialogHeader className="space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1">
                <Ticket className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                Tukarkan Kode Voucher
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Masukkan kode voucher resmi TeleBos untuk mengklaim paket atau saldo dompet.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <label
                  htmlFor="subscription-voucher-code"
                  className="block text-xs font-semibold text-foreground mb-1.5"
                >
                  Kode Voucher
                </label>
                <input
                  id="subscription-voucher-code"
                  name="voucherCode"
                  type="text"
                  required
                  value={voucherCode}
                  onChange={(e) => {
                    setVoucherCode(e.target.value.toUpperCase());
                    setRedeemError(null);
                  }}
                  placeholder="TELEBOS-PRO-XXXX"
                  className="w-full px-3.5 py-2.5 bg-background border border-input text-foreground rounded-xl text-xs font-mono font-medium tracking-wider focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                />
              </div>

              {redeemError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{redeemError}</span>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Belum memiliki voucher? Hubungi admin support resmi TeleBos untuk pembelian kode voucher langsung.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRedeemOpen(false);
                  setRedeemError(null);
                }}
                className="h-9 rounded-xl text-xs font-semibold border-border hover:bg-muted"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={redeemMutation.isPending || !voucherCode.trim()}
                className="h-9 rounded-xl text-xs font-bold gap-1.5"
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Menukarkan...</span>
                  </>
                ) : (
                  <span>Tukarkan Sekarang</span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: PAYMENT METHOD SELECTION ──────────────────────────────── */}
      <Dialog
        open={!!paymentModalPlan}
        onOpenChange={(open) => {
          if (!open) setPaymentModalPlan(null);
        }}
      >
        <DialogContent className="max-w-md p-6 rounded-2xl bg-card border-border shadow-xl">
          <DialogHeader className="text-left space-y-1.5 border-b border-border/50 pb-4">
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span>Pilih Metode Pembayaran</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Pilih cara pembayaran untuk mengaktifkan paket langganan Anda secara instan.
            </DialogDescription>
          </DialogHeader>

          {paymentModalPlan && (
            <div className="py-4 space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Paket yang dipilih:</span>
                  <span className="font-bold text-foreground">
                    {paymentModalPlan.title} ({billingCycle === "monthly" ? "1 Bulan" : "1 Tahun"})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Tagihan:</span>
                  <span className="font-black text-sm text-primary tabular-nums">
                    Rp {paymentModalPlan.price.toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-border/50 pt-2">
                  <span className="text-muted-foreground">Saldo Dompet Anda:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    Rp {(user?.balance ?? 0).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <Button
                  type="button"
                  onClick={() => handleCheckoutWithBalance(paymentModalPlan.id)}
                  disabled={checkoutMutation.isPending}
                  className="w-full h-12 rounded-xl flex items-center justify-between px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Wallet className="h-4 w-4" />
                    <span>Bayar dengan Saldo Dompet</span>
                  </div>
                  <span className="text-[11px] font-semibold opacity-90 bg-emerald-700/60 px-2 py-0.5 rounded">
                    Langsung Aktif
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCheckoutQRIS(paymentModalPlan.id)}
                  disabled={checkoutMutation.isPending}
                  className="w-full h-12 rounded-xl flex items-center justify-between px-4 font-semibold text-xs border border-border hover:bg-muted cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <QrCode className="h-4 w-4 text-primary" />
                    <span>Bayar via QRIS Otomatis</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
