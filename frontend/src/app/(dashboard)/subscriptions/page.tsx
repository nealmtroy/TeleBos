"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useMySubscription, useRedeemCode, useCheckoutSubscription } from "@/hooks/use-subscriptions";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  Minus,
  Check,
  MessageSquare,
  Smartphone,
  Search,
  Shield,
  Radio,
  Bot,
  Users,
  FolderSync,
  Sliders,
  FileText,
  Sparkles,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Loader2,
  ChevronDown,
  Table as TableIcon,
  Wallet,
  QrCode,
} from "lucide-react";
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

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  basic: { monthly: 5000, yearly: 50000 },
  pro: { monthly: 10000, yearly: 100000 },
  premium: { monthly: 20000, yearly: 200000 },
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
    statusBg: "bg-sky-50",
    statusText: "text-sky-700",
    cardRing: "ring-sky-200",
    iconColor: "text-sky-600",
    iconBg: "bg-sky-100",
    badgeBg: "bg-sky-100 text-sky-700 border-sky-200",
  },
  basic: {
    icon: Zap,
    statusBg: "bg-slate-50",
    statusText: "text-slate-700",
    cardRing: "ring-slate-200",
    iconColor: "text-slate-500",
    iconBg: "bg-slate-100",
    badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
  },
  pro: {
    icon: Star,
    statusBg: "bg-primary-50/60",
    statusText: "text-primary-700",
    cardRing: "ring-primary-200",
    iconColor: "text-primary-600",
    iconBg: "bg-primary-50",
    badgeBg: "bg-primary-50 text-primary-700 border-primary-200",
  },
  premium: {
    icon: Crown,
    statusBg: "bg-amber-50/60",
    statusText: "text-amber-700",
    cardRing: "ring-amber-200",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
    badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
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

// Features matrix: which features are included in which plans
const FEATURE_MATRIX: { name: string; freetrial: boolean; basic: boolean; pro: boolean; premium: boolean }[] = [
  { name: "Direct Chat & Obrolan Teks", freetrial: true, basic: true, pro: true, premium: true },
  { name: "Auto Reply Responder", freetrial: true, basic: true, pro: true, premium: true },
  { name: "Auto Join Groups & Channels", freetrial: false, basic: true, pro: true, premium: true },
  { name: "Mass Broadcast (Pesan Massal)", freetrial: false, basic: false, pro: true, premium: true },
  { name: "Bebas Watermark Pesan", freetrial: false, basic: false, pro: true, premium: true },
  { name: "Age Checker (Cek Umur Akun)", freetrial: false, basic: false, pro: true, premium: true },
  { name: "Public Index Groups & Channels", freetrial: false, basic: false, pro: true, premium: true },
  { name: "Member Inviter", freetrial: false, basic: false, pro: true, premium: true },
  { name: "Prioritas Antrean Server Tercepat", freetrial: false, basic: false, pro: false, premium: true },
];

export default function SubscriptionPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: subscription, isLoading, error } = useMySubscription();
  const redeemMutation = useRedeemCode();
  const checkoutMutation = useCheckoutSubscription();
  const router = useRouter();

  const [showMatrix, setShowMatrix] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  const currentPlan = (subscription?.plan || user?.role || "freetrial") as CurrentPlanKey;
  const isActive = subscription?.is_active ?? false;
  const expiresAt = subscription?.expires_at ?? null;
  const daysRemaining = subscription?.days_remaining ?? null;
  const secondsRemaining = subscription?.seconds_remaining ?? null;

  // Premium and Owner are at or above the top sellable tier, so the page stops
  // being a sales surface for them: it shows only their current status and
  // expiry. Everything below this flag is an upsell.
  const showUpsell = currentPlan !== "premium" && currentPlan !== "owner";

  const meta = PLAN_META[currentPlan] || PLAN_META.basic;
  const StatusIcon = meta.icon;

  // Progress bar percentage (based on 30-day cycle as default)
  const progressPercent =
    daysRemaining !== null && daysRemaining >= 0
      ? Math.min(100, Math.max(0, (daysRemaining / 30) * 100))
      : 0;

  async function handleRedeemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!voucherCode.trim()) return;

    setRedeemError(null);
    try {
      await redeemMutation.mutateAsync(voucherCode.trim().toUpperCase());
      toast.success(_("redeem.success") || "Voucher successfully activated!");
      setVoucherCode("");
      setRedeemOpen(false);
      await fetchMe();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || _("redeem.error") || "Failed to redeem code";
      setRedeemError(msg);
      toast.error(msg);
    }
  }

  const [paymentModalPlan, setPaymentModalPlan] = useState<{
    id: string;
    title: string;
    price: number;
  } | null>(null);

  async function handleCheckoutWithBalance(planId: string) {
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

  async function handleCheckoutQRIS(planId: string) {
    try {
      const response = await checkoutMutation.mutateAsync({
        plan_id: planId,
        billing_cycle: billingCycle,
        payment_method: "qris",
      });
      if (response.invoice_id) {
        toast.success(_("subscription.invoiceCreated") || "Invoice created! Redirecting...");
        setPaymentModalPlan(null);
        router.push(`/wallet/invoice/${response.invoice_id}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to create invoice";
      toast.error(msg);
    }
  }

  function handleSelectPlan(planId: string, title: string) {
    const price = PLAN_PRICES[planId]?.[billingCycle] || 0;
    const userBalance = user?.balance ?? 0;
    if (userBalance >= price) {
      setPaymentModalPlan({ id: planId, title, price });
    } else {
      toast.info("Saldo tidak mencukupi, membuat tagihan pembayaran QRIS...");
      handleCheckoutQRIS(planId);
    }
  }

  // Define tier card data matching ChatGPT style layout
  const tierCards: {
    id: PlanKey;
    title: string;
    tagline: string;
    desc: string;
    monthlyPrice: string;
    yearlyPrice: string;
    yearlyEquivalentPrice: string;
    yearlyDiscount: string;
    period: string;
    isCurrent: boolean;
    isPopular: boolean;
    headerFeature: string;
    features: { icon: React.ElementType; text: string }[];
    footnote: React.ReactNode;
  }[] = [
    {
      id: "freetrial",
      title: "Free Trial",
      tagline: _("subscription.tryTelebos"),
      desc: "Coba fitur dasar selama 5 jam sejak pendaftaran. Dilengkapi watermark.",
      monthlyPrice: "Gratis",
      yearlyPrice: "Gratis",
      yearlyEquivalentPrice: "Rp 0",
      yearlyDiscount: "0%",
      period: "5 jam",
      isCurrent: currentPlan === "freetrial",
      isPopular: false,
      headerFeature: "Mulai dari uji coba gratis",
      features: [
        { icon: MessageSquare, text: "Obrolan teks & manajemen chat langsung" },
        { icon: Smartphone, text: "1 akun Telegram aktif terhubung" },
        { icon: Bot, text: "Sistem auto-reply aktif" },
        { icon: Clock, text: "Masa aktif trial 5 jam" },
        { icon: Shield, text: "Pesan memiliki watermark aplikasi" },
      ],
      footnote: (
        <span className="text-slate-500">Otomatis berakhir setelah 5 jam.</span>
      ),
    },
    {
      id: "basic",
      title: "Starter",
      tagline: _("subscription.tryTelebos"),
      desc: "Kelola akun Telegram, auto-reply, dan auto-join grup/channel secara efisien.",
      monthlyPrice: "Rp 5.000",
      yearlyPrice: "Rp 50.000",
      yearlyEquivalentPrice: "Rp 4.167",
      yearlyDiscount: "17%",
      period: _("subscription.perMonth"),
      isCurrent: currentPlan === "basic",
      isPopular: false,
      headerFeature: _("subscription.startWithBasics"),
      features: [
        { icon: MessageSquare, text: "Obrolan teks & manajemen chat langsung" },
        { icon: Smartphone, text: "1 akun Telegram aktif terhubung" },
        { icon: Bot, text: "Sistem auto-reply aktif" },
        { icon: FolderSync, text: "Auto-join grup & channel publik" },
        { icon: Shield, text: "Pesan memiliki watermark aplikasi" },
      ],
      footnote: (
        <Link href="/help" className="hover:underline flex items-center gap-1">
          {_("subscription.billingHelp")}
          <ArrowRight className="h-3 w-3 shrink-0" />
        </Link>
      ),
    },
    {
      id: "pro",
      title: "Pro",
      tagline: _("subscription.expandedAccess"),
      desc: "Kirim pesan siaran massal tanpa watermark dan kelola hingga 3 akun.",
      monthlyPrice: "Rp 10.000",
      yearlyPrice: "Rp 100.000",
      yearlyEquivalentPrice: "Rp 8.333",
      yearlyDiscount: "17%",
      period: _("subscription.perMonth"),
      isCurrent: currentPlan === "pro",
      isPopular: false,
      headerFeature: _("subscription.everythingInFree"),
      features: [
        { icon: Radio, text: "Siaran broadcast pesan massal tanpa watermark" },
        { icon: Bot, text: "Auto-reply responder otomatis untuk pesan masuk" },
        { icon: Users, text: "Kelola hingga 3 akun Telegram terhubung" },
        { icon: Search, text: "Age Checker & Public Index grup/channel" },
        { icon: UserPlus, text: "Member Inviter & Auto-join grup" },
        { icon: FileText, text: "Sinkronisasi kontak Telegram & histori log" },
      ],
      footnote: "Pilihan terbaik untuk pengelola channel & grup Telegram aktif.",
    },
    {
      id: "premium",
      title: "Business",
      tagline: _("subscription.yourTelegramAssistant"),
      desc: "Solusi terlengkap: kapasitas 5 akun, scraper member target, auto-invite, dan prioritas server tercepat.",
      monthlyPrice: "Rp 20.000",
      yearlyPrice: "Rp 200.000",
      yearlyEquivalentPrice: "Rp 16.667",
      yearlyDiscount: "17%",
      period: _("subscription.perMonth"),
      isCurrent: currentPlan === "premium",
      isPopular: true,
      headerFeature: _("subscription.everythingInPro"),
      features: [
        { icon: Crown, text: "Koneksi hingga 5 akun Telegram aktif" },
        { icon: Radio, text: "Siaran broadcast tanpa watermark & antrean tercepat" },
        { icon: UserPlus, text: "Scrape member target & auto-invite ke grup" },
        { icon: Search, text: "Age Checker & Public Index grup/channel" },
        { icon: ShieldCheck, text: "Banding otomatis status SpamBot Telegram" },
        { icon: FolderSync, text: "Filter rotasi proxy & proteksi multi-sesi" },
        { icon: CheckCircle2, text: "Semua fitur masa depan & support prioritas 24/7" },
      ],
      footnote: "Paling banyak dipilih oleh digital marketer & agensi profesional.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-4 sm:py-8 px-2 sm:px-4">
      {/* ── TOP HEADER SECTION (ChatGPT Style) ── */}
      <div className="text-center space-y-2 max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          {showUpsell ? _("subscription.upgradeYourPlan") : _("subscription.mySubscription")}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[65ch] mx-auto">
          {showUpsell
            ? "Pilih paket automasi Telegram terbaik untuk mengoptimalkan operasional dan skala akun Anda."
            : "Status langganan dan masa aktif paket Anda."}
        </p>
      </div>

      {/* ── CURRENT PLAN STATUS BAR (Clean & Light) ── */}
      {isLoading ? (
        <div className="h-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl animate-pulse" />
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">Gagal memuat informasi langganan aktif.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn("p-2.5 rounded-xl border shrink-0", meta.iconBg, meta.badgeBg)}>
              <StatusIcon className={cn("h-5 w-5", meta.iconColor)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">{_("subscription.currentPlan")}:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase">
                  {PLAN_DISPLAY_NAMES[currentPlan] || currentPlan}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                    currentPlan === "owner"
                      ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      : currentPlan === "freetrial"
                      ? isActive
                        ? "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      : isActive
                      ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  )}
                >
                  {currentPlan === "owner" ? (
                    <Crown className="h-3 w-3" />
                  ) : currentPlan === "freetrial" ? (
                    isActive ? (
                      <Clock className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-slate-400" />
                    )
                  ) : isActive ? (
                    <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="h-3 w-3 text-rose-500" />
                  )}
                  {currentPlan === "owner"
                    ? _("subscription.lifetime")
                    : currentPlan === "freetrial"
                    ? isActive
                      ? "Trial Aktif"
                      : "Trial Selesai"
                    : isActive
                    ? _("subscription.active")
                    : _("subscription.expired")}
                </span>
              </div>

              {/* Expiry detail */}
              {currentPlan === "freetrial" ? (
                isActive && secondsRemaining !== null && secondsRemaining > 0 ? (
                  <div className="flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300 mt-1 font-medium">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Trial —{" "}
                      <strong>
                        {Math.floor(secondsRemaining / 3600)}j {Math.floor((secondsRemaining % 3600) / 60)}m tersisa
                      </strong>
                    </span>
                    {expiresAt && (
                      <span className="text-slate-400 font-normal">
                        (hingga {new Date(expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Masa coba gratis 5 jam telah berakhir. Silakan pilih paket langganan di bawah untuk melanjutkan.
                  </div>
                )
              ) : currentPlan !== "owner" && expiresAt && (
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>
                    {_("subscription.expiresAt")}:{" "}
                    <strong className="text-slate-700 dark:text-slate-200 font-medium">
                      {new Date(expiresAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </strong>
                  </span>
                  {daysRemaining !== null && isActive && (
                    <span className="text-primary-600 dark:text-primary-400 font-semibold">
                      ({daysRemaining} {_("subscription.daysRemaining")})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Redeem Voucher Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setRedeemOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Ticket className="h-3.5 w-3.5 text-amber-400" />
              <span>{_("subscription.voucherRedeemTitle")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Progress bar for active expiry countdown */}
      {currentPlan !== "basic" && currentPlan !== "owner" && isActive && daysRemaining !== null && (
        <div className="-mt-4 px-2">
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                progressPercent > 30 ? "bg-primary-500" : progressPercent > 10 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {showUpsell && (
        <>
        {/* Toggle Monthly/Yearly */}
        <div className="flex justify-center items-center gap-3 mt-8 mb-6">
          <span className={cn("text-sm font-medium", billingCycle === "monthly" ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400")}>
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setBillingCycle(prev => prev === "monthly" ? "yearly" : "monthly")}
            className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-primary-600 transition-colors duration-200 ease-in-out focus:outline-none"
            role="switch"
            aria-checked={billingCycle === "yearly"}
          >
            <span className="sr-only">Toggle billing cycle</span>
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                billingCycle === "yearly" ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
          <span className={cn("text-sm font-medium", billingCycle === "yearly" ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400")}>
            Yearly
          </span>
        </div>

        {/* ── 4 CHATGPT-STYLE PLAN CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {tierCards.map((card) => {
            return (
              <div
                key={card.id}
                className={cn(
                  "rounded-2xl transition-colors duration-150 flex flex-col justify-between p-6 sm:p-7 relative",
                  card.isPopular
                    ? "bg-white dark:bg-slate-800 border-2 border-primary-500 dark:border-primary-500 shadow-md"
                    : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600",
                  card.isCurrent && !card.isPopular && "border-emerald-500/60 dark:border-emerald-500/60"
                )}
              >
                {/* RECOMMENDED BADGE */}
                {card.isPopular && (
                  <span className="absolute -top-3 right-6 bg-primary-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                    {_("subscription.recommended")}
                  </span>
                )}

                {/* CARD TOP HALF */}
                <div>
                  {/* Plan Name */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-bold uppercase tracking-wider flex items-center gap-2",
                        card.isPopular ? "text-primary-600 dark:text-primary-400" : "text-slate-500 dark:text-slate-300"
                      )}
                    >
                      {card.title}
                      {billingCycle === "yearly" && card.id !== "basic" && card.id !== "freetrial" && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                          Hemat {card.yearlyDiscount}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Big Punchy Tagline */}
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1.5 tracking-tight">
                    {card.tagline}
                  </h2>

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 min-h-[38px] leading-relaxed">
                    {card.desc}
                  </p>

                  {/* Price Display */}
                  <div className="mt-5 flex flex-col gap-1">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
                        {billingCycle === "monthly" ? card.monthlyPrice : card.yearlyPrice}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-300 font-medium ml-1.5">
                        {billingCycle === "monthly" ? card.period : "/tahun"}
                      </span>
                    </div>
                    {billingCycle === "yearly" && card.id !== "basic" && card.id !== "freetrial" && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        Setara {card.yearlyEquivalentPrice}/bulan, ditagih tahunan
                      </span>
                    )}
                    {billingCycle === "yearly" && (card.id === "basic" || card.id === "freetrial") && (
                      <span className="text-[11px] text-transparent select-none font-medium mt-0.5">
                        Spacer
                      </span>
                    )}
                  </div>

                  {/* Action CTA Button */}
                  <div className="mt-5">
                    {card.id === "freetrial" ? (
                      <button
                        type="button"
                        disabled
                        className={cn(
                          "w-full py-2.5 rounded-xl text-xs font-semibold cursor-default text-center transition flex items-center justify-center gap-1.5",
                          currentPlan === "freetrial" && isActive
                            ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                        )}
                      >
                        {currentPlan === "freetrial" && isActive ? (
                          <>
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span>Trial Aktif</span>
                          </>
                        ) : (
                          <span>Trial Selesai</span>
                        )}
                      </button>
                    ) : card.id === currentPlan && isActive ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-2.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-default flex items-center justify-center gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        {_("subscription.yourCurrentPlan")}
                      </button>
                    ) : card.isPopular ? (
                      <button
                        type="button"
                        onClick={() => handleSelectPlan(card.id, card.title)}
                        disabled={checkoutMutation.isPending}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {checkoutMutation.isPending ? "Processing..." : (
                          <>
                            <span>+</span>
                            <span>{card.id === currentPlan && !isActive ? "Perpanjang Business" : "Pilih Business"}</span>
                            {user && user.balance >= (PLAN_PRICES[card.id]?.[billingCycle] || 0) && (
                              <span className="text-[10px] font-normal opacity-90 ml-1">(Saldo Cukup)</span>
                            )}
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectPlan(card.id, card.title)}
                        disabled={checkoutMutation.isPending}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {checkoutMutation.isPending ? "Processing..." : (
                          <>
                            <span>
                              {card.id === currentPlan && !isActive
                                ? `Perpanjang ${card.title}`
                                : `Pilih ${card.title}`}
                            </span>
                            {user && user.balance >= (PLAN_PRICES[card.id]?.[billingCycle] || 0) && (
                              <span className="text-[10px] font-normal text-emerald-400 ml-1">(Saldo Cukup)</span>
                            )}
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Feature Header */}
                  <div className="mt-7 mb-3.5">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {card.headerFeature}
                    </p>
                  </div>

                  {/* Features List with Clean Icons */}
                  <ul className="space-y-3">
                    {card.features.map((f, idx) => {
                      const IconComponent = f.icon;
                      return (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-snug">
                          <IconComponent
                            className={cn(
                              "h-4 w-4 shrink-0 mt-0.5",
                              card.isPopular ? "text-primary-600 dark:text-primary-400" : "text-slate-400 dark:text-slate-500"
                            )}
                          />
                          <span>{f.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* CARD BOTTOM FOOTNOTE */}
                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {card.footnote}
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}

      {showUpsell && (
        <>
        {/* ── EXPANDABLE FEATURE COMPARISON TABLE ── */}
        <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMatrix((prev) => !prev)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50/75 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <TableIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {_("subscription.compareFeatures")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{showMatrix ? "Sembunyikan" : "Tampilkan Rincian"}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform duration-200",
                  showMatrix && "rotate-180"
                )}
              />
            </div>
          </button>

          {showMatrix && (
            <div className="border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-950/60">
                    <TableHead className="py-3.5 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {_("subscription.feature")}
                    </TableHead>
                    {PLAN_KEYS.map((pk) => {
                      const pm = PLAN_META[pk];
                      return (
                        <TableHead
                          key={pk}
                          className="text-center py-3.5 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize whitespace-nowrap"
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <pm.icon className={cn("h-3.5 w-3.5", pm.iconColor)} />
                            <span>{pk}</span>
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {FEATURE_MATRIX.map((row, i) => (
                    <TableRow
                      key={row.name}
                      className={cn(
                        "hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors",
                        i % 2 === 0 ? "bg-white dark:bg-slate-900/30" : "bg-slate-50/25 dark:bg-slate-950/30"
                      )}
                    >
                      <TableCell className="py-3 px-6 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {row.name}
                      </TableCell>
                      {PLAN_KEYS.map((pk) => {
                        const included = row[pk];
                        return (
                          <TableCell key={pk} className="text-center py-3 px-4">
                            {included ? (
                              <Check className="h-4 w-4 text-primary-600 dark:text-primary-400 mx-auto" />
                            ) : (
                              <Minus className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                            )}
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
        </>
        )}

      {/* ── MODAL DIALOG: QUICK VOUCHER REDEEM ── */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl shadow-xl">
          <form onSubmit={handleRedeemSubmit}>
            <DialogHeader className="space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1">
                <Ticket className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                {_("subscription.voucherRedeemTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                {_("subscription.voucherRedeemDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <label htmlFor="subscription-voucher-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Kode Voucher / Redeem Code
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
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono font-medium tracking-wider focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                />
              </div>

              {redeemError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{redeemError}</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {_("subscription.contactSupportPrompt")}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setRedeemOpen(false);
                  setRedeemError(null);
                }}
                className="inline-flex h-9 items-center justify-center px-4 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-card text-foreground hover:bg-muted shadow-2xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={redeemMutation.isPending || !voucherCode.trim()}
                className="inline-flex h-9 items-center justify-center gap-1.5 px-5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-hover text-primary-foreground disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Menukarkan...</span>
                  </>
                ) : (
                  <span>{_("subscription.redeemCodeAction")}</span>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── PAYMENT METHOD SELECTION MODAL ── */}
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
              <span>Metode Pembayaran</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Pilih cara pembayaran untuk mengaktifkan paket langganan Anda.
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
                    <span>Bayar via QRIS</span>
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
