"use client";

import { useState, useEffect } from "react";
import { useAccounts, getPhotoUrl, useUpdateAutoReply } from "@/hooks/use-accounts";
import api from "@/lib/api";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import {
  MessageCircleReply,
  Shield,
  Smartphone,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Plus,
} from "lucide-react";

export default function AutoReplyPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: accounts, isLoading, error, refetch } = useAccounts();

  // Role check: basic users cannot access auto-reply
  if (user?.role === "basic") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Auto Reply feature is not available for your plan. Upgrade to Pro or Premium to access this feature.</p>
      </div>
    );
  }

  // Global settings
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalText, setGlobalText] = useState("");
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalMsg, setGlobalMsg] = useState("");

  // Per-account state: accountId -> { enabled, text, changed }
  const [accountStates, setAccountStates] = useState<Record<string, { enabled: boolean; text: string; changed: boolean }>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [perAccountMsg, setPerAccountMsg] = useState<Record<string, string>>({});

  const updateMutation = useUpdateAutoReply();

  // Initialize per-account state from fetched accounts
  useEffect(() => {
    if (!accounts) return;
    const initial: Record<string, { enabled: boolean; text: string; changed: boolean }> = {};
    for (const acc of accounts) {
      initial[acc.id] = {
        enabled: acc.auto_reply_enabled ?? false,
        text: acc.auto_reply_text ?? "",
        changed: false,
      };
    }
    setAccountStates(initial);
    // Clear any stale messages when accounts reload
    setPerAccountMsg({});
  }, [accounts]);

  function getAccountState(id: string) {
    return accountStates[id] || { enabled: false, text: "", changed: false };
  }

  function setAccountField(id: string, field: "enabled" | "text", value: boolean | string) {
    setAccountStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value, changed: true },
    }));
    // Clear previous message
    setPerAccountMsg((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleSavePerAccount(accountId: string) {
    const state = getAccountState(accountId);
    setSavingIds((prev) => new Set(prev).add(accountId));
    setPerAccountMsg((prev) => ({ ...prev, [accountId]: "" }));
    try {
      await updateMutation.mutateAsync({
        accountId,
        auto_reply_enabled: state.enabled,
        auto_reply_text: state.text.trim() || null,
      });
      setAccountStates((prev) => ({
        ...prev,
        [accountId]: { ...prev[accountId], changed: false },
      }));
      setPerAccountMsg((prev) => ({ ...prev, [accountId]: "saved" }));
    } catch (err: any) {
      setPerAccountMsg((prev) => ({
        ...prev,
        [accountId]: err?.response?.data?.detail || "Failed",
      }));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
    setTimeout(() => {
      setPerAccountMsg((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    }, 3000);
  }

  async function handleApplyGlobal() {
    if (!accounts || accounts.length === 0) return;
    setGlobalSaving(true);
    setGlobalMsg("");

    let successCount = 0;
    let failCount = 0;

    for (const acc of accounts) {
      try {
        await updateMutation.mutateAsync({
          accountId: acc.id,
          auto_reply_enabled: globalEnabled,
          auto_reply_text: globalText.trim() || null,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    // Refresh account states
    queryClient.invalidateQueries({ queryKey: ["accounts"] });

    setGlobalMsg(
      failCount === 0
        ? _("autoReply.applied", { count: successCount })
        : _("autoReply.updated", { success: successCount, failed: failCount })
    );
    setGlobalSaving(false);
    setTimeout(() => setGlobalMsg(""), 4000);
  }

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-500 mb-4">{_("autoReply.failedToLoad")}</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
        >
          <RefreshCw className="h-4 w-4" />
          {_("autoReply.retry")}
        </button>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────
  if (!accounts || accounts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <MessageCircleReply className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{_("autoReply.noAccounts")}</h1>
        <p className="text-gray-500 mb-6">
          {_("autoReply.noAccountsDesc")}
        </p>
        <Link
          href="/accounts/add"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {_("autoReply.addAccount")}
        </Link>
      </div>
    );
  }

  // ── Data state ─────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("autoReply.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {_("autoReply.desc")}
        </p>
      </div>

      {/* Global Settings Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-50 rounded-lg">
            <MessageCircleReply className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{_("autoReply.globalSettings")}</h2>
            <p className="text-xs text-gray-500">
              {_("autoReply.globalSettingsDesc")}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={globalEnabled}
                onChange={(e) => setGlobalEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
            <span className="text-sm text-gray-700">
              {globalEnabled ? _("autoReply.enableAll") : _("autoReply.disableAll")}
            </span>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{_("autoReply.globalMessage")}</label>
            <textarea
              value={globalText}
              onChange={(e) => setGlobalText(e.target.value)}
              placeholder={_("autoReply.globalMessagePlaceholder")}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleApplyGlobal}
              disabled={globalSaving}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
            >
              {globalSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />
                  {_("autoReply.applying")}
                </>
              ) : (
                _("autoReply.applyToAll")
              )}
            </button>
            {globalMsg && (
              <span
                className={cn(
                  "text-sm",
                  globalMsg.includes("failed") ? "text-red-500" : "text-green-600"
                )}
              >
                {globalMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Per-Account List */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900 text-lg">{_("autoReply.perAccount")}</h2>

        {accounts.map((account) => {
          const state = getAccountState(account.id);
          const isSaving = savingIds.has(account.id);
          const msg = perAccountMsg[account.id];
          const hasChanged = state.changed;

          return (
            <div
              key={account.id}
              className={cn(
                "bg-white rounded-xl border p-5 transition",
                state.enabled
                  ? "border-green-200"
                  : "border-gray-200"
              )}
            >
              {/* Account header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <AccountAvatar
                    accountId={account.id}
                    firstName={account.first_name}
                    phone={account.phone}
                    photoVersion={account.photo_version}
                    size="lg"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {account.first_name || _("accountCard.unnamed")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {account.username ? `@${account.username}` : account.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium",
                      state.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {state.enabled ? _("autoReply.on") : _("autoReply.off")}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(e) => setAccountField(account.id, "enabled", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              </div>

              {/* Reply message input */}
              <div className="ml-[52px] space-y-2">
                <textarea
                  value={state.text}
                  onChange={(e) => setAccountField(account.id, "text", e.target.value)}
                  placeholder={_("autoReply.replyPlaceholder")}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                />

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSavePerAccount(account.id)}
                    disabled={isSaving || !hasChanged}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-lg transition",
                      hasChanged
                        ? "bg-primary-600 text-white hover:bg-primary-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      _("autoReply.save")
                    )}
                  </button>
                  {msg && (
                    <span
                      className={cn(
                        "text-xs",
                        msg === "saved" ? "text-green-600" : "text-red-500"
                      )}
                    >
                      {msg === "saved" ? _("autoReply.saved") : msg}
                    </span>
                  )}
                  {state.enabled && state.text.trim() && !hasChanged && (
                    <span className="text-xs text-gray-400">
                      <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                      {_("autoReply.active")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
