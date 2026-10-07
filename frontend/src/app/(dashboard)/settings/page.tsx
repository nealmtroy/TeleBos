"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT, useI18nStore } from "@/lib/i18n";
import {
  KeyRound,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  Download,
  Smartphone,
  Info,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Sparkles,
  UserCheck,
  Sun,
  Moon,
  Monitor,
  Globe,
  Laptop,
  CreditCard,
  Building2,
  Wallet,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import QRCode from "react-qr-code";
import { useAuthStore } from "@/store/auth-store";
import { useThemeStore } from "@/store/theme-store";
import { useBankAccountStore } from "@/store/bank-account-store";
import { CountryFlag } from "@/components/layout/trade-surface";
import {
  SECTION_TO_TAB,
  SettingsNav,
  type SettingsSectionKey,
} from "@/components/settings/settings-nav";
import { ProfileCard } from "@/components/settings/profile-card";
import {
  ApiKeysCard,
  AppearanceCard,
  BankAccountsCard,
  ChangePasswordCard,
  LanguageCard,
  TwoFactorCard,
} from "@/components/settings/settings-summary-cards";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabKey = SettingsSectionKey;

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  last_used_at?: string | null;
};

export default function SettingsPage() {
  const _ = useT();
  const router = useRouter();

  // Navigation tab. The desktop layout renders *all* summary cards at once and
  // opens the detailed editor for one section at a time, so `activeTab` here is
  // only "which editor is open". The secondary nav on the left just toggles it.
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const { preference, setPreference, locale } = useI18nStore();

  /** Opens a section editor inline and navigates to detail on mobile. */
  function openSection(key: SettingsSectionKey) {
    setActiveTab(key);
    setMobileDetailOpen(true);
    const tab = SECTION_TO_TAB[key];
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (tab) {
        params.set("tab", tab);
      } else {
        params.delete("tab");
      }
      const qs = params.toString();
      router.replace(qs ? `/settings?${qs}` : "/settings");
    }
  }

  // Listen to tab query parameter (e.g. /settings?tab=appearance).
  const lastSeenTabParam = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === lastSeenTabParam.current) return;
    lastSeenTabParam.current = tabParam;
    if (
      tabParam === "appearance" ||
      tabParam === "language" ||
      tabParam === "security" ||
      tabParam === "2fa" ||
      tabParam === "api-keys" ||
      tabParam === "bank-accounts"
    ) {
      setActiveTab(tabParam as TabKey);
      setMobileDetailOpen(true);
    }
  }, []);

  // Auth & Session
  const { data: session, isPending: authLoading } = authClient.useSession();
  const user = useAuthStore((s) => s.user);
  const twoFactorEnabled = Boolean(session?.user?.twoFactorEnabled);

  // ── Password State ────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── 2FA State ─────────────────────────────────────────────────────────────
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [showTwoFaPassword, setShowTwoFaPassword] = useState(false);
  const [twoFaStep, setTwoFaStep] = useState<"inactive" | "password_prompt" | "verify" | "backup_codes">("inactive");
  const [totpURI, setTotpURI] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"disable" | "regenerate" | null>(null);

  // ── API Keys State ────────────────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(["profile:read"]);
  const [apiKeyCreating, setApiKeyCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // ── Bank Accounts Store & State ───────────────────────────────────────────
  const {
    accounts,
    addAccount,
    deleteAccount,
    setDefaultAccount,
    hydrate: hydrateBankAccounts,
  } = useBankAccountStore();

  useEffect(() => {
    hydrateBankAccounts();
  }, [hydrateBankAccounts]);

  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccountType, setNewAccountType] = useState<"bank" | "ewallet">("bank");
  const [newAccountProvider, setNewAccountProvider] = useState("BCA");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [newAccountHolder, setNewAccountHolder] = useState("");
  const [newAccountDefault, setNewAccountDefault] = useState(false);

  function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountNumber.trim() || !newAccountHolder.trim()) {
      toast.error("Mohon lengkapi nomor rekening dan nama pemilik");
      return;
    }

    addAccount({
      type: newAccountType,
      provider: newAccountProvider,
      accountNumber: newAccountNumber.trim(),
      accountHolder: newAccountHolder.trim(),
      isDefault: newAccountDefault,
    });

    toast.success(_("settings.accountAdded"));
    setIsAddingAccount(false);
    setNewAccountNumber("");
    setNewAccountHolder("");
    setNewAccountDefault(false);
  }

  // Load API keys
  useEffect(() => {
    api.get("/api-keys")
      .then((response) => setApiKeys(Array.isArray(response.data) ? response.data : []))
      .catch(() => toast.error(_("settings.failedLoadApiKeys")))
      .finally(() => setApiKeysLoading(false));
  }, []);

  // ── Password Handlers ─────────────────────────────────────────────────────
  const passwordCriteria = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      hasUpperLower: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
      hasNumber: /\d/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: "" };
    let score = 0;
    if (passwordCriteria.minLength) score++;
    if (passwordCriteria.hasUpperLower) score++;
    if (passwordCriteria.hasNumber) score++;
    if (passwordCriteria.hasSpecial) score++;

    if (score <= 1) return { score: 1, label: _("settings.passwordWeak"), color: "bg-rose-500", text: "text-rose-600" };
    if (score === 2) return { score: 2, label: _("settings.passwordFair"), color: "bg-amber-500", text: "text-amber-600" };
    if (score === 3) return { score: 3, label: _("settings.passwordGood"), color: "bg-blue-500", text: "text-blue-600" };
    return { score: 4, label: _("settings.passwordStrong"), color: "bg-emerald-500", text: "text-emerald-600" };
  }, [newPassword, passwordCriteria, _]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError(_("settings.passwordsNoMatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(_("settings.passwordMinLength"));
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError(_("settings.passwordMustDiffer"));
      return;
    }

    setPasswordLoading(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (err) throw new Error(err.message || _("settings.failedChangePassword"));
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(_("settings.passwordChanged"));
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (err: any) {
      setPasswordError(err?.message || _("settings.failedChangePassword"));
    } finally {
      setPasswordLoading(false);
    }
  }

  // ── 2FA Handlers ──────────────────────────────────────────────────────────
  const handleEnable2FAStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaPassword) {
      setTwoFaError(_("settings.passwordRequired"));
      return;
    }
    setTwoFaError(null);
    setTwoFaLoading(true);

    try {
      const { data, error } = await authClient.twoFactor.enable({
        password: twoFaPassword,
      });

      if (error) {
        throw new Error(error.message || "Failed to enable 2FA setup");
      }

      if (data) {
        setTotpURI(data.totpURI);
        setBackupCodes(data.backupCodes);
        setTwoFaStep("verify");
        setTwoFaPassword("");
      }
    } catch (err: any) {
      setTwoFaError(err.message || "An error occurred during 2FA setup");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleVerify2FACode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length < 6) return;
    setTwoFaError(null);
    setTwoFaLoading(true);

    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: totpCode.trim(),
        trustDevice: true,
      });

      if (error) {
        throw new Error(error.message || _("settings.totpInvalid"));
      }

      setTwoFaStep("backup_codes");
      toast.success(_("settings.totpSuccess"));
    } catch (err: any) {
      setTwoFaError(err.message || _("settings.totpInvalid"));
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaPassword) {
      setTwoFaError(_("settings.passwordRequired"));
      return;
    }
    setTwoFaError(null);
    setTwoFaLoading(true);

    try {
      const { error } = await authClient.twoFactor.disable({
        password: twoFaPassword,
      });

      if (error) {
        throw new Error(error.message || "Failed to disable 2FA");
      }

      setTwoFaPassword("");
      setConfirmAction(null);
      await useAuthStore.getState().fetchMe();
      toast.success(_("settings.disableSuccess"));
    } catch (err: any) {
      setTwoFaError(err.message || "Kata sandi salah. Silakan coba lagi.");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaPassword) {
      setTwoFaError(_("settings.passwordRequired"));
      return;
    }
    setTwoFaError(null);
    setTwoFaLoading(true);

    try {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password: twoFaPassword,
      });

      if (error) {
        throw new Error(error.message || "Failed to regenerate backup codes");
      }

      if (data) {
        setBackupCodes(data.backupCodes);
        setTwoFaStep("backup_codes");
        setTwoFaPassword("");
        setConfirmAction(null);
        toast.success(_("settings.apiKeyCreatedDesc") || "Kode cadangan baru telah dibuat.");
      }
    } catch (err: any) {
      setTwoFaError(err.message || "Kata sandi salah. Silakan coba lagi.");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleDoneEnabled = async () => {
    await useAuthStore.getState().fetchMe();
    setTwoFaStep("inactive");
    setTotpURI("");
    setBackupCodes([]);
    setTotpCode("");
    setTwoFaPassword("");
    setTwoFaError(null);
  };

  const copyBackupCodesToClipboard = async () => {
    if (backupCodes.length === 0) return;
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedBackupCodes(true);
    toast.success(_("settings.backupCodesCopied") || _("settings.copied"));
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  const downloadBackupCodes = () => {
    if (backupCodes.length === 0) return;
    const content = `TeleBos - Two-Factor Authentication Backup Codes\nGenerated: ${new Date().toISOString()}\n\nImportant: Keep these codes secret and store them in a secure place.\nEach code can only be used once.\n\n${backupCodes.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n`;
    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `telebos-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success(_("settings.copied") || "File kode cadangan diunduh");
  };

  // ── API Key Handlers ──────────────────────────────────────────────────────
  const toggleApiScope = (scope: string) => {
    setApiKeyScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
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
      setIsCreatingKey(false);
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
      setApiKeys((current) =>
        current.map((key) => (key.id === id ? { ...key, revoked_at: new Date().toISOString() } : key))
      );
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

  // Whether detail view is active on mobile screens
  const isMobileDetailActive = mobileDetailOpen || activeTab !== "profile";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {_("settings.profileAndSettings")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {_("settings.profileAndSettingsDesc")}
        </p>
      </div>

      {/* ── Two-pane layout ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left pane: navigation. Hidden on mobile when a detail section is open */}
        <div className={cn(
          "lg:sticky lg:top-6",
          isMobileDetailActive ? "hidden lg:block" : "block"
        )}>
          <SettingsNav active={activeTab} onSelect={openSection} />
        </div>

        {/* Right pane: section content. On mobile, only shown when a section is selected */}
        <div className={cn(
          isMobileDetailActive ? "block" : "hidden lg:block"
        )}>
          {/* Mobile back button — only visible on mobile when a detail section is open */}
          {isMobileDetailActive && (
            <button
              type="button"
              onClick={() => {
                setMobileDetailOpen(false);
                setActiveTab("profile");
                if (typeof window !== "undefined") {
                  const params = new URLSearchParams(window.location.search);
                  params.delete("tab");
                  const qs = params.toString();
                  router.replace(qs ? `/settings?${qs}` : "/settings");
                }
              }}
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/60 lg:hidden cursor-pointer"
              aria-label="Kembali ke daftar pengaturan"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              <span>{_("settings.profileAndSettings")}</span>
            </button>
          )}

          {/* Default view: summary cards (profile landing) */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              <ProfileCard />
              <ChangePasswordCard onOpen={() => openSection("security")} />
              <TwoFactorCard
                onOpen={() => openSection("2fa")}
                enabled={twoFactorEnabled}
                loading={authLoading}
              />
              <ApiKeysCard
                onOpen={() => openSection("api-keys")}
                keys={apiKeys}
                loading={apiKeysLoading}
              />
              <BankAccountsCard
                onOpen={() => openSection("bank-accounts")}
                count={accounts.length}
                loading={false}
              />
              <AppearanceCard onOpen={() => openSection("appearance")} />
              <LanguageCard onOpen={() => openSection("language")} />
            </div>
          )}

          {/* ── SECTION: PASSWORD & SECURITY ──────────────────────────────────── */}
          {activeTab === "security" && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Main Card: Change Password Form */}
              <div className="xl:col-span-2 bg-card rounded-xl border border-border/70 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-border/60 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {_("settings.changePassword")}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {_("settings.changePasswordDesc")}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="p-6 space-y-5">
                  {/* Alert Feedback */}
                  {passwordSuccess && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <p className="font-medium">{_("settings.passwordChanged")}</p>
                    </div>
                  )}

                  {passwordError && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <p className="font-medium">{passwordError}</p>
                    </div>
                  )}

                  {/* Current Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="current-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {_("settings.currentPassword")}
                    </label>
                    <div className="relative">
                      <input
                        id="current-password"
                        type={showCurrent ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => {
                          setCurrentPassword(e.target.value);
                          setPasswordError(null);
                        }}
                        placeholder={_("settings.currentPasswordPlaceholder")}
                        className="w-full h-10 px-3.5 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                        tabIndex={-1}
                      >
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {_("settings.newPassword")}
                    </label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setPasswordError(null);
                        }}
                        placeholder={_("settings.newPasswordPlaceholder")}
                        className="w-full h-10 px-3.5 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                        required
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                        tabIndex={-1}
                      >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password Strength Meter */}
                    {newPassword && (
                      <div className="pt-2 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Tingkat Keamanan:</span>
                          <span className={cn("font-medium", passwordStrength.text)}>
                            {passwordStrength.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[1, 2, 3, 4].map((step) => (
                            <div
                              key={step}
                              className={cn(
                                "h-1.5 rounded-full transition-all duration-300",
                                step <= passwordStrength.score ? passwordStrength.color : "bg-muted"
                              )}
                            />
                          ))}
                        </div>

                        {/* Criteria list */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-3.5 w-3.5 rounded-full flex items-center justify-center text-[11px]", passwordCriteria.minLength ? "text-emerald-600" : "text-muted-foreground/40")}>
                              {passwordCriteria.minLength ? "✓" : "○"}
                            </span>
                            <span>Minimal 8 karakter</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-3.5 w-3.5 rounded-full flex items-center justify-center text-[11px]", passwordCriteria.hasUpperLower ? "text-emerald-600" : "text-muted-foreground/40")}>
                              {passwordCriteria.hasUpperLower ? "✓" : "○"}
                            </span>
                            <span>Huruf besar & kecil</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-3.5 w-3.5 rounded-full flex items-center justify-center text-[11px]", passwordCriteria.hasNumber ? "text-emerald-600" : "text-muted-foreground/40")}>
                              {passwordCriteria.hasNumber ? "✓" : "○"}
                            </span>
                            <span>Mengandung angka (0-9)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-3.5 w-3.5 rounded-full flex items-center justify-center text-[11px]", passwordCriteria.hasSpecial ? "text-emerald-600" : "text-muted-foreground/40")}>
                              {passwordCriteria.hasSpecial ? "✓" : "○"}
                            </span>
                            <span>Simbol khusus (!@#$)</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {_("settings.confirmPassword")}
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setPasswordError(null);
                        }}
                        placeholder={_("settings.confirmPasswordPlaceholder")}
                        className={cn(
                          "w-full h-10 px-3.5 pr-10 rounded-lg border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition",
                          confirmPassword && newPassword !== confirmPassword
                            ? "border-rose-300 focus:ring-rose-500/20 focus:border-rose-500"
                            : confirmPassword && newPassword === confirmPassword
                            ? "border-emerald-300 focus:ring-emerald-500/20 focus:border-emerald-500"
                            : "border-border focus:ring-primary/20 focus:border-primary"
                        )}
                        required
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {confirmPassword && (
                      <p
                        className={cn(
                          "text-xs font-medium pt-0.5",
                          newPassword === confirmPassword ? "text-emerald-600" : "text-rose-500"
                        )}
                      >
                        {newPassword === confirmPassword
                          ? _("settings.passwordsMatch")
                          : _("settings.passwordsNoMatch")}
                      </p>
                    )}
                  </div>

                  {/* Form Action */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                      className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-primary-600 hover:bg-primary-700 active:scale-[0.99] text-white text-sm font-medium transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {passwordLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{_("settings.changingPassword")}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          <span>{_("settings.changePasswordBtn")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Security Recommendations */}
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-xl border border-border/70 p-5 space-y-4">
                  <div className="flex items-center gap-2.5 text-foreground font-semibold text-sm">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Rekomendasi Keamanan</span>
                  </div>
                  <ul className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Gunakan kata sandi unik yang tidak digunakan di layanan lain.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Aktifkan Autentikasi Dua Faktor (2FA) untuk mencegah akses tidak sah.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Simpan API Key di environment server yang aman, jangan pernah di-commit ke Git.</span>
                    </li>
                  </ul>
                  <div className="pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setActiveTab("2fa")}
                      className="w-full inline-flex items-center justify-between text-xs font-semibold text-primary hover:text-primary/80 py-1"
                    >
                      <span>Lihat Status 2FA Akun</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border/70 p-5 space-y-2">
                  <div className="text-xs font-semibold text-foreground">Perlu Bantuan?</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Jika Anda lupa kata sandi akun atau mendeteksi aktivitas mencurigakan, hubungi administrator sistem atau gunakan fitur reset password.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION: TWO-FACTOR AUTHENTICATION (2FA) ─────────────────────── */}
          {activeTab === "2fa" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Error notice */}
              {twoFaError && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
                  <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <p className="font-medium">{twoFaError}</p>
                </div>
              )}

              {/* 1. SETUP WIZARD: Step 1 (Password Prompt) */}
              {twoFaStep === "password_prompt" && (
                <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {_("settings.enterPasswordConfirm")}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {_("settings.enterPasswordConfirmDesc")}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleEnable2FAStart} className="space-y-4 max-w-md">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kata Sandi Akun
                      </label>
                      <div className="relative">
                        <input
                          type={showTwoFaPassword ? "text" : "password"}
                          value={twoFaPassword}
                          onChange={(e) => {
                            setTwoFaPassword(e.target.value);
                            setTwoFaError(null);
                          }}
                          placeholder={_("settings.currentPasswordPlaceholder")}
                          className="w-full h-10 px-3.5 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowTwoFaPassword(!showTwoFaPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                          tabIndex={-1}
                        >
                          {showTwoFaPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFaStep("inactive");
                          setTwoFaPassword("");
                          setTwoFaError(null);
                        }}
                        className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/60 transition"
                      >
                        {_("navbar.cancel") || "Batal"}
                      </button>
                      <button
                        type="submit"
                        disabled={twoFaLoading || !twoFaPassword}
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        {twoFaLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Memverifikasi...</span>
                          </>
                        ) : (
                          <>
                            <span>Lanjutkan ke QR Code</span>
                            <ChevronRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* 2. SETUP WIZARD: Step 2 (Scan QR Code & Enter 6 Digits) */}
              {twoFaStep === "verify" && (
                <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {_("settings.setup2FATitle")}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {_("settings.setup2FADesc")}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    {/* QR Code container */}
                    <div className="flex flex-col items-center justify-center p-6 bg-muted/50 border border-border/70 rounded-xl text-center space-y-4">
                      {totpURI && (
                        <div data-keep-white="true" className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
                          <QRCode value={totpURI} size={180} />
                        </div>
                      )}

                      {(() => {
                        try {
                          const parsed = new URL(totpURI);
                          const secret = parsed.searchParams.get("secret");
                          if (!secret) return null;
                          return (
                            <div className="w-full max-w-xs space-y-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                                Kode Secret Manual
                              </span>
                              <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg p-1.5">
                                <code className="text-xs font-mono text-foreground tracking-wider truncate flex-1 text-center select-all">
                                  {secret}
                                </code>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(secret);
                                    setCopiedSecret(true);
                                    toast.success(_("settings.copied"));
                                    setTimeout(() => setCopiedSecret(false), 2000);
                                  }}
                                  className="p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground transition"
                                  title="Salin secret"
                                >
                                  {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </div>

                    {/* Form to enter 6-digit verification code */}
                    <form onSubmit={handleVerify2FACode} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-foreground">
                          {_("settings.enterCode")}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Buka aplikasi Google Authenticator atau Bitwarden Anda, lalu masukkan 6-digit kode verifikasi yang muncul.
                        </p>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={totpCode}
                          onChange={(e) => {
                            setTotpCode(e.target.value.replace(/\D/g, ""));
                            setTwoFaError(null);
                          }}
                          placeholder="000000"
                          className="w-full h-12 text-center text-2xl font-mono tracking-[0.5em] rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                          required
                          autoFocus
                        />
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTwoFaStep("inactive");
                            setTwoFaPassword("");
                            setTwoFaError(null);
                          }}
                          className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/60 transition"
                        >
                          {_("navbar.cancel") || "Batal"}
                        </button>
                        <button
                          type="submit"
                          disabled={twoFaLoading || totpCode.length < 6}
                          className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {twoFaLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>{_("settings.generatingKey")}</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4" />
                              <span>{_("settings.verifyAndEnable")}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* 3. SETUP WIZARD: Step 3 (Backup Codes Vault) */}
              {twoFaStep === "backup_codes" && (
                <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      ✓
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {_("settings.backupCodesTitle")}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {_("settings.backupCodesDesc")}
                      </p>
                    </div>
                  </div>

                  {/* Codes Grid */}
                  <div className="p-5 bg-slate-900 rounded-xl text-white space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                      <span>Daftar Kode Pemulihan (Single Use)</span>
                      <span>{backupCodes.length} Kode Tersedia</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-2.5">
                      {backupCodes.map((code, idx) => (
                        <div
                          key={idx}
                          className="font-mono text-sm tracking-widest bg-slate-800/80 border border-slate-700/80 px-3 py-2 rounded-lg text-emerald-400 font-semibold text-center select-all"
                        >
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={copyBackupCodesToClipboard}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-accent/60 transition"
                      >
                        {copiedBackupCodes ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        <span>{copiedBackupCodes ? _("settings.copied") : _("settings.saveBackupCodes")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={downloadBackupCodes}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-accent/60 transition"
                      >
                        <Download className="h-4 w-4" />
                        <span>Unduh (.TXT)</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleDoneEnabled}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition shadow-xs"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{_("settings.done")}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 4. CONFIRM MODAL/FORM (Disable 2FA or Regenerate Codes) */}
              {confirmAction && (
                <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      confirmAction === "disable" ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" : "bg-primary/10 text-primary"
                    )}>
                      {confirmAction === "disable" ? <ShieldAlert className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {confirmAction === "disable" ? _("settings.disable2FA") : _("settings.regenerateBackupCodes")}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {confirmAction === "disable"
                          ? "Menonaktifkan 2FA akan mengurangi keamanan akun Anda. Masukkan kata sandi untuk konfirmasi."
                          : _("settings.regenerateBackupCodesConfirm")}
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={confirmAction === "disable" ? handleDisable2FA : handleRegenerateBackupCodes}
                    className="space-y-4 max-w-md"
                  >
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kata Sandi Akun
                      </label>
                      <div className="relative">
                        <input
                          type={showTwoFaPassword ? "text" : "password"}
                          value={twoFaPassword}
                          onChange={(e) => {
                            setTwoFaPassword(e.target.value);
                            setTwoFaError(null);
                          }}
                          placeholder={_("settings.currentPasswordPlaceholder")}
                          className="w-full h-10 px-3.5 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowTwoFaPassword(!showTwoFaPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                          tabIndex={-1}
                        >
                          {showTwoFaPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAction(null);
                          setTwoFaPassword("");
                          setTwoFaError(null);
                        }}
                        className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/60 transition"
                      >
                        {_("navbar.cancel") || "Batal"}
                      </button>
                      <button
                        type="submit"
                        disabled={twoFaLoading || !twoFaPassword}
                        className={cn(
                          "inline-flex items-center gap-2 h-10 px-5 rounded-lg text-white text-sm font-medium transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400",
                          confirmAction === "disable" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary-600 hover:bg-primary-700"
                        )}
                      >
                        {twoFaLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Memproses...</span>
                          </>
                        ) : confirmAction === "disable" ? (
                          <span>Nonaktifkan Sekarang</span>
                        ) : (
                          <span>Regenerate Kode</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* 5. DEFAULT VIEW: Inactive step, not confirming action */}
              {twoFaStep === "inactive" && !confirmAction && (
                <div className="space-y-6">
                  {twoFactorEnabled ? (
                    /* ── 2FA ENABLED STATE DASHBOARD ── */
                    <div className="bg-card rounded-xl border border-border/70 shadow-xs overflow-hidden">
                      <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-border/60">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <ShieldCheck className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-bold text-foreground">
                                {_("settings.twoFactorTitle")}
                              </h2>
                              <Badge variant="success" className="gap-1 font-semibold">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {_("settings.active")}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                              {_("settings.twoFactorEnabledStatus")} Akun Anda kini dilindungi lapisan keamanan kedua saat masuk dari perangkat atau browser baru.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => setConfirmAction("regenerate")}
                            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-accent/60 transition"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>{_("settings.regenerateBackupCodes")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAction("disable")}
                            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-rose-200 dark:border-rose-800 bg-card text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{_("settings.disable2FA")}</span>
                          </button>
                        </div>
                      </div>

                      {/* 2FA Features Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60 bg-muted/30">
                        <div className="p-5 flex items-start gap-3">
                          <Smartphone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-foreground">Aplikasi Autentikator</div>
                            <p className="text-xs text-muted-foreground mt-0.5">Google Authenticator, Microsoft Authenticator, atau 1Password.</p>
                          </div>
                        </div>
                        <div className="p-5 flex items-start gap-3">
                          <KeyRound className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-foreground">Kode Pemulihan</div>
                            <p className="text-xs text-muted-foreground mt-0.5">Gunakan kode cadangan jika kehilangan akses ke aplikasi TOTP.</p>
                          </div>
                        </div>
                        <div className="p-5 flex items-start gap-3">
                          <UserCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-foreground">Perangkat Terpercaya</div>
                            <p className="text-xs text-muted-foreground mt-0.5">Sesi browser mengingat verifikasi Anda untuk kenyamanan akses.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── 2FA DISABLED STATE INVITATION ── */
                    <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 sm:p-8 space-y-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <ShieldAlert className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-bold text-foreground">
                                {_("settings.twoFactorTitle")}
                              </h2>
                              <Badge variant="warning" className="gap-1 font-semibold">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                {_("settings.off")}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                              {_("settings.twoFactorDesc")} Lindungi akun Anda dari kebocoran kata sandi dengan mengharuskan kode verifikasi 6-digit dari aplikasi autentikator.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setTwoFaStep("password_prompt")}
                          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition shadow-xs shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                          <span>{_("settings.enable2FA")}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border/60">
                        <div className="p-4 rounded-xl bg-muted/50 border border-border/60 space-y-1.5">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Perlindungan Ekstra
                          </span>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Mencegah pihak tak berwenang masuk meskipun mereka mengetahui kata sandi Anda.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl bg-muted/50 border border-border/60 space-y-1.5">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Smartphone className="h-4 w-4 text-primary" />
                            Kompatibilitas Luas
                          </span>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Mendukung Google Authenticator, Microsoft Authenticator, Authy, dan 1Password.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl bg-muted/50 border border-border/60 space-y-1.5">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Lock className="h-4 w-4 text-primary" />
                            Kode Cadangan Darurat
                          </span>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Dapatkan 10 kode cadangan offline untuk memulihkan akses jika HP Anda hilang.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SECTION: API KEYS & INTEGRATIONS ─────────────────────────────── */}
          {activeTab === "api-keys" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Header Action Card */}
              <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {_("settings.apiKeys")}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                      {_("settings.apiKeysDesc")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCreatingKey(!isCreatingKey)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-xs shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isCreatingKey ? "Tutup Form" : _("settings.createApiKey")}</span>
                </button>
              </div>

              {/* New Secret Banner Notice */}
              {newSecret && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        {_("settings.apiKeyCreated")}
                      </h3>
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                        {_("settings.secretWarning")}
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                        <code className="w-full sm:flex-1 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-xs font-mono text-foreground break-all select-all font-semibold">
                          {newSecret}
                        </code>
                        <button
                          type="button"
                          onClick={copySecret}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>{_("settings.copySecret")}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setNewSecret(null)}
                      className="text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline"
                    >
                      Tutup Notifikasi
                    </button>
                  </div>
                </div>
              )}

              {/* Create API Key Drawer/Card */}
              {isCreatingKey && (
                <form onSubmit={handleCreateApiKey} className="bg-card rounded-xl border border-border/70 shadow-xs p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="border-b border-border/60 pb-3">
                    <h3 className="text-sm font-semibold text-foreground">Buat Kredensial API Baru</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Tentukan nama integrasi dan pilih izin akses yang sesuai.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="api-key-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {_("settings.apiKeyName")}
                    </label>
                    <input
                      id="api-key-name"
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder={_("settings.apiKeyNamePlaceholder")}
                      maxLength={100}
                      className="w-full h-10 px-3.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {_("settings.apiKeyScopes")}
                    </label>
                    <p className="text-xs text-muted-foreground">{_("settings.apiKeyScopesDesc")}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {[
                        ["profile:read", _("settings.profileRead") || "Baca profil akun"],
                        ["accounts:read", _("settings.accountsRead") || "Baca data akun Telegram"],
                        ["accounts:write", _("settings.accountsWrite") || "Kelola akun Telegram"],
                        ["jobs:read", _("settings.jobsRead") || "Baca riwayat & status job"],
                      ].map(([scope, label]) => {
                        const isChecked = apiKeyScopes.includes(scope);
                        return (
                          <label
                            key={scope}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition",
                              isChecked
                                ? "bg-primary/5 border-primary/40 ring-1 ring-primary/40"
                                : "bg-card border-border hover:bg-accent/60"
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleApiScope(scope)}
                              className="mt-0.5"
                            />
                            <div className="flex flex-col">
                              <code className="text-xs font-mono font-semibold text-foreground">{scope}</code>
                              <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingKey(false)}
                      className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/60 transition"
                    >
                      {_("navbar.cancel") || "Batal"}
                    </button>
                    <button
                      type="submit"
                      disabled={apiKeyCreating || !apiKeyName.trim() || apiKeyScopes.length === 0}
                      className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {apiKeyCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{_("settings.generatingKey")}</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          <span>{_("settings.generateKey")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* List of Keys */}
              <div className="bg-card rounded-xl border border-border/70 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Daftar API Key Aktif</h3>
                  <span className="text-xs text-muted-foreground font-medium">{apiKeys.length} terdaftar</span>
                </div>

                {apiKeysLoading ? (
                  <div className="p-6 space-y-3">
                    <div className="h-12 bg-muted rounded-lg animate-pulse" />
                    <div className="h-12 bg-muted rounded-lg animate-pulse" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground mx-auto flex items-center justify-center border border-border">
                      <KeyRound className="h-6 w-6" />
                    </div>
                    <div className="text-sm font-semibold text-foreground">{_("settings.noApiKeys")}</div>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Buat API key untuk menghubungkan TeleBos dengan server eksternal, bot Telegram, atau skrip otomasi Anda.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCreatingKey(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{_("settings.createApiKey")}</span>
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {apiKeys.map((key) => {
                      const isRevoked = Boolean(key.revoked_at);
                      return (
                        <div
                          key={key.id}
                          className={cn(
                            "p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition",
                            isRevoked ? "bg-muted/30 opacity-60" : "hover:bg-accent/30"
                          )}
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2.5">
                              <span className="font-semibold text-sm text-foreground truncate">
                                {key.name}
                              </span>
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[11px] font-semibold",
                                  isRevoked
                                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                )}
                              >
                                {isRevoked ? _("settings.revoked") : "Active"}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                              <span className="px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                                {key.key_prefix}••••••••
                              </span>
                              <span className="text-muted-foreground font-sans">
                                Dibuat: {new Date(key.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {key.scopes.map((s) => (
                                <span
                                  key={s}
                                  className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-muted text-muted-foreground"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>

                          {!isRevoked && (
                            <button
                              type="button"
                              onClick={() => handleRevokeApiKey(key.id)}
                              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{_("settings.revoke")}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION: BANK ACCOUNTS & PAYMENTS ────────────────────────────── */}
          {activeTab === "bank-accounts" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Header Action Card */}
              <div className="bg-card rounded-xl border border-border/70 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {_("settings.bankAccountsTitle")}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                      {_("settings.bankAccountsDesc")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingAccount(!isAddingAccount)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-xs shrink-0 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isAddingAccount ? "Tutup Form" : _("settings.addBankAccount")}</span>
                </button>
              </div>

              {/* Form to Add Account */}
              {isAddingAccount && (
                <form onSubmit={handleSaveAccount} className="bg-card rounded-xl border border-border/70 shadow-xs p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="border-b border-border/60 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Tambah Rekening Bank atau E-Wallet Baru
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pastikan nama pemilik rekening sama dengan nama pada identitas Anda.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Tipe Akun
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setNewAccountType("bank");
                            setNewAccountProvider("BCA");
                          }}
                          className={cn(
                            "flex-1 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer",
                            newAccountType === "bank"
                              ? "bg-primary/5 border-primary text-primary"
                              : "border-border text-foreground"
                          )}
                        >
                          Bank Transfer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewAccountType("ewallet");
                            setNewAccountProvider("DANA");
                          }}
                          className={cn(
                            "flex-1 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer",
                            newAccountType === "ewallet"
                              ? "bg-primary/5 border-primary text-primary"
                              : "border-border text-foreground"
                          )}
                        >
                          E-Wallet
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {_("settings.bankName")}
                      </label>
                      <Select
                        value={newAccountProvider}
                        onValueChange={setNewAccountProvider}
                      >
                        <SelectTrigger className="w-full h-10 rounded-lg">
                          <SelectValue placeholder="Pilih Bank / E-Wallet" />
                        </SelectTrigger>
                        <SelectContent>
                          {newAccountType === "bank" ? (
                            <>
                              <SelectItem value="BCA">BCA (Bank Central Asia)</SelectItem>
                              <SelectItem value="Mandiri">Bank Mandiri</SelectItem>
                              <SelectItem value="BRI">BRI (Bank Rakyat Indonesia)</SelectItem>
                              <SelectItem value="BNI">BNI (Bank Negara Indonesia)</SelectItem>
                              <SelectItem value="CIMB Niaga">CIMB Niaga</SelectItem>
                              <SelectItem value="Permata">Bank Permata</SelectItem>
                              <SelectItem value="BSI">BSI (Bank Syariah Indonesia)</SelectItem>
                              <SelectItem value="Danamon">Bank Danamon</SelectItem>
                              <SelectItem value="Bank Jago">Bank Jago</SelectItem>
                              <SelectItem value="SeaBank">SeaBank</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="DANA">DANA</SelectItem>
                              <SelectItem value="GoPay">GoPay</SelectItem>
                              <SelectItem value="OVO">OVO</SelectItem>
                              <SelectItem value="ShopeePay">ShopeePay</SelectItem>
                              <SelectItem value="LinkAja">LinkAja</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {_("settings.accountNumber")}
                      </label>
                      <input
                        type="text"
                        value={newAccountNumber}
                        onChange={(e) => setNewAccountNumber(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder={newAccountType === "bank" ? "Contoh: 8820192833" : "Contoh: 081234567890"}
                        className="w-full h-10 px-3.5 rounded-lg border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {_("settings.accountHolder")}
                      </label>
                      <input
                        type="text"
                        value={newAccountHolder}
                        onChange={(e) => setNewAccountHolder(e.target.value)}
                        placeholder="Nama sesuai rekening / KTP"
                        className="w-full h-10 px-3.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={newAccountDefault}
                        onCheckedChange={(checked) => setNewAccountDefault(!!checked)}
                      />
                      <span className="text-xs text-foreground font-medium">
                        {_("settings.isDefaultAccount")}
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingAccount(false)}
                      className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/60 transition cursor-pointer"
                    >
                      {_("navbar.cancel") || "Batal"}
                    </button>
                    <button
                      type="submit"
                      disabled={!newAccountNumber.trim() || !newAccountHolder.trim()}
                      className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Simpan Rekening</span>
                    </button>
                  </div>
                </form>
              )}

              {/* List of Saved Bank Accounts */}
              <div className="bg-card rounded-xl border border-border/70 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Rekening Penarikan Tersimpan
                  </h3>
                  <span className="text-xs text-muted-foreground font-medium">
                    {accounts.length} rekening terdaftar
                  </span>
                </div>

                {accounts.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground mx-auto flex items-center justify-center border border-border">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {_("settings.noBankAccounts")}
                    </div>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      {_("settings.noBankAccountsDesc")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsAddingAccount(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{_("settings.addBankAccount")}</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
                    {accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className={cn(
                          "p-4 rounded-xl border relative transition-all space-y-3",
                          acc.isDefault
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card hover:border-border/90"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "px-2.5 py-1 rounded-md text-xs font-bold tracking-wide",
                                acc.provider === "BCA" && "bg-blue-600 text-white",
                                acc.provider === "Mandiri" && "bg-amber-600 text-white",
                                acc.provider === "BRI" && "bg-sky-600 text-white",
                                acc.provider === "BNI" && "bg-teal-600 text-white",
                                acc.provider === "GoPay" && "bg-sky-500 text-white",
                                acc.provider === "DANA" && "bg-blue-500 text-white",
                                acc.provider === "OVO" && "bg-purple-600 text-white",
                                acc.provider === "ShopeePay" && "bg-orange-500 text-white",
                                !["BCA", "Mandiri", "BRI", "BNI", "GoPay", "DANA", "OVO", "ShopeePay"].includes(acc.provider) && "bg-slate-700 text-white"
                              )}
                            >
                              {acc.provider}
                            </span>
                            <span className="text-xs text-muted-foreground capitalize">
                              {acc.type === "bank" ? "Bank Transfer" : "E-Wallet"}
                            </span>
                          </div>

                          {acc.isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                              <Check className="h-3 w-3" />
                              {_("settings.defaultBadge")}
                            </span>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-bold text-foreground tracking-wider">
                              {acc.accountNumber}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(acc.accountNumber);
                                toast.success(_("settings.copied"));
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                              title="Copy account number"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium">
                            A.N. {acc.accountHolder}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                          {!acc.isDefault ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDefaultAccount(acc.id);
                                toast.success("Rekening utama berhasil diubah");
                              }}
                              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                            >
                              {_("settings.setAsDefault")}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Digunakan otomatis untuk penarikan</span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(_("settings.deleteAccountConfirm"))) {
                                deleteAccount(acc.id);
                                toast.success(_("settings.accountDeleted"));
                              }
                            }}
                            className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="Hapus rekening"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION: APPEARANCE ───────────────────────────────────────────── */}
          {activeTab === "appearance" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Card: Theme Mode */}
              <div className="bg-card rounded-xl border border-border/70 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span>{_("settings.themeMode")}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {_("settings.themeModeDesc")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="self-start sm:self-auto font-medium">
                    {theme === "system" ? _("settings.themeSystem") : theme === "dark" ? _("settings.themeDark") : _("settings.themeLight")}
                  </Badge>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Option 1: Light */}
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative",
                        theme === "light"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-border/90 bg-muted/30"
                      )}
                    >
                      <div className="w-full h-28 rounded-lg bg-white border border-slate-200 p-2.5 flex flex-col justify-between mb-4 shadow-xs overflow-hidden select-none">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="w-12 h-2 rounded bg-slate-200" />
                          <div className="w-4 h-4 rounded-full bg-slate-200" />
                        </div>
                        <div className="space-y-1.5 py-1">
                          <div className="w-3/4 h-2.5 rounded bg-slate-800" />
                          <div className="w-1/2 h-2 rounded bg-slate-300" />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-4 rounded bg-primary" />
                          <div className="w-10 h-4 rounded bg-slate-100" />
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mt-auto">
                        <div className="flex items-center gap-2">
                          <Sun className="h-4 w-4 text-amber-500 shrink-0" />
                          <span className="font-semibold text-sm text-foreground">
                            {_("settings.themeLight")}
                          </span>
                        </div>
                        {theme === "light" && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {_("settings.themeLightDesc")}
                      </p>
                    </button>

                    {/* Option 2: Dark */}
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative",
                        theme === "dark"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-border/90 bg-muted/30"
                      )}
                    >
                      <div className="w-full h-28 rounded-lg bg-slate-950 border border-slate-800 p-2.5 flex flex-col justify-between mb-4 shadow-xs overflow-hidden select-none">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div className="w-12 h-2 rounded bg-slate-700" />
                          <div className="w-4 h-4 rounded-full bg-slate-700" />
                        </div>
                        <div className="space-y-1.5 py-1">
                          <div className="w-3/4 h-2.5 rounded bg-slate-100" />
                          <div className="w-1/2 h-2 rounded bg-slate-500" />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-4 rounded bg-primary" />
                          <div className="w-10 h-4 rounded bg-slate-800" />
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mt-auto">
                        <div className="flex items-center gap-2">
                          <Moon className="h-4 w-4 text-blue-400 shrink-0" />
                          <span className="font-semibold text-sm text-foreground">
                            {_("settings.themeDark")}
                          </span>
                        </div>
                        {theme === "dark" && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {_("settings.themeDarkDesc")}
                      </p>
                    </button>

                    {/* Option 3: System */}
                    <button
                      type="button"
                      onClick={() => setTheme("system")}
                      className={cn(
                        "flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative",
                        theme === "system"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-border/90 bg-muted/30"
                      )}
                    >
                      <div className="w-full h-28 rounded-lg border border-slate-300 dark:border-slate-700 flex overflow-hidden mb-4 shadow-xs select-none">
                        <div className="w-1/2 bg-white p-2.5 flex flex-col justify-between border-r border-slate-200">
                          <div className="w-8 h-2 rounded bg-slate-200" />
                          <div className="space-y-1">
                            <div className="w-full h-2 rounded bg-slate-800" />
                            <div className="w-2/3 h-1.5 rounded bg-slate-300" />
                          </div>
                          <div className="w-8 h-3 rounded bg-primary" />
                        </div>
                        <div className="w-1/2 bg-slate-950 p-2.5 flex flex-col justify-between">
                          <div className="w-8 h-2 rounded bg-slate-700" />
                          <div className="space-y-1">
                            <div className="w-full h-2 rounded bg-slate-100" />
                            <div className="w-2/3 h-1.5 rounded bg-slate-500" />
                          </div>
                          <div className="w-8 h-3 rounded bg-primary" />
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mt-auto">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-sm text-foreground">
                            {_("settings.themeSystem")}
                          </span>
                        </div>
                        {theme === "system" && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {_("settings.themeSystemDesc")}
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION: LANGUAGE ─────────────────────────────────────────────── */}
          {activeTab === "language" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Card: Language Settings */}
              <div className="bg-card rounded-xl border border-border/70 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span>{_("settings.languageSection")}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {_("settings.languageSectionDesc")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="self-start sm:self-auto font-medium">
                    {preference === "system"
                      ? `${_("settings.languageSystem")} (${locale.toUpperCase()})`
                      : locale.toUpperCase()}
                  </Badge>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Option 1: English */}
                    <button
                      type="button"
                      onClick={() => setPreference("en")}
                      className={cn(
                        "flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative",
                        preference === "en"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-border/90 bg-muted/30"
                      )}
                    >
                      <div className="w-full h-28 rounded-lg bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between mb-4 shadow-xs overflow-hidden select-none">
                        <div className="flex items-center justify-between">
                          <CountryFlag countryCode="gb" size="lg" className="w-8 h-5.5 rounded-sm shadow-sm" />
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            EN
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-white">English</p>
                          <p className="text-[11px] text-slate-400">United States / Global</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span>Workspace & Navigation</span>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mt-auto">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {_("settings.languageEn")}
                          </span>
                        </div>
                        {preference === "en" && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {_("settings.languageEnDesc")}
                      </p>
                    </button>

                    {/* Option 2: Bahasa Indonesia */}
                    <button
                      type="button"
                      onClick={() => setPreference("id")}
                      className={cn(
                        "flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative",
                        preference === "id"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-border/90 bg-muted/30"
                      )}
                    >
                      <div className="w-full h-28 rounded-lg bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between mb-4 shadow-xs overflow-hidden select-none">
                        <div className="flex items-center justify-between">
                          <CountryFlag countryCode="id" size="lg" className="w-8 h-5.5 rounded-sm shadow-sm" />
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            ID
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-white">Bahasa Indonesia</p>
                          <p className="text-[11px] text-slate-400">Indonesia</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                          <span>Ruang Kerja & Navigasi</span>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mt-auto">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {_("settings.languageId")}
                          </span>
                        </div>
                        {preference === "id" && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {_("settings.languageIdDesc")}
                      </p>
                    </button>

                    {/* Option 3: System Default */}
                    <button
                      type="button"
                      onClick={() => setPreference("system")}
                      className={cn(
                        "flex flex-col text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative",
                        preference === "system"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-border/90 bg-muted/30"
                      )}
                    >
                      <div className="w-full h-28 rounded-lg bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between mb-4 shadow-xs overflow-hidden select-none">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Laptop className="h-5 w-5 text-emerald-400" />
                            <span className="text-xs font-medium text-slate-300">OS Sync</span>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            AUTO
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-white">
                            {_("settings.languageSystem")}
                          </p>
                          <p className="text-[11px] text-emerald-400">
                            {locale === "id" ? "Terdeteksi: Indonesia" : "Detected: English"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 border-t border-slate-800/80 pt-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>{locale === "id" ? "Otomatis ikuti sistem" : "Auto-detect OS language"}</span>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2 mt-auto">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span className="font-semibold text-sm text-foreground">
                            {_("settings.languageSystem")}
                          </span>
                        </div>
                        {preference === "system" && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {_("settings.languageSystemDesc")}
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
