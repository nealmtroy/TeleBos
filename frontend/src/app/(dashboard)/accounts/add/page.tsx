"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  Loader2,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Smartphone,
  KeyRound,
  QrCode,
  Laptop,
  Clock,
  CheckCircle2,
  ArrowRight,
  ScanLine,
  AlertCircle,
} from "lucide-react";
import { TelegramLoginFlow } from "@/components/accounts/telegram-login-flow";
import { PhoneInputWithCountry } from "@/components/accounts/phone-input-with-country";
import { useT } from "@/lib/i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AddAccountPage() {
  const _ = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"otp" | "upload" | "qr">("otp");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{_("addAccount.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {_("addAccount.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-2xl border border-border/80 shadow-2xs">
        <Tabs value={tab} onValueChange={(val) => setTab(val as typeof tab)}>
          <div className="border-b border-border/80 bg-muted/20 rounded-t-2xl px-3 pt-2">
            <TabsList className="w-full h-11 bg-transparent p-0 gap-2 border-b-0">
              {[
                { key: "otp", label: _("addAccount.tabOtp"), icon: Smartphone },
                { key: "qr", label: _("addAccount.tabQr"), icon: QrCode },
                { key: "upload", label: _("addAccount.tabUpload"), icon: KeyRound },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="flex-1 h-10 text-xs sm:text-sm font-medium rounded-xl flex items-center justify-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-bold transition-all"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{t.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>

        <div className="p-6">
          {tab === "otp" ? (
            <TelegramLoginFlow />
          ) : tab === "qr" ? (
            <QRLoginForm onSwitchToOtp={() => setTab("otp")} />
          ) : (
            <UploadSessionForm />
          )}
        </div>
      </div>
    </div>
  );
}

function OTPLoginForm() {
  const _ = useT();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "2fa">("phone");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [codes, setCodes] = useState<string[]>(["", "", "", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [twofaPassword, setTwofaPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [v2lHint, setV2lHint] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(120);
  const [emailPattern, setEmailPattern] = useState<string | null>(null);

  const cancelLogin = async (phoneToCancel: string) => {
    if (!phoneToCancel) return;
    try {
      await api.post("/accounts/cancel-login", { phone: phoneToCancel });
    } catch {
      // Best effort — ignore errors on cancel
    }
  };

  // Cleanup login state when component unmounts (navigating away / closing page)
  useEffect(() => {
    return () => {
      cancelLogin(phone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autofocus the first box when transitioning to the OTP verification step
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => {
        const firstInput = document.getElementById("otp-input-0");
        firstInput?.focus();
      }, 50);
    }
  }, [step]);

  const sendCode = async () => {
    setError("");
    setLoading(true);
    setCodes(["", "", "", "", ""]);
    setTimeLeft(120);
    setEmailPattern(null);
    try {
      const cleaned = phone.replace(/\s/g, "");
      const { data } = await api.post("/accounts/send-code", { phone: cleaned });
      setPhone(cleaned);
      setPhoneCodeHash(data.phone_code_hash);
      setEmailPattern(data.email_pattern || null);
      setStep("otp");
    } catch (err: any) {
      setError(err?.response?.data?.detail || _("addAccount.failedSendOtp"));
    } finally {
      setLoading(false);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (step !== "otp") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getFullCode = () => codes.join("");

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCodes = [...codes];
    newCodes[index] = value.slice(-1);

    setCodes(newCodes);

    // Auto-focus next input
    if (value && index < 4) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !codes[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    } else if (e.key === "ArrowRight" && index < 4) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    if (!/^\d+$/.test(pastedData)) return;

    const digits = pastedData.slice(0, 5).split("");
    const newCodes = [...codes];
    for (let i = 0; i < 5; i++) {
      if (digits[i] !== undefined) {
        newCodes[i] = digits[i];
      }
    }
    setCodes(newCodes);

    const targetIndex = Math.min(digits.length, 4);
    const targetInput = document.getElementById(`otp-input-${targetIndex}`);
    targetInput?.focus();
  };

  const handleResendCode = async () => {
    setError("");
    setLoading(true);
    setCodes(["", "", "", "", ""]);
    setTimeLeft(120);
    setEmailPattern(null);
    try {
      const cleaned = phone.replace(/\s/g, "");
      const { data } = await api.post("/accounts/send-code", { phone: cleaned });
      setPhoneCodeHash(data.phone_code_hash);
      setEmailPattern(data.email_pattern || null);
      setTimeLeft(120);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/accounts/verify-code", {
        phone,
        code: getFullCode(),
        phone_code_hash: phoneCodeHash,
        twofa_password: twofaPassword || undefined,
      });
      if (data.requires_2fa) {
        setV2lHint(data.v2l_hint || null);
        setStep("2fa");
        return;
      }
      router.push(`/accounts/${data.account_id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || _("addAccount.failedVerify"));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = getFullCode().length === 5 && !loading;

  return (
    <div className="space-y-6">
      {/* Stepper progress */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        {[
          { key: "phone", label: "Phone Number", stepNum: 1 },
          { key: "otp", label: "OTP Verification", stepNum: 2 },
          { key: "2fa", label: "2FA Password", stepNum: 3 },
        ].map((s, idx) => {
          const active = step === s.key;
          const isPast =
            (step === "otp" && s.key === "phone") ||
            (step === "2fa" && (s.key === "phone" || s.key === "otp"));

          return (
            <React.Fragment key={s.key}>
              {idx > 0 && (
                <div
                  className={cn(
                    "h-[2px] flex-1 mx-4 transition-all duration-300",
                    isPast ? "bg-primary-600" : "bg-gray-200"
                  )}
                />
              )}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border transition-all duration-200",
                    active
                      ? "bg-primary-600 border-primary-600 text-white ring-4 ring-primary-100"
                      : isPast
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-gray-50 border-gray-200 text-gray-400"
                  )}
                >
                  {isPast ? "✓" : s.stepNum}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium hidden sm:inline whitespace-nowrap",
                    active
                      ? "text-gray-900 font-bold"
                      : isPast
                      ? "text-green-600 font-medium"
                      : "text-gray-400"
                  )}
                >
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3.5 rounded-xl text-sm flex items-start gap-2.5 shadow-sm">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {step === "phone" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 mb-2">
            <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Telegram Login</h4>
              <p className="text-xs text-gray-500">
                You will receive a secure OTP code in your Telegram app or SMS.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {_("addAccount.phoneLabel")}
            </label>
            <PhoneInputWithCountry
              value={phone}
              onChange={setPhone}
              disabled={loading}
              placeholder={_("addAccount.phonePlaceholder")}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              {_("addAccount.phoneHint")}
            </p>
          </div>

          <button
            onClick={sendCode}
            disabled={loading || !phone}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {_("addAccount.sending")}
              </span>
            ) : (
              _("addAccount.sendOtp")
            )}
          </button>
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-5">
          <div className="text-center bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-sm text-gray-600">
              {emailPattern ? (
                <span>Kode verifikasi telah dikirim ke email:</span>
              ) : (
                <span>{_("addAccount.otpSentTo")}</span>
              )}
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1 font-mono tracking-wide">
              {emailPattern ? emailPattern : phone}
            </p>
          </div>

          {/* OTP Input Boxes */}
          <div className="grid grid-cols-5 gap-3 max-w-sm mx-auto">
            {codes.map((digit, index) => (
              <input
                key={index}
                id={`otp-input-${index}`}
                name={`otp_${index}`}
                aria-label={`Digit OTP ${index + 1}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(null)}
                className={cn(
                  "w-full aspect-square flex items-center justify-center text-3xl font-extrabold rounded-xl border-2 transition-all text-center outline-none",
                  focusedIndex === index
                    ? "border-primary-600 ring-4 ring-primary-100 text-primary-900 bg-white"
                    : digit
                    ? "border-gray-300 text-gray-900 bg-white"
                    : "border-gray-200 bg-gray-50 text-gray-400"
                )}
                placeholder="-"
              />
            ))}
          </div>

          {/* Timer and Resend */}
          {timeLeft > 0 ? (
            <div className="text-center py-1">
              <p className="text-xs text-gray-500">
                {_("addAccount.resendAvailable")}{" "}
                <span className="font-mono font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full ml-1">
                  {formatTime(timeLeft)}
                </span>
              </p>
            </div>
          ) : (
            <div className="text-center py-1">
              <button
                onClick={handleResendCode}
                disabled={loading}
                className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-semibold transition"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4.5 w-4.5" />
                )}
                {_("addAccount.resendCode")}
              </button>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              onClick={verifyCode}
              disabled={!canSubmit || loading}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition shadow-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {_("addAccount.verifying")}
                </span>
              ) : (
                _("addAccount.verifyLogin")
              )}
            </button>

            <button
              onClick={() => {
                cancelLogin(phone);
                setStep("phone");
                setTimeLeft(120);
                setCodes(["", "", "", "", ""]);
              }}
              className="w-full text-sm font-medium text-gray-500 hover:text-gray-700 transition py-1.5"
            >
              {_("addAccount.changePhone")}
            </button>
          </div>
        </div>
      )}

      {step === "2fa" && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3.5 rounded-xl text-sm flex items-start gap-2.5 shadow-sm">
            <Lock className="h-5 w-5 flex-shrink-0 text-yellow-600 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">
              {v2lHint || _("addAccount.twoFaWarning")}
            </div>
          </div>

          <div>
            <label htmlFor="twofa-password" className="block text-sm font-semibold text-gray-700 mb-1.5">
              {_("addAccount.twoFaLabel")}
            </label>
            <div className="relative">
              <input
                id="twofa-password"
                name="twofaPassword"
                type={showPassword ? "text" : "password"}
                value={twofaPassword}
                onChange={(e) => setTwofaPassword(e.target.value)}
                placeholder={_("addAccount.twoFaPlaceholder")}
                className="w-full pl-4 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {_("addAccount.twoFaHint")}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={verifyCode}
              disabled={loading || !twofaPassword}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {_("addAccount.verifying")}
                </span>
              ) : (
                _("addAccount.verifyLogin")
              )}
            </button>

            <button
              onClick={() => {
                setStep("otp");
                setTwofaPassword("");
                setError("");
              }}
              className="w-full text-sm font-medium text-gray-500 hover:text-gray-700 transition py-1.5"
            >
              ← Back to OTP verification
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type SessionFormat = "telethon" | "gramjs" | "pyrogram" | "raw_base64" | "unknown";

function detectSessionFormat(s: string): SessionFormat {
  const trimmed = s.trim();
  if (!trimmed) return "unknown";

  // Telethon: starts with "1" followed by base64, minimum length
  if (trimmed.startsWith("1") && trimmed.length > 20) return "telethon";

  // GramJS: dc_id:ip:port:base64_auth_key
  if (/^\d+:\d+\.\d+\.\d+\.\d+:\d+:[A-Za-z0-9+/=_-]+$/.test(trimmed))
    return "gramjs";

  // Try base64 decode to distinguish raw vs pyrogram
  try {
    const decoded = atob(trimmed.replace(/-/g, "+").replace(/_/g, "/"));
    if (decoded.length === 256) return "raw_base64";
    if (decoded.length >= 268 && decoded.length <= 1000) return "pyrogram";
  } catch {
    // not valid base64
  }

  return "unknown";
}

const FORMAT_LABELS: Record<SessionFormat, string> = {
  telethon: "addAccount.sessionFormatTelethon",
  gramjs: "addAccount.sessionFormatGramjs",
  pyrogram: "addAccount.sessionFormatPyrogram",
  raw_base64: "addAccount.sessionFormatRaw",
  unknown: "addAccount.sessionFormatUnknown",
};

const FORMAT_COLORS: Record<SessionFormat, string> = {
  telethon: "border-blue-400 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950/40",
  gramjs: "border-sky-400 text-sky-700 bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:bg-sky-950/40",
  pyrogram: "border-rose-400 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:bg-rose-950/40",
  raw_base64: "border-slate-400 text-slate-600 bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-900/40",
  unknown: "border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40",
};

function UploadSessionForm() {
  const _ = useT();
  const router = useRouter();
  const [sessionString, setSessionString] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<SessionFormat>("unknown");

  useEffect(() => {
    setDetectedFormat(detectSessionFormat(sessionString));
  }, [sessionString]);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/accounts/upload-session", {
        session_string: sessionString,
      });
      router.push(`/accounts/${data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || _("addAccount.failedUpload"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-xl text-sm flex items-start gap-2 shadow-2xs">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="session-string" className="block text-sm font-medium text-foreground mb-1.5">
          {_("addAccount.sessionLabel")}
        </label>
        <textarea
          id="session-string"
          name="sessionString"
          value={sessionString}
          onChange={(e) => setSessionString(e.target.value)}
          rows={6}
          placeholder={_("addAccount.sessionPlaceholder")}
          className="w-full px-4 py-2.5 border border-border/80 bg-background dark:bg-slate-900/80 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm text-foreground shadow-2xs"
        />

        {/* Format detection badge */}
        {sessionString.trim() && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                FORMAT_COLORS[detectedFormat]
              )}
            >
              {_(FORMAT_LABELS[detectedFormat])}
            </span>
            {detectedFormat !== "unknown" && (
              <span className="text-xs text-muted-foreground">
                {_("addAccount.sessionFormatDetected")}
              </span>
            )}
            {detectedFormat === "unknown" && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {_("addAccount.sessionInvalidFormat")}
              </span>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          {_("addAccount.sessionHint")}
        </p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !sessionString}
        className="w-full py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:bg-muted disabled:text-muted-foreground transition shadow-2xs"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {_("addAccount.verifying")}
          </span>
        ) : (
          _("addAccount.uploadConnect")
        )}
      </button>
    </div>
  );
}


function TelegramPlaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.458c.538-.196 1.006.128.832.943z" />
    </svg>
  );
}

function QRLoginForm({ onSwitchToOtp }: { onSwitchToOtp?: () => void }) {
  const _ = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrId, setQrId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState(300);
  const [status, setStatus] = useState<"pending" | "success" | "requires_2fa" | "failed" | "expired">("pending");
  const [twofaPassword, setTwofaPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Initialize QR Login
  const initQR = async () => {
    setError("");
    setLoading(true);
    setStatus("pending");
    setQrId("");
    setQrUrl("");
    setTwofaPassword("");
    try {
      const { data } = await api.post("/accounts/qr-login/init");
      setQrId(data.qr_id);
      setQrUrl(data.qr_url);
      setTimeLeft(300);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Gagal membuat sesi QR Code");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initQR();
  }, []);

  // Timer Countdown
  useEffect(() => {
    if (!qrUrl || timeLeft <= 0 || status !== "pending") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [qrUrl, timeLeft, status]);

  // Status Polling
  useEffect(() => {
    if (!qrId || status === "success" || status === "failed" || status === "requires_2fa" || status === "expired") return;

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await api.get(`/accounts/qr-login/status/${qrId}`);
        if (data.status !== status) {
          setStatus(data.status);
          if (data.status === "success" && data.account_id) {
            setTimeout(() => {
              router.push(`/accounts/${data.account_id}`);
            }, 600);
          } else if (data.status === "failed") {
            setError(data.error || "Login gagal. Silakan coba lagi.");
          } else if (data.status === "expired") {
            setError("Kode QR sudah kedaluwarsa. Silakan generate ulang.");
          }
        }
      } catch {
        // silent retry on transient poll errors
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [qrId, status, router]);

  // Handle 2FA Password Submission
  const submit2FA = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/accounts/qr-login/2fa", {
        qr_id: qrId,
        twofa_password: twofaPassword,
      });
      if (data.status === "success" && data.account_id) {
        setStatus("success");
        setTimeout(() => {
          router.push(`/accounts/${data.account_id}`);
        }, 600);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Password 2FA salah. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && status !== "requires_2fa" && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={initQR}
            className="text-xs font-semibold underline hover:no-underline text-rose-600 dark:text-rose-400 shrink-0"
          >
            {_("addAccount.resendCode")}
          </button>
        </div>
      )}

      {/* Main View: QR Code pending or loading */}
      {status !== "requires_2fa" && status !== "success" && (
        <div className="space-y-6">
          {/* Header & Steps Banner */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span>{_("addAccount.qrBadge")}</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {_("addAccount.qrTitle")}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md leading-relaxed">
              {_("addAccount.qrSubtitle")}
            </p>
          </div>

          {/* 3-Step Visual Instruction Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 w-full">
            <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-slate-900/40 p-3 sm:p-3.5 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 shadow-2xs transition hover:border-primary/40">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary border border-primary/20 font-bold text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{_("addAccount.qrStep1Title")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {_("addAccount.qrStep1Desc")}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-slate-900/40 p-3 sm:p-3.5 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 shadow-2xs transition hover:border-primary/40">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Laptop className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span>{_("addAccount.qrStep2Title")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {_("addAccount.qrStep2Desc")}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-slate-900/40 p-3 sm:p-3.5 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 shadow-2xs transition hover:border-primary/40">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-xs flex items-center justify-center shrink-0">
                3
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{_("addAccount.qrStep3Title")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {_("addAccount.qrStep3Desc")}
                </p>
              </div>
            </div>
          </div>

          {/* QR Viewfinder Frame */}
          <div className="flex flex-col items-center justify-center py-2 relative">
            {/* Ambient background glow */}
            <div className="absolute w-72 h-72 bg-gradient-to-tr from-primary-500/15 via-sky-400/15 to-blue-600/15 rounded-full blur-2xl pointer-events-none" />

            {/* Main QR Card */}
            <div className="relative group/qr">
              <div
                data-keep-white="true"
                className="relative w-64 h-64 sm:w-72 sm:h-72 bg-white rounded-3xl p-5 sm:p-6 border-2 border-slate-200/90 dark:border-slate-700/80 shadow-2xl shadow-primary/10 flex items-center justify-center overflow-hidden transition-all duration-300"
              >
                {/* Viewfinder corner brackets */}
                <div className="absolute top-3 left-3 w-5 h-5 border-t-3 border-l-3 border-primary-500 rounded-tl-lg pointer-events-none" />
                <div className="absolute top-3 right-3 w-5 h-5 border-t-3 border-r-3 border-primary-500 rounded-tr-lg pointer-events-none" />
                <div className="absolute bottom-3 left-3 w-5 h-5 border-b-3 border-l-3 border-primary-500 rounded-bl-lg pointer-events-none" />
                <div className="absolute bottom-3 right-3 w-5 h-5 border-b-3 border-r-3 border-primary-500 rounded-br-lg pointer-events-none" />

                {/* Laser scan line (active while scanning) */}
                {qrUrl && status === "pending" && timeLeft > 0 && !loading && (
                  <div className="absolute inset-x-4 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent shadow-[0_0_12px_rgba(59,130,246,0.9)] animate-qr-scan pointer-events-none z-10" />
                )}

                {/* Loading State */}
                {loading && !qrUrl && (
                  <div className="flex flex-col items-center justify-center gap-3 text-slate-500 animate-pulse">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200">
                      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 text-center px-4">
                      {_("addAccount.qrGenerating")}
                    </p>
                  </div>
                )}

                {/* QR Code SVG */}
                {qrUrl && (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <QRCode
                      value={qrUrl}
                      size={220}
                      level="M"
                      fgColor="#0f172a"
                      bgColor="#ffffff"
                      className="h-full w-full object-contain"
                    />

                    {/* Centered Telegram Logo */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-white p-1 shadow-lg border border-slate-100 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-[#229ED9] flex items-center justify-center text-white shadow-inner">
                          <TelegramPlaneIcon className="w-6 h-6 -translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expired / Failed Overlay */}
                {(timeLeft <= 0 || status === "expired" || status === "failed") && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-5 text-center text-white z-20 animate-in fade-in duration-200">
                    <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mb-2.5">
                      <RefreshCw className="h-6 w-6" />
                    </div>
                    <h5 className="text-sm font-bold text-white mb-1">
                      {_("addAccount.qrExpiredTitle")}
                    </h5>
                    <p className="text-[11px] text-slate-300 mb-3 max-w-[200px] leading-snug">
                      {_("addAccount.qrExpiredDesc")}
                    </p>
                    <button
                      onClick={initQR}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold shadow-md transition active:scale-95"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                      <span>{_("addAccount.qrReloadBtn")}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Status Bar: Expiration Countdown & Pulse Indicator */}
            {qrUrl && status === "pending" && timeLeft > 0 && (
              <div className="mt-4 flex flex-col sm:flex-row items-center gap-2.5 text-xs">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 dark:bg-slate-900 border border-border text-foreground shadow-2xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {_("addAccount.qrWaitingScan")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border shadow-2xs transition-colors",
                      timeLeft <= 60
                        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-bold animate-pulse"
                        : "bg-muted/60 dark:bg-slate-900 border-border text-muted-foreground"
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>{_("addAccount.qrValidFor")}</span>
                    <span className="font-mono font-bold ml-0.5">{formatTime(timeLeft)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={initQR}
                    disabled={loading}
                    title={_("addAccount.qrRefreshTooltip")}
                    className="p-1.5 rounded-full border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition shadow-2xs active:scale-95"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  </button>
                </div>
              </div>
            )}

            {/* Switch to OTP link */}
            {onSwitchToOtp && (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={onSwitchToOtp}
                  className="text-xs text-muted-foreground hover:text-primary transition font-medium inline-flex items-center gap-1.5 group"
                >
                  <span>{_("addAccount.qrSwitchToOtp")}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2FA Verification State */}
      {status === "requires_2fa" && (
        <div className="space-y-5 max-w-md mx-auto py-2 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {_("addAccount.qrTwoFaTitle")}
              </h4>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                {_("addAccount.qrTwoFaWarning")}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tdlib-twofa-password" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {_("addAccount.qrTwoFaLabel")}
            </label>
            <div className="relative">
              <input
                id="tdlib-twofa-password"
                name="tdlibTwofaPassword"
                type={showPassword ? "text" : "password"}
                value={twofaPassword}
                onChange={(e) => setTwofaPassword(e.target.value)}
                placeholder={_("addAccount.qrTwoFaPlaceholder")}
                className="w-full pl-4 pr-11 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition p-1"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              onClick={submit2FA}
              disabled={loading || !twofaPassword}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{_("addAccount.qrTwoFaProcessing")}</span>
                </span>
              ) : (
                _("addAccount.qrTwoFaConfirmBtn")
              )}
            </button>
            <button
              type="button"
              onClick={initQR}
              className="w-full text-xs font-medium text-muted-foreground hover:text-foreground transition py-1 text-center block"
            >
              {_("addAccount.qrTwoFaBack")}
            </button>
          </div>
        </div>
      )}

      {/* Success State */}
      {status === "success" && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h4 className="text-lg font-bold text-foreground">
            {_("addAccount.qrSuccessTitle")}
          </h4>
          <p className="text-xs text-muted-foreground">
            {_("addAccount.qrSuccessDesc")}
          </p>
        </div>
      )}
    </div>
  );
}
