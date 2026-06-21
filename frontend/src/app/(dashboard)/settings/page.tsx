"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { ArrowLeft, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
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
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Auto-hide success after 4 seconds
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail) {
        setError(detail);
      } else if (err?.response?.status === 401) {
        setError(_("settings.sessionExpired"));
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
