"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminSmmServices,
  useAdminSyncServices,
  useAdminUpdateService,
  useAdminBulkUpdateServices,
  type SmmService,
} from "@/hooks/use-admin-smm";
import {
  Package,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function SmmServicesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();

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

  // Only owner can access
  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access SMM services.</p>
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
          <h1 className="text-2xl font-bold text-gray-900">SMM Services</h1>
          <p className="text-gray-500 mt-1">Activate, configure pricing markup, and filter panel services</p>
        </div>
      </div>

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
              <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 hover:bg-gray-100/70 transition-colors"
                >
                  <span className="font-semibold text-gray-900 text-sm text-left break-all">{cat}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">
                      {activeCount}/{services.length} active
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-t border-gray-100 min-w-[600px]">
                      <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-xs">
                          <th className="py-2.5 px-4 font-medium">ID</th>
                          <th className="py-2.5 px-4 font-medium">Service Name</th>
                          <th className="py-2.5 px-4 font-medium text-right">Orig. Price ($)</th>
                          <th className="py-2.5 px-4 font-medium text-right">Effective ($)</th>
                          <th className="py-2.5 px-4 font-medium text-right">Markup</th>
                          <th className="py-2.5 px-4 font-medium text-center">Min / Max</th>
                          <th className="py-2.5 px-4 font-medium text-center">Active</th>
                          <th className="py-2.5 px-4 font-medium text-center">Visible</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.map((svc) => (
                          <tr key={svc.id} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
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
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-primary-500"
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
