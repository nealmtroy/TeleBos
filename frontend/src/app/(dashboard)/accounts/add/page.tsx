"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ShieldAlert, Loader2, RefreshCw, Lock, Eye, EyeOff, Smartphone, KeyRound } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function AddAccountPage() {
  const _ = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"otp" | "upload">("otp");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("addAccount.title")}</h1>
        <p className="text-gray-500 mt-1">
          {_("addAccount.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-100">
          {[
            { key: "otp", label: _("addAccount.tabOtp") },
            { key: "upload", label: _("addAccount.tabUpload") },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={cn(
                "flex-1 py-3 text-sm font-medium border-b-2 transition",
                tab === t.key
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "otp" ? <OTPLoginForm /> : <UploadSessionForm />}
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
    try {
      const cleaned = phone.replace(/\s/g, "");
      const { data } = await api.post("/accounts/send-code", { phone: cleaned });
      setPhone(cleaned);
      setPhoneCodeHash(data.phone_code_hash);
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
    try {
      const cleaned = phone.replace(/\s/g, "");
      const { data } = await api.post("/accounts/send-code", { phone: cleaned });
      setPhoneCodeHash(data.phone_code_hash);
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
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={_("addAccount.phonePlaceholder")}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition"
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
              {_("addAccount.otpSentTo")}{" "}
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1 font-mono tracking-wide">{phone}</p>
          </div>

          {/* OTP Input Boxes */}
          <div className="grid grid-cols-5 gap-3 max-w-sm mx-auto">
            {codes.map((digit, index) => (
              <input
                key={index}
                id={`otp-input-${index}`}
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
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {_("addAccount.twoFaLabel")}
            </label>
            <div className="relative">
              <input
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
  telethon: "border-blue-400 text-blue-700 bg-blue-50",
  gramjs: "border-sky-400 text-sky-700 bg-sky-50",
  pyrogram: "border-red-400 text-red-700 bg-red-50",
  raw_base64: "border-gray-400 text-gray-600 bg-gray-50",
  unknown: "border-amber-400 text-amber-700 bg-amber-50",
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {_("addAccount.sessionLabel")}
        </label>
        <textarea
          value={sessionString}
          onChange={(e) => setSessionString(e.target.value)}
          rows={6}
          placeholder={_("addAccount.sessionPlaceholder")}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono text-sm"
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
              <span className="text-xs text-gray-400">
                {_("addAccount.sessionFormatDetected")}
              </span>
            )}
            {detectedFormat === "unknown" && (
              <span className="text-xs text-amber-600">
                {_("addAccount.sessionInvalidFormat")}
              </span>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">
          {_("addAccount.sessionHint")}
        </p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !sessionString}
        className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 transition"
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
