"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useRedeemCode } from "@/hooks/use-subscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ticket, CheckCircle, AlertCircle, Loader2, ArrowRight, Gift, Coins, Crown } from "lucide-react";
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("redeem.title")}</h1>
        <p className="text-gray-500 mt-1">{_("redeem.desc")}</p>
      </div>

      {/* Current Balance & Plan */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Balance</p>
                <p className="text-lg font-bold text-gray-900">
                  {user?.balance?.toLocaleString() ?? 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Plan</p>
                <p className="text-lg font-bold text-gray-900 capitalize">
                  {user?.role ?? "basic"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Redeem Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary-600" />
            {_("redeem.codeLabel")}
          </CardTitle>
          <CardDescription>{_("redeem.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={_("redeem.codePlaceholder")}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 uppercase"
                autoFocus
                disabled={redeemMutation.isPending}
              />
            </div>

            <Button
              type="submit"
              disabled={redeemMutation.isPending || !code.trim()}
              className="w-full"
            >
              {redeemMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              {redeemMutation.isPending ? _("redeem.redeeming") : _("redeem.redeem")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <div
          className={cn(
            "flex items-start gap-3 p-4 rounded-xl border",
            result.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          )}
        >
          {result.type === "success" ? (
            <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">{result.message}</p>
            {result.type === "success" && result.data?.balance_added && (
              <p className="text-sm opacity-75">
                +{result.data.balance_added} credits added to your balance.
              </p>
            )}
            {result.type === "success" && result.data?.plan && (
              <p className="text-sm opacity-75">
                Plan upgraded to {result.data.plan}.
              </p>
            )}
            {result.type === "success" && result.data?.expires_at && (
              <p className="text-sm opacity-75">
                Valid until {new Date(result.data.expires_at).toLocaleString()}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Link to Subscription page */}
      <div className="text-center">
        <Link
          href="/subscriptions"
          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <Crown className="h-4 w-4" />
          View subscription details
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
