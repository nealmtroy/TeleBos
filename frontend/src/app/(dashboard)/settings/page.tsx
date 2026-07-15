"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { ArrowLeft, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Loader2, Copy, ShieldCheck, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { useEffect } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const _ = useT();
  const router = useRouter();

  // Form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  type ApiKey = {
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  };
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(["profile:read"]);
  const [apiKeyCreating, setApiKeyCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api-keys")
      .then((response) => setApiKeys(response.data))
      .catch(() => toast.error(_("settings.failedLoadApiKeys")))
      .finally(() => setApiKeysLoading(false));
  }, [_]);

  const toggleApiScope = (scope: string) => {
    setApiKeyScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]
    );
  };

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyName.trim() || apiKeyScopes.length === 0) return;
    setApiKeyCreating(true);
    try {
      const response = await api.post("/api-keys", {
        name: apiKeyName.trim(),
        scopes: apiKeyScopes,
      });
      setApiKeys((current) => [response.data, ...current]);
      setNewSecret(response.data.secret);
      setApiKeyName("");
      toast.success(_("settings.apiKeyCreated"));
    } catch {
      toast.error(_("settings.failedCreateApiKey"));
    } finally {
      setApiKeyCreating(false);
    }
  }

  async function handleRevokeApiKey(id: string) {
    if (!window.confirm(_("settings.revokeConfirm"))) return;
    try {
      await api.delete(`/api-keys/${id}`);
      setApiKeys((current) => current.map((key) => key.id === id
        ? { ...key, revoked_at: new Date().toISOString() }
        : key
      ));
      toast.success(_("settings.revoked"));
    } catch {
      toast.error(_("settings.failedRevokeApiKey"));
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
    toast.success(_("settings.copied"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(_("settings.passwordsNoMatch"));
      return;
    }
    if (newPassword.length < 6) {
      setError(_("settings.passwordMinLength"));
      return;
    }
    if (currentPassword === newPassword) {
      setError(_("settings.passwordMustDiffer"));
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (err) throw new Error(err.message || _("settings.failedChangePassword"));
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Auto-hide success after 4 seconds
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      if (err?.message) {
        setError(err.message);
      } else {
        setError(_("settings.failedChangePassword"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 mb-4 group"
        >
          <div className="p-1 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors duration-200">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span>{_("settings.back")}</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
            <KeyRound className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{_("settings.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {_("settings.desc")}
            </p>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {_("settings.changePassword")}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {_("settings.changePasswordDesc")}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Success message */}
          {success && (
            <div
              className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200"
              style={{
                animation:
                  "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-800">
                {_("settings.passwordChanged")}
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200"
              style={{
                animation:
                  "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
          )}

          {/* Current Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              {_("settings.currentPassword")}
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setError(null);
                }}
                placeholder={_("settings.currentPasswordPlaceholder")}
                className="w-full px-4 py-2.5 pr-11 rounded-xl border border-gray-300 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-150"
              >
                {showCurrent ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              {_("settings.newPassword")}
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                }}
                placeholder={_("settings.newPasswordPlaceholder")}
                className="w-full px-4 py-2.5 pr-11 rounded-xl border border-gray-300 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-150"
              >
                {showNew ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {/* Password strength indicator */}
            {newPassword && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((level) => {
                    const strength = getPasswordStrength(newPassword);
                    return (
                      <div
                        key={level}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-all duration-300",
                          level <= strength
                            ? strength <= 2
                              ? "bg-rose-500"
                              : strength === 3
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                            : "bg-gray-200"
                        )}
                      />
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500">
                  {_(getPasswordLabel(newPassword))}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              {_("settings.confirmPassword")}
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                placeholder={_("settings.confirmPasswordPlaceholder")}
                className={cn(
                  "w-full px-4 py-2.5 pr-11 rounded-xl border bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-200",
                  confirmPassword && newPassword !== confirmPassword
                    ? "border-rose-300 focus:ring-rose-500/20 focus:border-rose-500"
                    : confirmPassword && newPassword === confirmPassword
                    ? "border-emerald-300 focus:ring-emerald-500/20 focus:border-emerald-500"
                    : "border-gray-300 focus:ring-primary-500/20 focus:border-primary-500"
                )}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-150"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {/* Match indicator */}
            {confirmPassword && (
              <p
                className={cn(
                  "text-xs mt-1 transition-all duration-200",
                  newPassword === confirmPassword
                    ? "text-emerald-600"
                    : "text-rose-500"
                )}
              >
                {newPassword === confirmPassword
                  ? _("settings.passwordsMatch")
                  : _("settings.passwordsNoMatch")}
              </p>
            )}
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={
                loading || !currentPassword || !newPassword || !confirmPassword
              }
              className={cn(
                "w-full px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200 shadow-sm",
                loading ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 active:scale-[0.98] hover:shadow-md"
              )}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {_("settings.changingPassword")}
                </span>
              ) : (
                _("settings.changePasswordBtn")
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Integration API Keys */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{_("settings.apiKeys")}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500">{_("settings.apiKeysDesc")}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleCreateApiKey} className="space-y-5 border-b border-gray-100 p-6">
          <div>
            <label htmlFor="api-key-name" className="text-sm font-medium text-gray-700">{_("settings.apiKeyName")}</label>
            <input
              id="api-key-name"
              value={apiKeyName}
              onChange={(event) => setApiKeyName(event.target.value)}
              placeholder={_("settings.apiKeyNamePlaceholder")}
              maxLength={100}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">{_("settings.apiKeyScopes")}</legend>
            <p className="mt-1 text-xs text-slate-600">{_("settings.apiKeyScopesDesc")}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["profile:read", _("settings.profileRead")],
                ["accounts:read", _("settings.accountsRead")],
                ["jobs:read", _("settings.jobsRead")],
              ].map(([scope, label]) => (
                <label key={scope} className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                  apiKeyScopes.includes(scope) ? "border-primary-200 bg-primary-50/60" : "border-gray-200 hover:bg-gray-50"
                )}>
                  <input type="checkbox" checked={apiKeyScopes.includes(scope)} onChange={() => toggleApiScope(scope)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-gray-700"><code className="font-mono text-xs">{scope}</code><span className="mt-1 block text-xs text-gray-500">{label}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={apiKeyCreating || !apiKeyName.trim() || apiKeyScopes.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300">
            {apiKeyCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {apiKeyCreating ? _("settings.generatingKey") : _("settings.generateKey")}
          </button>
        </form>

        {newSecret && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-amber-950">{_("settings.apiKeyCreated")}</h3>
                <p className="mt-1 text-sm text-amber-900">{_("settings.secretWarning")}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-gray-800">{newSecret}</code>
                  <button type="button" onClick={copySecret} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"><Copy className="h-4 w-4" />{_("settings.copySecret")}</button>
                </div>
                <button type="button" onClick={() => setNewSecret(null)} className="mt-3 text-xs font-medium text-amber-800 underline underline-offset-2">{_("common.close")}</button>
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900">{_("settings.apiKeys")}</h3>
          {apiKeysLoading ? (
            <div className="mt-4 space-y-2"><div className="h-12 animate-pulse rounded-xl bg-gray-100" /><div className="h-12 animate-pulse rounded-xl bg-gray-100" /></div>
          ) : apiKeys.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">{_("settings.noApiKeys")}</p>
          ) : (
            <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-gray-900">{key.name}</p><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", key.revoked_at ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{key.revoked_at ? _("settings.revoked") : "Active"}</span></div>
                    <p className="mt-1 font-mono text-xs text-gray-500">{key.key_prefix}••••••••</p>
                    <p className="mt-1 text-xs text-gray-400">{key.scopes.join(" · ")}</p>
                  </div>
                  {!key.revoked_at && <button type="button" onClick={() => handleRevokeApiKey(key.id)} className="inline-flex h-9 items-center gap-2 self-start rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 sm:self-auto"><Trash2 className="h-4 w-4" />{_("settings.revoke")}</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Animations */}
      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ── Password strength helpers ──────────────────────────────────────

function getPasswordStrength(password: string): number {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function getPasswordLabel(password: string): string {
  const s = getPasswordStrength(password);
  if (s <= 1) return "settings.passwordWeak";
  if (s === 2) return "settings.passwordFair";
  if (s === 3) return "settings.passwordGood";
  return "settings.passwordStrong";
}
