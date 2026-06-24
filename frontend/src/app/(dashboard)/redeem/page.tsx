"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useRedeemCode } from "@/hooks/use-subscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Ticket,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Coins,
  Crown,
  Clipboard,
  Star,
  Wallet,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function RedeemPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [code, setCode] = useState("");
  const redeemMutation = useRedeemCode();
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    data?: any;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!code.trim()) return;

    try {
      const res = await redeemMutation.mutateAsync(code.trim());
      setResult({ type: "success", message: res.message, data: res });
      setCode("");
      // Refresh user data to reflect new balance/role
      await fetchMe();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || _("redeem.error");
      setResult({ type: "error", message: detail });
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setCode(text.trim().toUpperCase());
    } catch {
      // clipboard not available
    }
  }

  const userPlan = user?.role || "basic";
  const planMeta: Record<string, { icon: typeof Star; color: string; bg: string }> = {
    basic: { icon: Star, color: "text-slate-500", bg: "bg-slate-100" },
    pro: { icon: Star, color: "text-primary-600", bg: "bg-primary-50" },
    premium: { icon: Crown, color: "text-amber-600", bg: "bg-amber-50" },
    owner: { icon: Crown, color: "text-rose-600", bg: "bg-rose-50" },
  };
  const currentPlanMeta = planMeta[userPlan] || planMeta.basic;
  const PlanIcon = currentPlanMeta.icon;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Hero Header */}
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 p-6 sm:p-8 text-white overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-primary-500/20">
              <Ticket className="h-6 w-6 text-primary-400" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold">{_("redeem.heroTitle")}</h1>
          </div>
          <p className="text-sm text-slate-400 max-w-lg leading-relaxed">
            {_("redeem.heroDesc")}
          </p>
        </div>
      </div>

      {/* Status Row — Balance & Plan side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Balance */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <Wallet className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{_("redeem.yourBalance")}</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {(user?.balance ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plan */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", currentPlanMeta.bg)}>
                <PlanIcon className={cn("h-5 w-5", currentPlanMeta.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{_("redeem.yourPlan")}</p>
                <p className="text-lg font-semibold text-foreground capitalize">
                  {userPlan}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Redeem Form */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {_("redeem.codeLabel")}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={_("redeem.codePlaceholder")}
                    className="w-full border border-input rounded-lg px-4 py-3 text-base font-mono tracking-widest focus:outline-none focus:ring-3 focus:ring-ring/50 focus:border-primary uppercase bg-background text-foreground placeholder:text-muted-foreground"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    disabled={redeemMutation.isPending}
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 px-3.5 border border-input rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                  title={_("redeem.pasteCode")}
                >
                  <Clipboard className="h-4 w-4" />
                  <span className="hidden sm:inline">{_("redeem.pasteCode")}</span>
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={redeemMutation.isPending || !code.trim()}
              className="w-full h-11 text-sm font-medium"
              size="lg"
            >
              {redeemMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {_("redeem.redeeming")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {_("redeem.redeem")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result Feedback */}
      {result && (
        <div
          className={cn(
            "rounded-xl border p-5",
            result.type === "success"
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-200"
          )}
        >
          <div className="flex items-start gap-3">
            {result.type === "success" ? (
              <div className="p-1.5 rounded-full bg-emerald-100">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
            ) : (
              <div className="p-1.5 rounded-full bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <p className={cn(
                "text-sm font-semibold",
                result.type === "success" ? "text-emerald-800" : "text-red-800"
              )}>
                {result.message}
              </p>
              {result.type === "success" && result.data?.balance_added && (
                <p className="text-sm text-emerald-700">
                  +{result.data.balance_added.toLocaleString()} {_("redeem.creditsAdded")}
                </p>
              )}
              {result.type === "success" && result.data?.plan && (
                <p className="text-sm text-emerald-700">
                  {_("redeem.planUpgraded")} <span className="font-semibold capitalize">{result.data.plan}</span>
                </p>
              )}
              {result.type === "success" && result.data?.expires_at && (
                <p className="text-sm text-emerald-700">
                  {_("redeem.validUntil")} {new Date(result.data.expires_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* How it Works */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 shrink-0">
                <Coins className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground mb-0.5">{_("adminRedeem.typeBalance")}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {_("redeem.balanceCodeDesc")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary-50 shrink-0">
                <Crown className="h-4 w-4 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground mb-0.5">{_("adminRedeem.typeSubscription")}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {_("redeem.subscriptionCodeDesc")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Link to Subscription page */}
      <div className="text-center pt-1 pb-2">
        <Link
          href="/subscriptions"
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          <Crown className="h-4 w-4" />
          {_("redeem.viewSubscription")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
