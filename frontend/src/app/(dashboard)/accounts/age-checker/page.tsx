"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import api from "@/lib/api";
import { useAccounts } from "@/hooks/use-accounts";
import { useToast } from "@/components/ui/toast";
import { Calendar, Clock, Database, Search, RefreshCw, Info, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface EstimateResult {
  status: "exact" | "approx" | "older_than" | "newer_than" | "unknown";
  date: string | null;
  age: string;
}

export default function AgeCheckerPage() {
  const _ = useT();
  const { toast } = useToast();
  const { data: accountsData, isLoading: loadingAccounts } = useAccounts();

  // State for estimation
  const [telegramId, setTelegramId] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);

  // State for syncing datapoints
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [syncing, setSyncing] = useState(false);

  const activeAccounts = Array.isArray(accountsData) 
    ? accountsData.filter(acc => acc.is_active) 
    : [];

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = telegramId.trim();
    if (!cleanId || isNaN(Number(cleanId)) || Number(cleanId) <= 0) {
      toast({
        variant: "error",
        title: "Invalid Input",
        description: _("ageChecker.errorInvalidId"),
      });
      return;
    }

    setEstimating(true);
    setResult(null);

    try {
      const response = await api.get<EstimateResult>(
        `/telegram-reg-date/estimate?telegram_id=${cleanId}`
      );
      setResult(response.data);
    } catch (err) {
      console.error(err);
      toast({
        variant: "error",
        title: "Estimation Failed",
        description: "Could not fetch registration date estimate from server.",
      });
    } finally {
      setEstimating(false);
    }
  };

  const handleSync = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);

    try {
      const response = await api.post<{ status: string; new_datapoints: number }>(
        `/telegram-reg-date/sync?account_id=${selectedAccountId}`
      );
      toast({
        variant: "success",
        title: "Sync Complete",
        description: _("ageChecker.scanSuccess").replace(
          "{count}",
          String(response.data.new_datapoints)
        ),
      });
    } catch (err) {
      console.error(err);
      toast({
        variant: "error",
        title: "Sync Failed",
        description: "Failed to scan dialogs for registration datapoints.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: EstimateResult["status"]) => {
    const statusMap = {
      exact: { text: _("ageChecker.statusExact"), color: "bg-green-50 text-green-700 border-green-200" },
      approx: { text: _("ageChecker.statusApprox"), color: "bg-blue-50 text-blue-700 border-blue-200" },
      older_than: { text: _("ageChecker.statusOlder"), color: "bg-amber-50 text-amber-700 border-amber-200" },
      newer_than: { text: _("ageChecker.statusNewer"), color: "bg-amber-50 text-amber-700 border-amber-200" },
      unknown: { text: _("ageChecker.statusUnknown"), color: "bg-gray-50 text-gray-500 border-gray-200" },
    };

    const current = statusMap[status] || statusMap.unknown;
    return (
      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", current.color)}>
        {current.text}
      </span>
    );
  };

  const formatDateString = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("ageChecker.title")}</h1>
        <p className="text-gray-500 mt-1">{_("ageChecker.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Estimator Card */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary-500" />
              {_("ageChecker.title")}
            </h2>
            <form onSubmit={handleEstimate} className="space-y-4">
              <div>
                <label htmlFor="telegramId" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  {_("ageChecker.inputLabel")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="telegramId"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    placeholder={_("ageChecker.inputPlaceholder")}
                    className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={estimating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none"
              >
                {estimating && <RefreshCw className="h-4 w-4 animate-spin" />}
                {estimating ? _("ageChecker.checking") : _("ageChecker.checkButton")}
              </button>
            </form>
          </div>

          {/* Results card */}
          {result && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-fadeIn">
              <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                {_("ageChecker.resultTitle")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border-r border-gray-100 pr-4">
                  <span className="text-xs text-gray-400 uppercase font-semibold flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {_("ageChecker.estRegDate")}
                  </span>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatDateString(result.date)}
                  </p>
                </div>
                <div className="pl-0 sm:pl-4">
                  <span className="text-xs text-gray-400 uppercase font-semibold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {_("ageChecker.estAge")}
                  </span>
                  <p className="text-lg font-bold text-gray-900 mt-1">{result.age}</p>
                </div>
                <div className="sm:col-span-2 pt-2 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 uppercase font-semibold">
                    {_("ageChecker.statusLabel")}
                  </span>
                  {getStatusBadge(result.status)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sync/Harvest Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary-500" />
              {_("ageChecker.scanButton")}
            </h2>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Harvest verified signup dates from your connected account dialogs to expand and refine our estimator dataset.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="syncAccount" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Select Active Account
                </label>
                <select
                  id="syncAccount"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  disabled={loadingAccounts || activeAccounts.length === 0}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                >
                  <option value="">
                    {loadingAccounts 
                      ? "Loading accounts..." 
                      : activeAccounts.length === 0 
                        ? "No active accounts" 
                        : "Select account..."}
                  </option>
                  {activeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.first_name || "Unnamed"} ({acc.phone})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSync}
                disabled={syncing || !selectedAccountId}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none shadow-sm"
              >
                {syncing && <RefreshCw className="h-4 w-4 animate-spin" />}
                {syncing ? _("ageChecker.scanning") : _("ageChecker.scanButton")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Explanation Section */}
      <div className="bg-slate-900 text-slate-300 rounded-xl p-6 border border-slate-800 flex gap-4 shadow-inner">
        <Info className="h-6 w-6 text-primary-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <h4 className="font-bold text-sm text-white">{_("ageChecker.explanationTitle")}</h4>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            {_("ageChecker.explanationText")}
          </p>
        </div>
      </div>
    </div>
  );
}
