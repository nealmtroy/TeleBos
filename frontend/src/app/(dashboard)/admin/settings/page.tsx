"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSmmProfile,
  useAdminSmmSettings,
  useAdminUpdateSmmSettings,
  useAdminSyncServices,
  useAdminRefreshAllOrders,
  useAdminSmmStats,
} from "@/hooks/use-admin-smm";
import { useBankAccountStore } from "@/store/bank-account-store";
import {
  Settings,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  DollarSign,
  Download,
  CheckCircle2,
  KeyRound,
  TrendingUp,
  Coins,
  Send,
  Building2,
  CreditCard,
  QrCode,
  Lock,
  Layers,
  Sparkles,
  Server,
  Radio,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ConfigTab = "smm" | "payment" | "marketplace" | "system";

export default function AdminSystemConfigPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<ConfigTab>("smm");

  // Read tab from URL query if provided
  useEffect(() => {
    const tabParam = searchParams.get("tab") as ConfigTab;
    if (tabParam && ["smm", "payment", "marketplace", "system"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // SMM Hooks
  const { data: profile, isLoading: isProfileLoading, refetch: refetchProfile } = useAdminSmmProfile();
  const { data: settings, isLoading: isSettingsLoading } = useAdminSmmSettings();
  const { data: stats } = useAdminSmmStats();
  const updateSettings = useAdminUpdateSmmSettings();
  const syncMutation = useAdminSyncServices();
  const refreshAllMutation = useAdminRefreshAllOrders();

  // SMM Form state
  const [globalMarkup, setGlobalMarkup] = useState("0");
  const [accountBuyPrice, setAccountBuyPrice] = useState("7000");
  const [accountSellPrice, setAccountSellPrice] = useState("5500");
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkText, setWatermarkText] = useState("Bot by @{official}");
  const [freeDailyHours, setFreeDailyHours] = useState("5");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Bank & Deposit Gateway Store
  const { depositSettings, updateDepositSettings, hydrate: hydrateBankStore } = useBankAccountStore();
  const [merchantName, setMerchantName] = useState(depositSettings.merchantName);
  const [nmid, setNmid] = useState(depositSettings.nmid);
  const [bankName, setBankName] = useState(depositSettings.bankName);
  const [bankAccountNumber, setBankAccountNumber] = useState(depositSettings.bankAccountNumber);
  const [bankAccountHolder, setBankAccountHolder] = useState(depositSettings.bankAccountHolder);

  // General System State
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    hydrateBankStore();
  }, [hydrateBankStore]);

  useEffect(() => {
    if (settings) {
      setGlobalMarkup(String(settings.global_markup_percent));
      if (settings.account_buy_price !== undefined) {
        setAccountBuyPrice(String(settings.account_buy_price));
      }
      if (settings.account_sell_price !== undefined) {
        setAccountSellPrice(String(settings.account_sell_price));
      }
      if (settings.broadcast_watermark_enabled !== undefined) {
        setWatermarkEnabled(settings.broadcast_watermark_enabled);
      }
      if (settings.broadcast_watermark_text !== undefined) {
        setWatermarkText(settings.broadcast_watermark_text);
      }
      if (settings.broadcast_free_daily_seconds !== undefined) {
        setFreeDailyHours(String(settings.broadcast_free_daily_seconds / 3600));
      }
    }
  }, [settings]);

  useEffect(() => {
    setMerchantName(depositSettings.merchantName);
    setNmid(depositSettings.nmid);
    setBankName(depositSettings.bankName);
    setBankAccountNumber(depositSettings.bankAccountNumber);
    setBankAccountHolder(depositSettings.bankAccountHolder);
  }, [depositSettings]);

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  if (currentUser?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-3">
        <Shield className="h-12 w-12 text-rose-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Akses Ditolak</h2>
        <p className="text-xs text-gray-500 max-w-sm">
          Halaman Konfigurasi Sistem ini hanya dapat diakses oleh Administrator Owner.
        </p>
      </div>
    );
  }

  async function handleSync() {
    try {
      const result = await syncMutation.mutateAsync();
      setActionMsg({ type: "success", text: `Berhasil sinkronisasi ${result.synced} layanan SMM` });
      toast.success(`Berhasil sinkronisasi ${result.synced} layanan SMM`);
    } catch {
      setActionMsg({ type: "error", text: "Gagal melakukan sinkronisasi layanan" });
      toast.error("Gagal melakukan sinkronisasi layanan");
    }
  }

  async function handleRefreshAll() {
    try {
      const result = await refreshAllMutation.mutateAsync();
      setActionMsg({ type: "success", text: `Berhasil memperbarui ${result.refreshed} pesanan SMM` });
      toast.success(`Berhasil memperbarui ${result.refreshed} pesanan SMM`);
    } catch {
      setActionMsg({ type: "error", text: "Gagal memperbarui status pesanan" });
      toast.error("Gagal memperbarui status pesanan");
    }
  }

  async function handleSaveGlobalMarkup() {
    const pct = parseInt(globalMarkup);
    if (isNaN(pct) || pct < 0 || pct > 1000) {
      setActionMsg({ type: "error", text: "Markup harus antara 0-1000%" });
      toast.error("Markup harus antara 0-1000%");
      return;
    }
    try {
      await updateSettings.mutateAsync({ global_markup_percent: pct });
      setActionMsg({ type: "success", text: "Markup global berhasil disimpan!" });
      toast.success("Markup global berhasil disimpan!");
    } catch {
      setActionMsg({ type: "error", text: "Gagal menyimpan markup" });
      toast.error("Gagal menyimpan markup");
    }
  }

  async function handleSaveMarketplacePricing() {
    const buy = parseInt(accountBuyPrice);
    const sell = parseInt(accountSellPrice);
    if (isNaN(buy) || buy < 0 || isNaN(sell) || sell < 0) {
      toast.error("Harga harus berupa angka positif");
      return;
    }
    try {
      await updateSettings.mutateAsync({
        account_buy_price: buy,
        account_sell_price: sell,
      });
      toast.success("Harga marketplace akun berhasil disimpan!");
    } catch {
      toast.error("Gagal menyimpan harga marketplace");
    }
  }

  async function handleSaveBroadcastEntitlement() {
    const hours = parseFloat(freeDailyHours);
    if (isNaN(hours) || hours < 0 || hours > 24) {
      toast.error("Kuota harian harus antara 0 dan 24 jam");
      return;
    }
    const watermark = watermarkText.trim();
    if (watermarkEnabled && !watermark) {
      toast.error("Teks watermark tidak boleh kosong jika diaktifkan");
      return;
    }
    try {
      await updateSettings.mutateAsync({
        broadcast_watermark_enabled: watermarkEnabled,
        broadcast_watermark_text: watermark,
        broadcast_free_daily_seconds: Math.round(hours * 3600),
      });
      toast.success("Pengaturan siaran & watermark berhasil disimpan!");
    } catch {
      toast.error("Gagal menyimpan pengaturan broadcast");
    }
  }

  function handleSavePaymentGateway(e: React.FormEvent) {
    e.preventDefault();
    updateDepositSettings({
      merchantName: merchantName.trim() || "TELEBOS",
      nmid: nmid.trim() || "ID1020042918290",
      bankName: bankName.trim() || "Mandiri",
      bankAccountNumber: bankAccountNumber.trim(),
      bankAccountHolder: bankAccountHolder.trim(),
    });
    toast.success("Pengaturan gateway deposit & rekening platform berhasil disimpan!");
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="h-6 w-6 text-primary-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-50">
              Konfigurasi Sistem
            </h1>
          </div>
          <p className="text-gray-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            Pusat kendali operasional platform TeleBos, integrasi provider API, gateway pembayaran, dan kuota layanan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/transactions"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:text-primary-600 transition shadow-2xs"
          >
            <CreditCard className="h-4 w-4 text-emerald-500" />
            <span>Alur Transaksi</span>
          </Link>
        </div>
      </div>

      {/* Global Action Message */}
      {actionMsg && (
        <div
          role="status"
          className={cn(
            "p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 animate-in fade-in duration-200",
            actionMsg.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-300"
          )}
        >
          {actionMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as ConfigTab)}
        className="w-full"
      >
        <TabsList className="h-auto p-1 bg-gray-100 dark:bg-slate-800/80 rounded-xl flex items-center justify-start gap-1 overflow-x-auto w-full">
          <TabsTrigger
            value="smm"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-gray-900 data-[state=active]:dark:text-slate-100 data-[state=active]:shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Server className="h-4 w-4 text-blue-500" />
            <span>SMM Provider & API</span>
          </TabsTrigger>

          <TabsTrigger
            value="payment"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-gray-900 data-[state=active]:dark:text-slate-100 data-[state=active]:shadow-xs whitespace-nowrap cursor-pointer"
          >
            <QrCode className="h-4 w-4 text-emerald-500" />
            <span>Deposit & Rekening Platform</span>
          </TabsTrigger>

          <TabsTrigger
            value="marketplace"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-gray-900 data-[state=active]:dark:text-slate-100 data-[state=active]:shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Radio className="h-4 w-4 text-amber-500" />
            <span>Marketplace & Siaran</span>
          </TabsTrigger>

          <TabsTrigger
            value="system"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-gray-900 data-[state=active]:dark:text-slate-100 data-[state=active]:shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Lock className="h-4 w-4 text-purple-500" />
            <span>Sistem & Keamanan</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── TAB 1: SMM PROVIDER & API ── */}
      {activeTab === "smm" && (
        <div className="space-y-6">
          {/* Provider Profile & Balance Card */}
          <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 border border-blue-200 dark:border-blue-900/60">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                    BuzzerPanel SMM Provider
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Koneksi API provider pemroses layanan Telegram & SMM otomatis.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchProfile()}
                disabled={isProfileLoading}
                className="h-8 text-xs cursor-pointer"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isProfileLoading && "animate-spin")} />
                <span>Refresh Saldo</span>
              </Button>
            </div>

            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Saldo Provider (BuzzerPanel)
                  </span>
                  <p className="font-mono text-xl font-bold text-gray-900 dark:text-slate-100">
                    {profile?.balance
                      ? isNaN(Number(profile.balance))
                        ? profile.balance
                        : `Rp ${Number(profile.balance).toLocaleString("id-ID")}`
                      : "Rp 0"}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-semibold block">● Terhubung</span>
                </div>

                <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Total Layanan Terintegrasi
                  </span>
                  <p className="font-mono text-xl font-bold text-gray-900 dark:text-slate-100">
                    {stats?.total_services ?? 0} Layanan
                  </p>
                  <span className="text-[10px] text-gray-500 block">Katalog SMM aktif</span>
                </div>

                <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Markup Global Saat Ini
                  </span>
                  <p className="font-mono text-xl font-bold text-primary-600 dark:text-primary-400">
                    +{settings?.global_markup_percent ?? 0}%
                  </p>
                  <span className="text-[10px] text-gray-500 block">Margin keuntungan platform</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800 flex flex-wrap gap-3">
                <Button
                  onClick={handleSync}
                  disabled={syncMutation.isPending}
                  className="text-xs h-9 cursor-pointer"
                >
                  <Download className={cn("h-3.5 w-3.5 mr-1.5", syncMutation.isPending && "animate-spin")} />
                  <span>{syncMutation.isPending ? "Menyinkronkan..." : "Sinkronisasi Layanan dari BuzzerPanel"}</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={handleRefreshAll}
                  disabled={refreshAllMutation.isPending}
                  className="text-xs h-9 cursor-pointer"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshAllMutation.isPending && "animate-spin")} />
                  <span>{refreshAllMutation.isPending ? "Memperbarui..." : "Refresh Semua Status Pesanan"}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SMM Global Markup Card */}
          <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                Pengaturan Markup Harga Layanan SMM
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Tentukan persentase margin keuntungan yang otomatis ditambahkan di atas harga dasar provider.
              </p>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="max-w-xs space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Markup Global (%)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={globalMarkup}
                    onChange={(e) => setGlobalMarkup(e.target.value)}
                    className="w-full h-10 px-3.5 pr-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                  <span className="absolute right-3 text-xs font-bold text-gray-400">%</span>
                </div>
              </div>

              <Button
                onClick={handleSaveGlobalMarkup}
                disabled={updateSettings.isPending}
                className="text-xs h-9 cursor-pointer"
              >
                {updateSettings.isPending ? "Menyimpan..." : "Simpan Markup Global"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TAB 2: DEPOSIT & REKENING PLATFORM ── */}
      {activeTab === "payment" && (
        <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
          <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-900/60">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                  Konfigurasi Akun Deposit Platform
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  Atur kredensial QRIS nasional dan rekening bank penampung resmi TeleBos.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSavePaymentGateway} className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  Nama Merchant QRIS
                </label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="TELEBOS"
                  className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  NMID QRIS Nasional
                </label>
                <input
                  type="text"
                  value={nmid}
                  onChange={(e) => setNmid(e.target.value)}
                  placeholder="ID1020042918290"
                  className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  Bank Penampung Cadangan
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Mandiri"
                  className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  Nomor Rekening Penampung
                </label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="1400 0019 4488 2"
                  className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  Nama Pemilik Rekening Penampung
                </label>
                <input
                  type="text"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                  placeholder="TeleBos Official"
                  className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  required
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="text-xs h-9 cursor-pointer">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                <span>Simpan Pengaturan Gateway Deposit</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── TAB 3: MARKETPLACE & SIARAN ── */}
      {activeTab === "marketplace" && (
        <div className="space-y-6">
          {/* Marketplace Pricing */}
          <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                Harga Transaksi Akun Telegram (Marketplace)
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Tentukan harga beli akun oleh pengguna dan harga jual akun dari pengguna ke platform.
              </p>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                    Harga Beli Akun (Pengguna Membeli)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-bold text-gray-400">Rp</span>
                    <input
                      type="number"
                      value={accountBuyPrice}
                      onChange={(e) => setAccountBuyPrice(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                    Harga Jual Akun (Pengguna Menjual ke Platform)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-bold text-gray-400">Rp</span>
                    <input
                      type="number"
                      value={accountSellPrice}
                      onChange={(e) => setAccountSellPrice(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveMarketplacePricing} className="text-xs h-9 cursor-pointer">
                Simpan Harga Marketplace
              </Button>
            </CardContent>
          </Card>

          {/* Broadcast Entitlements & Watermark */}
          <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                Pengaturan Kuota Siaran Harian & Watermark
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Konfigurasi batas waktu operasional siaran gratis dan watermark otomatis pada pesan siaran paket gratis.
              </p>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                    Kuota Siaran Harian Paket Gratis (Jam)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={24}
                    value={freeDailyHours}
                    onChange={(e) => setFreeDailyHours(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                    Teks Watermark Siaran
                  </label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="watermark-enabled"
                  checked={watermarkEnabled}
                  onCheckedChange={(checked) => setWatermarkEnabled(!!checked)}
                />
                <label htmlFor="watermark-enabled" className="text-xs text-gray-700 dark:text-slate-300 font-medium cursor-pointer">
                  Aktifkan Watermark pada Pesan Broadcast Paket Gratis
                </label>
              </div>

              <Button onClick={handleSaveBroadcastEntitlement} className="text-xs h-9 cursor-pointer">
                Simpan Pengaturan Siaran
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TAB 4: SISTEM & KEAMANAN ── */}
      {activeTab === "system" && (
        <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
          <div className="p-5 border-b border-gray-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
              Parameter Keamanan & Operasional Platform
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Kontrol langsung ketersediaan layanan dan kebijakan pendaftaran pengguna platform.
            </p>
          </div>
          <CardContent className="p-5 space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-gray-900 dark:text-slate-100">
                  Mode Pemeliharaan (Maintenance Mode)
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Jika diaktifkan, hanya Owner dan Administrator yang dapat login dan menggunakan platform.
                </p>
              </div>
              <Switch
                checked={maintenanceMode}
                onCheckedChange={(checked) => {
                  setMaintenanceMode(checked);
                  toast.success(checked ? "Mode pemeliharaan diaktifkan" : "Mode pemeliharaan dinonaktifkan");
                }}
                aria-label="Toggle maintenance mode"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-gray-900 dark:text-slate-100">
                  Pendaftaran Pengguna Baru (Open Registration)
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Izinkan pengunjung baru membuat akun dan mendaftar di TeleBos secara publik.
                </p>
              </div>
              <Switch
                checked={registrationOpen}
                onCheckedChange={(checked) => {
                  setRegistrationOpen(checked);
                  toast.success(checked ? "Pendaftaran dibuka" : "Pendaftaran ditutup");
                }}
                aria-label="Toggle open registration"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
