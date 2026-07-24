"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSmmProfile,
  useAdminSmmSettings,
  useAdminUpdateSmmSettings,
  useAdminSyncServices,
  useAdminRefreshAllOrders,
} from "@/hooks/use-admin-smm";
import {
  Settings,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  DollarSign,
  Download,
  CheckCircle2,
  ArrowLeft,
  KeyRound,
  TrendingUp,
  Coins,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function SmmSettingsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();

  const { data: profile, isLoading: isProfileLoading } = useAdminSmmProfile();
  const { data: settings, isLoading: isSettingsLoading } = useAdminSmmSettings();
  const updateSettings = useAdminUpdateSmmSettings();
  const syncMutation = useAdminSyncServices();
  const refreshAllMutation = useAdminRefreshAllOrders();

  const [globalMarkup, setGlobalMarkup] = useState("0");
  const [accountBuyPrice, setAccountBuyPrice] = useState("7000");
  const [accountSellPrice, setAccountSellPrice] = useState("5500");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setGlobalMarkup(String(settings.global_markup_percent));
      if (settings.account_buy_price !== undefined) {
        setAccountBuyPrice(String(settings.account_buy_price));
      }
      if (settings.account_sell_price !== undefined) {
        setAccountSellPrice(String(settings.account_sell_price));
      }
    }
  }, [settings]);

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  async function handleSync() {
    try {
      const result = await syncMutation.mutateAsync();
      setActionMsg({ type: "success", text: `Synced ${result.synced} services` });
    } catch {
      setActionMsg({ type: "error", text: "Sync failed" });
    }
  }

  async function handleRefreshAll() {
    try {
      const result = await refreshAllMutation.mutateAsync();
      setActionMsg({ type: "success", text: `Refreshed ${result.refreshed} orders` });
    } catch {
      setActionMsg({ type: "error", text: "Refresh failed" });
    }
  }

  async function handleSaveGlobalMarkup() {
    const pct = parseInt(globalMarkup);
    if (isNaN(pct) || pct < 0 || pct > 1000) {
      setActionMsg({ type: "error", text: "Markup must be 0-1000" });
      return;
    }
    try {
      await updateSettings.mutateAsync({ global_markup_percent: pct });
      setActionMsg({ type: "success", text: "Global markup saved!" });
    } catch {
      setActionMsg({ type: "error", text: "Failed to save settings" });
    }
  }

  async function handleSaveMarketplacePricing() {
    const buy = parseInt(accountBuyPrice);
    const sell = parseInt(accountSellPrice);
    if (isNaN(buy) || buy < 0 || isNaN(sell) || sell < 0) {
      setActionMsg({ type: "error", text: "Prices must be positive numbers" });
      return;
    }
    try {
      await updateSettings.mutateAsync({
        account_buy_price: buy,
        account_sell_price: sell,
      });
      setActionMsg({ type: "success", text: "Marketplace prices saved!" });
    } catch {
      setActionMsg({ type: "error", text: "Failed to save settings" });
    }
  }

  function handleCopyApiUrl() {
    navigator.clipboard.writeText("https://buzzerpanel.id/api/json.php");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access SMM settings.</p>
      </div>
    );
  }

  if (isProfileLoading || isSettingsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-1/4 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-44 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition shrink-0">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SMM & Marketplace Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure profit margins, API sync protocols, and marketplace price lists</p>
        </div>
      </div>

      {/* Action Messages */}
      {actionMsg && (
        <div
          className={cn(
            "flex items-center gap-2.5 p-3.5 rounded-xl text-sm border font-medium transition",
            actionMsg.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          )}
        >
          {actionMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <p>{actionMsg.text}</p>
        </div>
      )}

      {/* Main Responsive Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Settings Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Global Profit Margin Card */}
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-gray-900">Global Service Markups</CardTitle>
                  <CardDescription className="text-xs text-gray-500 mt-0.5">
                    Default percentage profit margin added to SMM panel base service prices
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Global Markup Percentage
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 w-full sm:w-36 shrink-0 relative">
                    <input
                      type="number"
                      value={globalMarkup}
                      onChange={(e) => setGlobalMarkup(e.target.value)}
                      min={0}
                      max={1000}
                      className="w-full border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono font-semibold"
                    />
                    <span className="absolute right-3.5 text-sm text-gray-400 font-bold">%</span>
                  </div>
                  <Button
                    onClick={handleSaveGlobalMarkup}
                    disabled={updateSettings.isPending}
                    className="w-full sm:w-auto"
                  >
                    {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Markup
                  </Button>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Formula: Customer Price = Provider Base Cost × (100 + Markup) / 100
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Account Marketplace Pricing Card */}
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-gray-900">Telegram Marketplace Pricing</CardTitle>
                  <CardDescription className="text-xs text-gray-500 mt-0.5">
                    Platform base rates for purchasing and listing verified Telegram sessions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Buyer Cost (IDR)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs text-gray-400 font-bold font-mono">Rp</span>
                    <input
                      type="number"
                      value={accountBuyPrice}
                      onChange={(e) => setAccountBuyPrice(e.target.value)}
                      min={0}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">Standard price paid by users to buy a verified account</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Seller Payout (IDR)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs text-gray-400 font-bold font-mono">Rp</span>
                    <input
                      type="number"
                      value={accountSellPrice}
                      onChange={(e) => setAccountSellPrice(e.target.value)}
                      min={0}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">Balance payout given to users when selling an account</p>
                </div>
              </div>
              <Button
                onClick={handleSaveMarketplacePricing}
                disabled={updateSettings.isPending}
                className="w-full sm:w-auto mt-2"
              >
                {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Marketplace Prices
              </Button>
            </CardContent>
          </Card>

          {/* SMM API Configuration Card */}
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-gray-900">SMM Provider Credentials</CardTitle>
                  <CardDescription className="text-xs text-gray-500 mt-0.5">
                    Read-only connection settings injected from backend environment configurations
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-4 text-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 py-3 border-b border-gray-100">
                  <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] shrink-0">API Endpoint URL</span>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 max-w-full overflow-hidden">
                    <span className="font-mono text-gray-700 break-all text-[11px] truncate select-all">
                      https://buzzerpanel.id/api/json.php
                    </span>
                    <button
                      onClick={handleCopyApiUrl}
                      className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600 rounded transition shrink-0"
                      title="Copy URL"
                    >
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2.5 py-3 border-b border-gray-100">
                  <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] shrink-0">API Security Key</span>
                  <span className="font-mono text-gray-400 font-bold select-none bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 tracking-wider">
                    ••••••••••••••••
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-normal">
                💡 To update connection endpoints or credential tokens, edit the system configuration environment variables (`.env`) and restart the service backend.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Profile & Operations */}
        <div className="space-y-6">
          {/* Credit Card Wallet Style Profile Widget */}
          {profile && (profile.name || profile.balance) && (
            <Card className="border-0 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-lg overflow-hidden relative min-h-[180px]">
              <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-36 h-36 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
              <CardContent className="p-6 flex flex-col justify-between h-full min-h-[180px]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest">SMM Provider Account</p>
                    <h3 className="text-base font-bold text-white mt-1 break-words line-clamp-1">{profile.name || "BuzzerPanel"}</h3>
                  </div>
                  <Coins className="h-7 w-7 text-blue-500/80 opacity-80" />
                </div>
                <div className="mt-8">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Available Balance</p>
                  <p className="text-2xl font-black text-white tracking-tight mt-0.5 font-mono">
                    {profile.balance || "0"}
                    {profile.currency && <span className="text-xs text-gray-400 font-bold ml-1">{profile.currency}</span>}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Operations Deck */}
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-4">
              <CardTitle className="text-sm font-bold text-gray-900">Provider Sync Control</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Button
                onClick={handleSync}
                disabled={syncMutation.isPending}
                className="w-full justify-start text-left"
                variant="outline"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2.5 shrink-0" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2.5 shrink-0 text-blue-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs text-gray-900">Sync Provider Services</p>
                  <p className="text-[10px] text-gray-400 font-normal truncate mt-0.5">Reload and update service rates</p>
                </div>
              </Button>
              <Button
                onClick={handleRefreshAll}
                disabled={refreshAllMutation.isPending}
                className="w-full justify-start text-left"
                variant="outline"
              >
                {refreshAllMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2.5 shrink-0" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2.5 shrink-0 text-emerald-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs text-gray-900">Sync Order Statuses</p>
                  <p className="text-[10px] text-gray-400 font-normal truncate mt-0.5">Poll status updates from SMM panel</p>
                </div>
              </Button>
            </CardContent>
          </Card>

          {/* Export Center Card */}
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-4">
              <CardTitle className="text-sm font-bold text-gray-900">Export & Auditing</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Button
                variant="outline"
                onClick={() => window.open("/api/v1/admin/smm/orders/export", "_blank")}
                className="w-full justify-start text-left"
              >
                <Download className="h-4 w-4 mr-2.5 shrink-0 text-gray-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs text-gray-900">Export SMM Orders</p>
                  <p className="text-[10px] text-gray-400 font-normal truncate mt-0.5">Download full orders history as CSV</p>
                </div>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
