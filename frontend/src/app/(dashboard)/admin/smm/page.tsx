"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSmmProfile,
  useAdminSmmServices,
  useAdminSmmOrders,
  useAdminSmmStats,
  useAdminSmmSettings,
  useAdminSyncServices,
  useAdminUpdateService,
  useAdminBulkUpdateServices,
  useAdminRefreshOrder,
  useAdminRefreshAllOrders,
  useAdminUpdateSmmSettings,
  type SmmService,
} from "@/hooks/use-admin-smm";
import {
  BarChart3,
  Settings,
  Package,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  DollarSign,
  Activity,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Status colors ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Processing: "bg-blue-100 text-blue-700 border-blue-200",
  "In progress": "bg-indigo-100 text-indigo-700 border-indigo-200",
  Partial: "bg-orange-100 text-orange-700 border-orange-200",
  Success: "bg-green-100 text-green-700 border-green-200",
  Error: "bg-red-100 text-red-700 border-red-200",
  Failed: "bg-red-100 text-red-700 border-red-200",
};

type TabId = "overview" | "services" | "orders" | "settings";

const TABS: { id: TabId; labelKey: string; icon: any }[] = [
  { id: "overview", labelKey: "adminSmm.overview", icon: BarChart3 },
  { id: "services", labelKey: "adminSmm.services", icon: Package },
  { id: "orders", labelKey: "adminSmm.allOrders", icon: ShoppingCart },
  { id: "settings", labelKey: "adminSmm.settings", icon: Settings },
];

export default function AdminSmmPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access the admin panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SMM Management</h1>
        <p className="text-gray-500 mt-1">Manage SMM services, orders, and settings</p>
      </div>

      {/* Responsive Tabs — horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-1 border-b border-gray-200 min-w-max">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {_(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "services" && <ServicesTab />}
      {activeTab === "orders" && <OrdersTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: stats, isLoading, error } = useAdminSmmStats();
  const { data: profile } = useAdminSmmProfile();
  const syncMutation = useAdminSyncServices();
  const refreshAllMutation = useAdminRefreshAllOrders();
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-24 sm:h-28 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load stats</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Package} label="Total Services" value={stats?.total_services ?? 0} color="blue" />
        <StatCard icon={CheckCircle2} label="Active Services" value={stats?.active_services ?? 0} color="green" />
        <StatCard icon={ShoppingCart} label="Total Orders" value={stats?.total_orders ?? 0} color="indigo" />
        <StatCard icon={AlertCircle} label="Pending Orders" value={stats?.pending_orders ?? 0} color="orange" />
        <StatCard icon={DollarSign} label="Total Revenue" value={stats?.total_revenue ?? 0} color="emerald" prefix="$" />
        <StatCard icon={Activity} label="Users with Orders" value={stats?.total_users_with_orders ?? 0} color="purple" />
        {profile?.balance && (
          <StatCard icon={DollarSign} label="Panel Balance" value={profile.balance} color="amber" />
        )}
      </div>

      {/* Quick Actions */}
      <Card>
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

      {/* SMM Panel Profile */}
      {profile && (profile.name || profile.balance) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SMM Panel Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {profile.name && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Name</p>
                  <p className="font-medium text-gray-900 break-words">{profile.name}</p>
                </div>
              )}
              {profile.balance && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Balance</p>
                  <p className="font-medium text-gray-900">{profile.balance}</p>
                </div>
              )}
              {profile.currency && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Currency</p>
                  <p className="font-medium text-gray-900">{profile.currency}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  prefix = "",
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  prefix?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    indigo: "bg-indigo-50 text-indigo-600",
    orange: "bg-orange-50 text-orange-600",
    emerald: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-gray-500 break-words leading-tight">{label}</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold mt-0.5 sm:mt-1 break-all">
              {prefix}
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          </div>
          <div className={cn("p-1.5 sm:p-2 rounded-lg shrink-0", colorMap[color] || colorMap.blue)}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Services Tab (responsive) ─────────────────────────────────────────────────

function ServicesTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const { data, isLoading, error } = useAdminSmmServices({
    search: search || undefined,
    category: categoryFilter || undefined,
    limit: 200,
  });
  const updateService = useAdminUpdateService();
  const syncMutation = useAdminSyncServices();
  const bulkMutation = useAdminBulkUpdateServices();
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  // Group services by category
  const grouped = (data?.services ?? []).reduce(
    (acc, svc) => {
      const cat = svc.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(svc);
      return acc;
    },
    {} as Record<string, SmmService[]>
  );

  const categories = Object.keys(grouped).sort();

  async function handleToggleActive(svc: any) {
    try {
      await updateService.mutateAsync({
        serviceId: svc.id,
        is_active: !svc.is_active,
      });
      setActionMsg({ type: "success", text: `"${svc.service_name}" ${svc.is_active ? "disabled" : "enabled"}` });
    } catch {
      setActionMsg({ type: "error", text: "Update failed" });
    }
  }

  async function handleToggleVisible(svc: any) {
    try {
      await updateService.mutateAsync({
        serviceId: svc.id,
        is_visible: !svc.is_visible,
      });
      setActionMsg({ type: "success", text: `"${svc.service_name}" visibility toggled` });
    } catch {
      setActionMsg({ type: "error", text: "Update failed" });
    }
  }

  async function handleSetMarkup(svc: any, percent: number) {
    try {
      await updateService.mutateAsync({
        serviceId: svc.id,
        markup_percent: percent,
      });
      setActionMsg({ type: "success", text: `Markup set to ${percent}%` });
    } catch {
      setActionMsg({ type: "error", text: "Update failed" });
    }
  }

  async function handleSync() {
    try {
      const result = await syncMutation.mutateAsync();
      setActionMsg({ type: "success", text: `Synced ${result.synced} services` });
    } catch {
      setActionMsg({ type: "error", text: "Sync failed" });
    }
  }

  async function handleBulkMarkup(percent: number) {
    try {
      const result = await bulkMutation.mutateAsync({ markup_percent: percent });
      setActionMsg({ type: "success", text: `Updated ${result.updated} services` });
    } catch {
      setActionMsg({ type: "error", text: "Bulk update failed" });
    }
  }

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  // Auto-expand first category
  useEffect(() => {
    if (categories.length > 0 && Object.keys(expandedCategories).length === 0) {
      setExpandedCategories({ [categories[0]]: true });
    }
  }, [categories.length]);

  return (
    <div className="space-y-4">
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

      {/* Toolbar — responsive stack */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm flex-1 sm:flex-none"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <Button variant="outline" onClick={handleSync} disabled={syncMutation.isPending} size="sm">
            <RefreshCw className={cn("h-4 w-4", syncMutation.isPending && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar — responsive */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <span className="text-sm font-medium text-gray-700">Bulk Markup:</span>
        {[0, 10, 20, 50, 100].map((pct) => (
          <Button
            key={pct}
            variant="outline"
            size="sm"
            onClick={() => handleBulkMarkup(pct)}
            disabled={bulkMutation.isPending}
          >
            {pct}%
          </Button>
        ))}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load services. Sync from SMM panel first.</p>
          <Button variant="outline" size="sm" onClick={handleSync}>
            Sync Now
          </Button>
        </div>
      ) : !data?.services.length ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-3">No services found. Sync from the SMM panel to get started.</p>
          <Button onClick={handleSync}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Services
          </Button>
        </div>
      ) : (
        /* Category Groups */
        <div className="space-y-3">
          {categories.map((cat) => {
            const services = grouped[cat];
            const isExpanded = expandedCategories[cat];
            const activeCount = services.filter((s) => s.is_active).length;

            return (
              <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="font-medium text-sm truncate">{cat}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {services.length}
                    </Badge>
                    <Badge className="text-xs bg-green-50 text-green-700 border-green-200 shrink-0">
                      {activeCount} active
                    </Badge>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                </button>

                {/* Mobile: card layout */}
                {isExpanded && (
                  <div className="sm:hidden divide-y divide-gray-100">
                    {services.map((svc) => (
                      <div key={svc.id} className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 text-sm break-words">{svc.service_name}</p>
                            <p className="text-xs text-gray-400 font-mono">#{svc.service_id}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleToggleActive(svc)}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                svc.is_active ? "text-green-600 hover:bg-green-50" : "text-red-400 hover:bg-red-50"
                              )}
                            >
                              {svc.is_active ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => handleToggleVisible(svc)}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                svc.is_visible ? "text-gray-600 hover:bg-gray-100" : "text-gray-300 hover:bg-gray-100"
                              )}
                            >
                              {svc.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">Original:</span>{" "}
                            <span className="font-mono text-gray-600">{svc.original_price}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Selling:</span>{" "}
                            <span className={cn("font-mono", svc.effective_price !== svc.original_price ? "text-emerald-600 font-semibold" : "text-gray-600")}>
                              {svc.effective_price}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Markup:</span>{" "}
                            <select
                              value={svc.markup_percent}
                              onChange={(e) => handleSetMarkup(svc, parseInt(e.target.value))}
                              className="text-xs border border-gray-200 rounded-lg px-1 py-0.5"
                              disabled={updateService.isPending}
                            >
                              {[0, 5, 10, 15, 20, 30, 50, 100].map((pct) => (
                                <option key={pct} value={pct}>{pct}%</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="text-gray-400">Min/Max:</span>{" "}
                            <span className="text-gray-600">{svc.min_qty.toLocaleString()}/{svc.max_qty.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Desktop: table layout */}
                {isExpanded && (
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm min-w-[650px]">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="text-left py-2 px-4 font-medium text-gray-500 whitespace-nowrap">ID</th>
                          <th className="text-left py-2 px-4 font-medium text-gray-500">Name</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500 whitespace-nowrap">Original Price</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500 whitespace-nowrap">Selling Price</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500 whitespace-nowrap">Markup</th>
                          <th className="text-center py-2 px-4 font-medium text-gray-500 whitespace-nowrap">Min/Max</th>
                          <th className="text-center py-2 px-4 font-medium text-gray-500 whitespace-nowrap">Active</th>
                          <th className="text-center py-2 px-4 font-medium text-gray-500 whitespace-nowrap">Visible</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.map((svc) => (
                          <tr key={svc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="py-2 px-4 text-gray-400 font-mono text-xs whitespace-nowrap">{svc.service_id}</td>
                            <td className="py-2 px-4 min-w-[120px]">
                              <p className="font-medium text-gray-900">{svc.service_name}</p>
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-gray-600 whitespace-nowrap">
                              {svc.original_price}
                            </td>
                            <td className="py-2 px-4 text-right whitespace-nowrap">
                              <span className={cn("font-mono", svc.effective_price !== svc.original_price ? "text-emerald-600 font-semibold" : "text-gray-600")}>
                                {svc.effective_price}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-right whitespace-nowrap">
                              <select
                                value={svc.markup_percent}
                                onChange={(e) => handleSetMarkup(svc, parseInt(e.target.value))}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                                disabled={updateService.isPending}
                              >
                                {[0, 5, 10, 15, 20, 30, 50, 100].map((pct) => (
                                  <option key={pct} value={pct}>{pct}%</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-4 text-center text-xs text-gray-500 whitespace-nowrap">
                              {svc.min_qty.toLocaleString()} / {svc.max_qty.toLocaleString()}
                            </td>
                            <td className="py-2 px-4 text-center">
                              <button
                                onClick={() => handleToggleActive(svc)}
                                disabled={updateService.isPending}
                                className={cn(
                                  "p-1 rounded-lg transition-colors",
                                  svc.is_active
                                    ? "text-green-600 hover:bg-green-50"
                                    : "text-red-400 hover:bg-red-50"
                                )}
                              >
                                {svc.is_active ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="py-2 px-4 text-center">
                              <button
                                onClick={() => handleToggleVisible(svc)}
                                disabled={updateService.isPending}
                                className={cn(
                                  "p-1 rounded-lg transition-colors",
                                  svc.is_visible
                                    ? "text-gray-600 hover:bg-gray-100"
                                    : "text-gray-300 hover:bg-gray-100"
                                )}
                              >
                                {svc.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Orders Tab (responsive) ───────────────────────────────────────────────────

function OrdersTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading, error, refetch } = useAdminSmmOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    limit: 100,
  });
  const refreshOrder = useAdminRefreshOrder();
  const refreshAllMutation = useAdminRefreshAllOrders();
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  async function handleRefreshOrder(orderId: string) {
    try {
      await refreshOrder.mutateAsync(orderId);
      setActionMsg({ type: "success", text: "Order refreshed" });
    } catch {
      setActionMsg({ type: "error", text: "Refresh failed" });
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

  return (
    <div className="space-y-4">
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

      {/* Toolbar — responsive stack */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or target..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm flex-1 sm:flex-none"
          >
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="In progress">In Progress</option>
            <option value="Partial">Partial</option>
            <option value="Success">Success</option>
            <option value="Error">Error</option>
            <option value="Failed">Failed</option>
          </select>
          <Button variant="outline" onClick={handleRefreshAll} disabled={refreshAllMutation.isPending} size="sm">
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button variant="outline" onClick={() => refetch()} size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ShoppingCart className="h-4 w-4" />
          Total Orders: <span className="font-semibold text-gray-900">{data.total}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load orders</p>
        </div>
      ) : !data?.orders.length ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No orders found</p>
        </div>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="sm:hidden space-y-3">
            {data.orders.map((o) => (
              <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm break-all">{o.user_email}</p>
                    <p className="text-xs text-gray-400 font-mono">{o.id.slice(0, 8)}...</p>
                  </div>
                  <span
                    className={cn(
                      "inline-block text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0",
                      STATUS_COLORS[o.status] || "bg-gray-100 text-gray-700"
                    )}
                  >
                    {o.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{o.service_name}</p>
                <p className="text-xs text-gray-500 break-all" title={o.data_target}>
                  Target: {o.data_target}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-gray-600">{o.quantity.toLocaleString()} x {o.total_price.toLocaleString()}</span>
                  <button
                    onClick={() => handleRefreshOrder(o.id)}
                    disabled={refreshOrder.isPending}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Refresh Status"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table layout */}
          <div className="hidden sm:block overflow-x-auto bg-white rounded-xl border border-gray-200">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 whitespace-nowrap">User</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Service</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Target</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Qty</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Price</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Status</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{o.user_email}</p>
                      <p className="text-xs text-gray-400 font-mono">{o.id.slice(0, 8)}...</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-gray-900">{o.service_name}</p>
                      <p className="text-xs text-gray-400">{o.category}</p>
                    </td>
                    <td className="py-3 px-4 max-w-[200px] truncate text-gray-600" title={o.data_target}>
                      {o.data_target}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600 whitespace-nowrap">{o.quantity.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600 whitespace-nowrap">{o.total_price.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={cn(
                          "inline-block text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap",
                          STATUS_COLORS[o.status] || "bg-gray-100 text-gray-700"
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleRefreshOrder(o.id)}
                        disabled={refreshOrder.isPending}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Refresh Status"
                      >
                        <RefreshCw className={cn("h-4 w-4", refreshOrder.isPending && "animate-spin")} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Settings Tab (responsive) ─────────────────────────────────────────────────

function SettingsTab() {
  const { data: settings, isLoading } = useAdminSmmSettings();
  const updateSettings = useAdminUpdateSmmSettings();
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
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

      {/* Global Markup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Global Pricing</CardTitle>
          <CardDescription>
            Default markup applied to all services. Can be overridden per-service in the Services tab.
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
                Save
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Effective price = original_price × (100 + markup) / 100
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Account Marketplace Pricing */}
      <Card>
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
      <Card>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Export</CardTitle>
          <CardDescription>Download order data for external analysis</CardDescription>
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
  );
}
