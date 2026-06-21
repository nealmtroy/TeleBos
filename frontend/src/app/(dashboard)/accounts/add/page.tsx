"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ShieldAlert, Loader2, RefreshCw } from "lucide-react";
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
    // Only allow numbers
    if (!/^\d*$/.test(value)) return;

    const newCodes = [...codes];
    newCodes[index] = value.slice(-1); // Only keep last character

    setCodes(newCodes);

    // Auto-focus next input
    if (value && index < 4) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !codes[index] && index > 0) {
      // Go back to previous input on backspace
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    }
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
        if (data.v2l_hint) {
          setV2lHint(data.v2l_hint);
        } else {
          setV2lHint(null);
        }
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
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {step === "phone" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {_("addAccount.phoneLabel")}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={_("addAccount.phonePlaceholder")}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {_("addAccount.phoneHint")}
            </p>
          </div>

          <button
            onClick={sendCode}
            disabled={loading || !phone}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 transition"
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
        </>
      )}

      {step === "otp" && (
        <>
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600">
              {_("addAccount.otpSentTo")}{" "}
              <span className="font-semibold">{phone}</span>
            </p>
          </div>

          {/* OTP Input Boxes */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {codes.map((digit, index) => (
              <input
                key={index}
                id={`otp-input-${index}`}
                ref={(el) => {
                  if (el && index === focusedIndex) {
                    el.focus();
                  }
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={() => setFocusedIndex(index)}
                className={cn(
                  "w-full aspect-square flex items-center justify-center text-2xl font-bold rounded-lg border-2 transition-all",
                  focusedIndex === index
                    ? "border-primary-600 ring-2 ring-primary-200 text-primary-900"
                    : digit
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-300 bg-gray-50 text-gray-900"
                )}
                placeholder="-"
              />
            ))}
          </div>

          {/* Timer and Resend */}
          {timeLeft > 0 ? (
            <div className="text-center mt-4">
              <p className="text-sm text-gray-500">
                {_("addAccount.resendAvailable")} <span className="font-mono font-semibold text-primary-600">{formatTime(timeLeft)}</span>
              </p>
            </div>
          ) : (
            <div className="text-center mt-4">
              <button
                onClick={handleResendCode}
                disabled={loading}
                className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {_("addAccount.resendCode")}
              </button>
            </div>
          )}

          <button
            onClick={verifyCode}
            disabled={!canSubmit || loading}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition mt-4"
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
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            {_("addAccount.changePhone")}
          </button>
        </>
      )}

      {step === "2fa" && (
        <>
          <div
            className={cn(
              "px-4 py-3 rounded-lg text-sm flex items-start gap-2",
              "bg-yellow-50 border border-yellow-200 text-yellow-800"
            )}
          >
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>
              {v2lHint || _("addAccount.twoFaWarning")}
            </span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {_("addAccount.twoFaLabel")}
            </label>
            <input
              type="password"
              value={twofaPassword}
              onChange={(e) => setTwofaPassword(e.target.value)}
              placeholder={_("addAccount.twoFaPlaceholder")}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {_("addAccount.twoFaHint")}
            </p>
          </div>
          <button
            onClick={verifyCode}
            disabled={loading || !twofaPassword}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 transition"
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
        </>
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
