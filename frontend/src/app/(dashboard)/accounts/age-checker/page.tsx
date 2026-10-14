"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Calendar, Clock, Search, RefreshCw, Info, ShieldCheck, Shield, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface EstimateResult {
  status: "exact" | "approx" | "older_than" | "newer_than" | "unknown";
  date: string | null;
  age: string;
}

export default function AgeCheckerPage() {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);

  // State for estimation
  const [telegramId, setTelegramId] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);

  // Role check: Age Checker is available for Pro and Business plans
  if (user?.role !== "pro" && user?.role !== "premium" && user?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400 shadow-2xs">
          <Shield className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">
          Fitur Khusus Paket Pro & Business
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Fitur Age Checker (cek umur akun Telegram) hanya tersedia untuk pelanggan paket Pro atau Business. Silakan tingkatkan paket Anda untuk mengakses fitur ini.
        </p>
        <Link
          href="/subscriptions"
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-xs transition-all active:scale-95"
        >
          <Crown className="h-4 w-4 mr-2" />
          Lihat Paket Langganan
        </Link>
      </div>
    );
  }

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

  const getStatusBadge = (status: EstimateResult["status"]) => {
    const statusMap: Record<EstimateResult["status"], { text: string; variant: "success" | "info" | "warning" | "secondary" }> = {
      exact: { text: _("ageChecker.statusExact"), variant: "success" },
      approx: { text: _("ageChecker.statusApprox"), variant: "info" },
      older_than: { text: _("ageChecker.statusOlder"), variant: "warning" },
      newer_than: { text: _("ageChecker.statusNewer"), variant: "warning" },
      unknown: { text: _("ageChecker.statusUnknown"), variant: "secondary" },
    };

    const current = statusMap[status] || statusMap.unknown;
    return (
      <Badge variant={current.variant} className="text-xs font-medium">
        {current.text}
      </Badge>
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{_("ageChecker.title")}</h1>
        <p className="text-muted-foreground mt-1">{_("ageChecker.subtitle")}</p>
      </div>

      {/* Estimator Card */}
      <div className="space-y-6">
        <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
          <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            {_("ageChecker.title")}
          </h2>
          <form onSubmit={handleEstimate} className="space-y-4">
            <div>
              <label htmlFor="telegramId" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                {_("ageChecker.inputLabel")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="telegramId"
                  name="telegramId"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder={_("ageChecker.inputPlaceholder")}
                  className="w-full pl-3 pr-10 py-2.5 bg-card border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition shadow-2xs"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={estimating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none shadow-xs"
            >
              {estimating && <RefreshCw className="h-4 w-4 animate-spin" />}
              {estimating ? _("ageChecker.checking") : _("ageChecker.checkButton")}
            </button>
          </form>
        </div>

        {/* Results card */}
        {result && (
          <div className="bg-card text-card-foreground rounded-xl border border-border p-6 animate-fadeIn shadow-xs">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              {_("ageChecker.resultTitle")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border-r border-border pr-4">
                <span className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {_("ageChecker.estRegDate")}
                </span>
                <p className="text-lg font-bold text-foreground mt-1">
                  {formatDateString(result.date)}
                </p>
              </div>
              <div className="pl-0 sm:pl-4">
                <span className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {_("ageChecker.estAge")}
                </span>
                <p className="text-lg font-bold text-foreground mt-1">{result.age}</p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground uppercase font-semibold">
                  {_("ageChecker.statusLabel")}
                </span>
                {getStatusBadge(result.status)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Explanation Section */}
      <div className="bg-slate-900 dark:bg-slate-950 text-slate-300 rounded-xl p-6 border border-slate-800 flex gap-4 shadow-xs">
        <Info className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <h3 className="font-bold text-sm text-white">{_("ageChecker.explanationTitle")}</h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans max-w-xl">
            {_("ageChecker.explanationText")}
          </p>
        </div>
      </div>
    </div>
  );
}
