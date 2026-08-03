"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";

type Step = "phone" | "code" | "setupEmail" | "setupEmailCode" | "twofa";
type SentCode = {
  login_id: string;
  stage: "enter_code" | "setup_email";
  delivery_type?: string | null;
  next_delivery_type?: string | null;
  timeout?: number | null;
  code_length?: number | null;
  input_mode?: "numeric" | "alphabetic" | "alphanumeric" | "pattern" | null;
  input_pattern?: string | null;
  email_pattern?: string | null;
  google_signin_allowed?: boolean;
  apple_signin_allowed?: boolean;
};

type SetupEmailCode = {
  login_id: string;
  stage: "setup_email_code";
  email_pattern?: string | null;
  code_length?: number | null;
  timeout?: number | null;
  input_mode?: "alphanumeric" | null;
};

function deliveryLabel(delivery?: string | null) {
  const labels: Record<string, string> = {
    app: "Telegram",
    sms: "SMS",
    call: "panggilan",
    email_code: "email",
    fragment_sms: "Fragment",
    missed_call: "panggilan tidak terjawab",
  };
  return labels[delivery || ""] || "Telegram";
}

export function TelegramLoginFlow() {
  const _ = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [flow, setFlow] = useState<SentCode | SetupEmailCode | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [twofaPassword, setTwofaPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [v2lHint, setV2lHint] = useState<string | null>(null);

  const codeLength = flow?.code_length ?? null;
  const inputMode = flow?.input_mode ?? "alphanumeric";
  const cells = useMemo(() => codeLength ? Array.from({ length: codeLength }) : [], [codeLength]);

  const resetFlow = () => {
    setFlow(null); setCode(""); setEmail(""); setTwofaPassword(""); setV2lHint(null); setTimeLeft(0); setStep("phone");
  };

  const cancel = async () => {
    if (!flow?.login_id) return;
    try { await api.post("/accounts/cancel-login", { login_id: flow.login_id }); } catch { /* best effort */ }
  };

  useEffect(() => () => { void cancel(); }, [flow?.login_id]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [timeLeft]);

  const applySentCode = (data: SentCode) => {
    setFlow(data); setCode(""); setTimeLeft(data.timeout ?? 0);
    setStep(data.stage === "setup_email" ? "setupEmail" : "code");
  };

  const sendCode = async () => {
    setError(""); setLoading(true);
    try {
      const cleaned = phone.replace(/\s/g, "");
      const { data } = await api.post<SentCode>("/accounts/send-code", { phone: cleaned });
      setPhone(cleaned); applySentCode(data);
    } catch (err: any) { setError(err?.response?.data?.detail || _("addAccount.failedSendOtp")); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    if (!flow) return;
    setError(""); setLoading(true);
    try { const { data } = await api.post<SentCode>("/accounts/resend-code", { login_id: flow.login_id }); applySentCode(data); }
    catch (err: any) { setError(err?.response?.data?.detail || _("addAccount.failedSendOtp")); }
    finally { setLoading(false); }
  };

  const startSetupEmail = async () => {
    if (!flow) return;
    setError(""); setLoading(true);
    try {
      const { data } = await api.post<SetupEmailCode>("/accounts/setup-email", { login_id: flow.login_id, email });
      setFlow(data); setCode(""); setTimeLeft(data.timeout ?? 0); setStep("setupEmailCode");
    } catch (err: any) { setError(err?.response?.data?.detail || _("addAccount.failedVerify")); }
    finally { setLoading(false); }
  };

  const verifySetupEmail = async () => {
    if (!flow) return;
    setError(""); setLoading(true);
    try { const { data } = await api.post<SentCode>("/accounts/setup-email/verify", { login_id: flow.login_id, code }); applySentCode(data); }
    catch (err: any) { setError(err?.response?.data?.detail || _("addAccount.failedVerify")); }
    finally { setLoading(false); }
  };

  const complete = (data: any) => router.push(`/accounts/${data.account_id}`);
  const verifyCode = async () => {
    if (!flow) return;
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/accounts/verify-code", { login_id: flow.login_id, code });
      if (data.requires_2fa) { setV2lHint(data.v2l_hint || null); setStep("twofa"); } else complete(data);
    } catch (err: any) { setError(err?.response?.data?.detail || _("addAccount.failedVerify")); }
    finally { setLoading(false); }
  };

  const verifyTwofa = async () => {
    if (!flow) return;
    setError(""); setLoading(true);
    try { const { data } = await api.post("/accounts/verify-2fa", { login_id: flow.login_id, twofa_password: twofaPassword }); complete(data); }
    catch (err: any) { setError(err?.response?.data?.detail || _("addAccount.failedVerify")); }
    finally { setLoading(false); }
  };

  const accepts = (value: string) => {
    if (inputMode === "numeric") return /^\d*$/.test(value);
    if (inputMode === "alphabetic") return /^[a-zA-Z]*$/.test(value);
    return /^[a-zA-Z0-9]*$/.test(value);
  };
  const setCodeValue = (value: string) => { if (accepts(value)) setCode(value.slice(0, codeLength ?? 64)); };
  const ready = !!code && (!codeLength || code.length === codeLength);
  const time = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;

  return <div className="space-y-5">
    {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><ShieldAlert className="h-5 w-5 shrink-0" />{error}</div>}
    {step === "phone" && <>
      <div><label className="mb-1.5 block text-sm font-semibold text-gray-700">{_("addAccount.phoneLabel")}</label><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={_("addAccount.phonePlaceholder")} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /><p className="mt-1.5 text-xs text-gray-400">{_("addAccount.phoneHint")}</p></div>
      <button onClick={sendCode} disabled={loading || !phone} className="w-full rounded-lg bg-primary-600 py-2.5 font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400">{loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : _("addAccount.sendOtp")}</button>
    </>}
    {step === "setupEmail" && <>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">{_("addAccount.setupEmailRequired")}</div>
      <div><label className="mb-1.5 block text-sm font-semibold text-gray-700">{_("addAccount.setupEmailLabel")}</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></div>
      {(flow as SentCode)?.google_signin_allowed || (flow as SentCode)?.apple_signin_allowed ? <p className="text-xs text-gray-500">{_("addAccount.thirdPartySigninUnavailable")}</p> : null}
      <button onClick={startSetupEmail} disabled={loading || !email} className="w-full rounded-lg bg-primary-600 py-2.5 font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400">{loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : _("addAccount.setupEmailSendCode")}</button>
    </>}
    {(step === "code" || step === "setupEmailCode") && <>
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center text-sm text-gray-600">{step === "setupEmailCode" ? _("addAccount.setupEmailCodePrompt") : _("addAccount.deliveryCodePrompt", { delivery: deliveryLabel((flow as SentCode)?.delivery_type) })}<div className="mt-1 font-mono text-lg font-bold text-gray-900">{flow?.email_pattern || phone}</div></div>
      {cells.length ? <div className="mx-auto max-w-md"><input aria-label="verification-code" value={code} onChange={(event) => setCodeValue(event.target.value)} onPaste={(event) => { event.preventDefault(); setCodeValue(event.clipboardData.getData("text").trim()); }} inputMode={inputMode === "numeric" ? "numeric" : "text"} maxLength={codeLength || undefined} className="col-span-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.5em] outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-100" /></div> : <input aria-label="verification-code" value={code} onChange={(event) => setCodeValue(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5" />}
      {timeLeft > 0 ? <p className="text-center text-xs text-gray-500">{_("addAccount.resendAvailable")} <strong>{time}</strong></p> : step === "code" ? <button onClick={resend} disabled={loading} className="mx-auto flex items-center gap-2 text-sm font-semibold text-primary-600"><RefreshCw className="h-4 w-4" />{_("addAccount.resendCode")}</button> : null}
      <button onClick={step === "setupEmailCode" ? verifySetupEmail : verifyCode} disabled={loading || !ready} className="w-full rounded-lg bg-primary-600 py-2.5 font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400">{loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : _("addAccount.verifyLogin")}</button>
      <button onClick={async () => { await cancel(); resetFlow(); }} className="w-full text-sm font-medium text-slate-600 hover:text-slate-800">{_("addAccount.changePhone")}</button>
    </>}
    {step === "twofa" && <><div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><Lock className="h-5 w-5 shrink-0" />{v2lHint || _("addAccount.twoFaWarning")}</div><div className="relative"><input type={showPassword ? "text" : "password"} value={twofaPassword} onChange={(event) => setTwofaPassword(event.target.value)} placeholder={_("addAccount.twoFaPlaceholder")} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><button onClick={verifyTwofa} disabled={loading || !twofaPassword} className="w-full rounded-lg bg-primary-600 py-2.5 font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400">{loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : _("addAccount.verifyLogin")}</button></>}
  </div>;
}
