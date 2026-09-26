"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useMySubscription, useRedeemCode } from "@/hooks/use-subscriptions";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const PLAN_KEYS = ["basic", "pro", "premium"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];
type CurrentPlanKey = PlanKey | "owner";

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
    icon: Crown,
    statusBg: "bg-indigo-50/60",
    statusText: "text-indigo-700",
    cardRing: "ring-indigo-200",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
    badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
};

// Features matrix: which features are included in which plans
const FEATURE_MATRIX: { key: string; basic: boolean; pro: boolean; premium: boolean }[] = [
  { key: "featureChat", basic: true, pro: true, premium: true },
  { key: "featureAccounts", basic: false, pro: true, premium: true },
  { key: "featureBroadcast", basic: false, pro: true, premium: true },
  { key: "featureAutoReply", basic: false, pro: true, premium: true },
  { key: "featureContacts", basic: false, pro: true, premium: true },
  { key: "featureInvite", basic: false, pro: false, premium: true },
  { key: "featurePriority", basic: false, pro: false, premium: true },
  { key: "featureAllFuture", basic: false, pro: false, premium: true },
];

export default function SubscriptionPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: subscription, isLoading, error } = useMySubscription();
  const redeemMutation = useRedeemCode();

  const [showMatrix, setShowMatrix] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const currentPlan = (subscription?.plan || user?.role || "basic") as CurrentPlanKey;
  const isActive = subscription?.is_active ?? false;
  const expiresAt = subscription?.expires_at ?? null;
  const daysRemaining = subscription?.days_remaining ?? null;

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

  // Define tier card data matching ChatGPT style layout
  const tierCards: {
    id: PlanKey;
    title: string;
    tagline: string;
    desc: string;
    price: string;
    period: string;
    isCurrent: boolean;
    isPopular: boolean;
    headerFeature: string;
    features: { icon: React.ElementType; text: string }[];
    footnote: React.ReactNode;
  }[] = [
    {
      id: "basic",
      title: "Free",
      tagline: _("subscription.tryTelebos"),
      desc: "Jelajahi pengelolaan akun Telegram, fitur direct chat, dan perkiraan umur akun secara mudah.",
      price: "Rp 0",
      period: _("subscription.perMonth"),
      isCurrent: currentPlan === "basic",
      isPopular: false,
      headerFeature: _("subscription.startWithBasics"),
      features: [
        { icon: MessageSquare, text: "Obrolan teks & manajemen chat langsung" },
        { icon: Smartphone, text: "1 akun Telegram aktif terhubung" },
        { icon: Search, text: "Pencarian katalog channel & grup publik" },
        { icon: Clock, text: "Alat estimasi umur nomor & ID Telegram" },
        { icon: Shield, text: "Dukungan proxy & sesi terenkripsi standar" },
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
      title: "TeleBos Pro",
      tagline: _("subscription.expandedAccess"),
      desc: "Kirim pesan siaran massal dan aktifkan bot penjawab otomatis dengan kapasitas diperluas.",
      price: "Rp 99.000",
      period: _("subscription.perMonth"),
      isCurrent: currentPlan === "pro",
      isPopular: false,
      headerFeature: _("subscription.everythingInFree"),
      features: [
        { icon: Radio, text: "Siaran broadcast pesan massal & terjadwal" },
        { icon: Bot, text: "Auto-reply responder otomatis untuk pesan masuk" },
        { icon: Users, text: "Kelola hingga 10 akun Telegram terhubung" },
        { icon: FolderSync, text: "Manajemen folder akun & filter kategori" },
        { icon: Sliders, text: "Pengaturan jeda anti flood-wait kustom" },
        { icon: FileText, text: "Sinkronisasi kontak Telegram & histori log" },
      ],
      footnote: "Pilihan terbaik untuk pengelola channel & grup Telegram aktif.",
    },
    {
      id: "premium",
      title: "TeleBos Premium",
      tagline: _("subscription.yourTelegramAssistant"),
      desc: "Solusi terlengkap: scraper lead anggota grup, auto-invite target, dan prioritas server tercepat.",
      price: "Rp 249.000",
      period: _("subscription.perMonth"),
      isCurrent: currentPlan === "premium",
      isPopular: true,
      headerFeature: _("subscription.everythingInPro"),
      features: [
        { icon: Crown, text: "Koneksi akun Telegram tanpa batas (Unlimited)" },
        { icon: UserPlus, text: "Scrape member target & auto-invite ke grup Anda" },
        { icon: Zap, text: "Antrean eksekusi server tercepat & prioritas tinggi" },
        { icon: Sparkles, text: "Otomasi reaksi postingan & booster views" },
        { icon: ShieldCheck, text: "Banding otomatis status SpamBot Telegram" },
        { icon: FolderSync, text: "Filter rotasi proxy & proteksi multi-sesi" },
        { icon: CheckCircle2, text: "Semua fitur masa depan & support prioritas 24/7" },
      ],
      footnote: "Paling banyak dipilih oleh digital marketer & agensi profesional.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-2 sm:py-6">
      {/* ── TOP HEADER SECTION (ChatGPT Style) ── */}
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          {_("subscription.upgradeYourPlan")}
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Pilih paket automasi Telegram terbaik untuk mengoptimalkan operasional dan skala akun Anda.
        </p>
      </div>

      {/* ── CURRENT PLAN STATUS BAR (Clean & Light) ── */}
      {isLoading ? (
        <div className="h-20 bg-white border border-slate-200 rounded-2xl animate-pulse" />
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">Gagal memuat informasi langganan aktif.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn("p-2.5 rounded-xl border shrink-0", meta.iconBg, meta.badgeBg)}>
              <StatusIcon className={cn("h-5 w-5", meta.iconColor)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500">{_("subscription.currentPlan")}:</span>
                <span className="text-sm font-bold text-slate-900 uppercase">
                  {currentPlan}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                    currentPlan === "owner"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  )}
                >
                  {currentPlan === "owner" ? (
                    <Crown className="h-3 w-3" />
                  ) : isActive ? (
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <XCircle className="h-3 w-3 text-slate-400" />
                  )}
                  {currentPlan === "owner"
                    ? _("subscription.lifetime")
                    : isActive
                    ? _("subscription.active")
                    : _("subscription.expired")}
                </span>
              </div>

              {/* Expiry detail */}
              {currentPlan !== "basic" && currentPlan !== "owner" && expiresAt && (
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>
                    {_("subscription.expiresAt")}:{" "}
                    <strong className="text-slate-700 font-medium">
                      {new Date(expiresAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </strong>
                  </span>
                  {daysRemaining !== null && isActive && (
                    <span className="text-primary-600 font-semibold">
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
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
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressPercent > 30 ? "bg-primary-500" : progressPercent > 10 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* ── 3 CHATGPT-STYLE PLAN CARDS (Light Theme) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {tierCards.map((card) => {
          return (
            <div
              key={card.id}
              className={cn(
                "rounded-2xl transition-all duration-200 flex flex-col justify-between p-6 sm:p-7 relative",
                card.isPopular
                  ? "bg-gradient-to-b from-blue-50/50 via-white to-white border-2 border-primary-500 shadow-md ring-4 ring-primary-500/10"
                  : "bg-white border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm",
                card.isCurrent && !card.isPopular && "ring-2 ring-emerald-500/20 border-emerald-500/60"
              )}
            >
              {/* RECOMMENDED BADGE (Exact match with reference) */}
              {card.isPopular && (
                <span className="absolute -top-3 right-6 bg-primary-600 text-white text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                  {_("subscription.recommended")}
                </span>
              )}

              {/* CARD TOP HALF */}
              <div>
                {/* Plan Name */}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-bold uppercase tracking-wider",
                      card.isPopular ? "text-primary-600" : "text-slate-500"
                    )}
                  >
                    {card.title}
                  </span>
                </div>

                {/* Big Punchy Tagline */}
                <h2 className="text-xl font-bold text-slate-900 mt-1.5 tracking-tight">
                  {card.tagline}
                </h2>

                {/* Description */}
                <p className="text-xs text-slate-500 mt-2 min-h-[38px] leading-relaxed">
                  {card.desc}
                </p>

                {/* Price Display */}
                <div className="mt-5 flex items-baseline">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {card.price}
                  </span>
                  <span className="text-xs text-slate-400 font-medium ml-1.5">
                    {card.period}
                  </span>
                </div>

                {/* Action CTA Button */}
                <div className="mt-5">
                  {card.isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className={cn(
                        "w-full py-2.5 rounded-xl text-xs font-semibold cursor-default text-center transition flex items-center justify-center gap-1.5",
                        card.isPopular
                          ? "bg-primary-50 text-primary-700 border border-primary-200"
                          : card.id === "pro"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-400 border border-slate-200"
                      )}
                    >
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      {_("subscription.yourCurrentPlan")}
                    </button>
                  ) : card.id === "basic" ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 cursor-default"
                    >
                      {_("subscription.yourCurrentPlan")}
                    </button>
                  ) : card.isPopular ? (
                    <button
                      type="button"
                      onClick={() => setRedeemOpen(true)}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
                    >
                      <span>+</span>
                      <span>{_("subscription.upgradeToPremium")}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRedeemOpen(true)}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
                    >
                      {_("subscription.upgradeToPro")}
                    </button>
                  )}
                </div>

                {/* Feature Header */}
                <div className="mt-7 mb-3.5">
                  <p className="text-xs font-semibold text-slate-900">
                    {card.headerFeature}
                  </p>
                </div>

                {/* Features List with Clean Icons */}
                <ul className="space-y-3">
                  {card.features.map((f, idx) => {
                    const IconComponent = f.icon;
                    return (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 leading-snug">
                        <IconComponent
                          className={cn(
                            "h-4 w-4 shrink-0 mt-0.5",
                            card.isPopular ? "text-primary-600" : "text-slate-400"
                          )}
                        />
                        <span>{f.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* CARD BOTTOM FOOTNOTE */}
              <div className="mt-8 pt-4 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
                {card.footnote}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── EXPANDABLE FEATURE COMPARISON TABLE ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMatrix((prev) => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50/75 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <TableIcon className="h-4 w-4 text-primary-600" />
            <span className="text-sm font-bold text-slate-900">
              {_("subscription.compareFeatures")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span>{showMatrix ? "Sembunyikan" : "Tampilkan Rincian"}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform duration-200",
                showMatrix && "rotate-180"
              )}
            />
          </div>
        </button>

        {showMatrix && (
          <div className="border-t border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {_("subscription.feature")}
                  </th>
                  {PLAN_KEYS.map((pk) => {
                    const pm = PLAN_META[pk];
                    return (
                      <th
                        key={pk}
                        className="text-center py-3 px-4 text-xs font-semibold text-slate-700 capitalize whitespace-nowrap"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <pm.icon className={cn("h-3.5 w-3.5", pm.iconColor)} />
                          <span>{pk}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FEATURE_MATRIX.map((row, i) => (
                  <tr
                    key={row.key}
                    className={cn(
                      "hover:bg-slate-50/50 transition-colors",
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/25"
                    )}
                  >
                    <td className="py-3 px-6 text-xs font-medium text-slate-800 whitespace-nowrap">
                      {_(`subscription.${row.key}` as any)}
                    </td>
                    {PLAN_KEYS.map((pk) => {
                      const included = row[pk];
                      return (
                        <td key={pk} className="text-center py-3 px-4">
                          {included ? (
                            <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                          ) : (
                            <Minus className="h-4 w-4 text-slate-300 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL DIALOG: QUICK VOUCHER REDEEM ── */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-xl">
          <form onSubmit={handleRedeemSubmit}>
            <DialogHeader className="space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-1">
                <Ticket className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {_("subscription.voucherRedeemTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {_("subscription.voucherRedeemDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Kode Voucher / Redeem Code
                </label>
                <input
                  type="text"
                  required
                  value={voucherCode}
                  onChange={(e) => {
                    setVoucherCode(e.target.value.toUpperCase());
                    setRedeemError(null);
                  }}
                  placeholder="TELEBOS-PRO-XXXX"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium tracking-wider focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                />
              </div>

              {redeemError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{redeemError}</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                {_("subscription.contactSupportPrompt")}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setRedeemOpen(false);
                  setRedeemError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={redeemMutation.isPending || !voucherCode.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition shadow-sm cursor-pointer"
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
    </div>
  );
}
