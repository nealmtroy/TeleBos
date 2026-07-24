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

  // Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access the SMM settings.</p>
      </div>
    );
  }

  if (isProfileLoading || isSettingsLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition shrink-0">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMM Settings & Marketplace</h1>
          <p className="text-gray-500 mt-1">Configure pricing parameters, sync with SMM panel, and manage account prices</p>
        </div>
      </div>

      {/* Action Message */}
      {actionMsg && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-xl text-sm",
            actionMsg.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          )}
        >
          {actionMsg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* SMM Panel Profile */}
      {profile && (profile.name || profile.balance) && (
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">SMM Panel Profile</CardTitle>
            <CardDescription>Current balance and profile details fetched from provider API</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {profile.name && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Name</p>
                  <p className="font-semibold text-gray-900 break-words">{profile.name}</p>
                </div>
              )}
              {profile.balance && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Balance</p>
                  <p className="font-semibold text-gray-900">{profile.balance}</p>
                </div>
              )}
              {profile.currency && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Currency</p>
                  <p className="font-semibold text-gray-900">{profile.currency}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync / Actions Card */}
      <Card className="border border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Sync services from SMM panel or refresh order statuses</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleSync} disabled={syncMutation.isPending} className="w-full sm:w-auto">
            {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Services
          </Button>
          <Button variant="outline" onClick={handleRefreshAll} disabled={refreshAllMutation.isPending} className="w-full sm:w-auto">
            {refreshAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh All Orders
          </Button>
        </CardContent>
      </Card>

      <div className="max-w-3xl space-y-6">
        {/* Global Markup */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Global Pricing</CardTitle>
            <CardDescription>
              Default markup applied to all services. Can be overridden per-service in the SMM Services page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Global Markup Percentage
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={globalMarkup}
                    onChange={(e) => setGlobalMarkup(e.target.value)}
                    min={0}
                    max={1000}
                    className="w-full sm:w-32 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-gray-500 shrink-0">%</span>
                </div>
                <Button
                  onClick={handleSaveGlobalMarkup}
                  disabled={updateSettings.isPending}
                  className="w-full sm:w-auto"
                >
                  {updateSettings.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Save Markup
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Effective price = original_price × (100 + markup) / 100
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account Marketplace Pricing */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Account Marketplace Pricing</CardTitle>
            <CardDescription>
              Configure the prices for buying and selling Telegram accounts on the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Buy Price (IDR)
                </label>
                <input
                  type="number"
                  value={accountBuyPrice}
                  onChange={(e) => setAccountBuyPrice(e.target.value)}
                  min={0}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <p className="text-xs text-gray-400 mt-1">Price paid by users to buy an account</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Sell Price (IDR)
                </label>
                <input
                  type="number"
                  value={accountSellPrice}
                  onChange={(e) => setAccountSellPrice(e.target.value)}
                  min={0}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <p className="text-xs text-gray-400 mt-1">Balance received by users when selling an account</p>
              </div>
            </div>
            <Button
              onClick={handleSaveMarketplacePricing}
              disabled={updateSettings.isPending}
              className="w-full sm:w-auto mt-2"
            >
              {updateSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Marketplace Prices
            </Button>
          </CardContent>
        </Card>

        {/* SMM API Config (read-only info) */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">SMM API Configuration</CardTitle>
            <CardDescription>Configured via environment variables</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-gray-100">
                <span className="text-gray-500">API URL</span>
                <span className="font-mono text-gray-700 break-all text-xs sm:text-sm sm:text-right">https://buzzerpanel.id/api/json.php</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-gray-100">
                <span className="text-gray-500">API Key</span>
                <span className="font-mono text-gray-400">••••••••</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                To change API credentials, update the .env file and restart the server.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Export</CardTitle>
            <CardDescription>Download SMM order data for external analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => window.open("/api/v1/admin/smm/orders/export", "_blank")}
              className="w-full sm:w-auto"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Orders as CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
