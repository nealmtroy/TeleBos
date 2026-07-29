"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PublicCheckbox } from "@/components/public/public-checkbox";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicInput, publicButtonClass } from "@/components/public/public-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const _ = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!isLoading && isAuthenticated) router.replace("/dashboard"); }, [isAuthenticated, isLoading, router]);
  if (isLoading) return <LoadingState />;
  if (isAuthenticated) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!agree) { setError(_("register.mustAgree")); return; }
    setError(""); setSuccess(""); setLoading(true);
    try {
      await register(email, password, name);
      if (useAuthStore.getState().isAuthenticated) { setSuccess(_("register.accountCreated")); setTimeout(() => router.push("/dashboard"), 1500); }
      else { setSuccess(_("register.verificationRequired")); setTimeout(() => router.push("/login"), 4000); }
    } catch (err: any) { setError(err?.message || _("register.registrationFailed")); }
    finally { setLoading(false); }
  }

  return (
    <PublicShell footer={<PublicFooter compact />} mainClassName="flex min-h-screen items-center justify-center px-4 py-16 sm:px-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-between gap-4"><Link href="/" aria-label="TeleBos home" className="public-focus rounded-[6px]"><BrandLogo size="md" priority /></Link><Link href="/login" className="public-focus rounded-[6px] text-sm text-[#a1a4a5] hover:text-white">{_("register.signIn")}</Link></div>
        <div className="rounded-[16px] border border-[#292d30] p-6 sm:p-9">
          <h1 className="public-display text-5xl leading-none text-white">{_("register.createAccount")}</h1>
          <p className="mt-4 text-[#a1a4a5]">{_("register.getStarted")}</p>
          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            {error && <div role="alert" aria-live="polite" className="rounded-[6px] border border-[#ff9592] p-4 text-sm text-[#ff9592]">{error}</div>}
            {success && <div role="status" aria-live="polite" className="rounded-[6px] border border-[#3ad389] p-4 text-sm text-[#3ad389]">{success}</div>}
            <div><label htmlFor="name" className="mb-2 block text-sm font-medium text-[#f0f0f0]">{_("register.fullNameLabel")}</label><PublicInput id="name" name="name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={_("register.fullNamePlaceholder")} /></div>
            <div><label htmlFor="register-email" className="mb-2 block text-sm font-medium text-[#f0f0f0]">{_("register.emailLabel")}</label><PublicInput id="register-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={_("register.emailPlaceholder")} /></div>
            <div><label htmlFor="register-password" className="mb-2 block text-sm font-medium text-[#f0f0f0]">{_("register.passwordLabel")}</label><PublicInput id="register-password" name="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={_("register.passwordPlaceholder")} /></div>
            <div className="flex items-start gap-3 rounded-[6px] border border-[#292d30] p-4">
              <PublicCheckbox id="agree" name="agree" checked={agree} onChange={(event) => setAgree(event.target.checked)} aria-describedby="agreement-description" />
              <div id="agreement-description" className="text-sm leading-6 text-[#a1a4a5]">
                <label htmlFor="agree" className="cursor-pointer text-[#f0f0f0]">{_("register.agreePrefix")}</label>{" "}
                <Link href="/privacy" className="public-focus rounded-[6px] text-[#2AABEE] hover:text-white">{_("landing.navPrivacy")}</Link>{" "}
                {_("register.agreeAnd")}{" "}
                <Link href="/tos" className="public-focus rounded-[6px] text-[#2AABEE] hover:text-white">{_("landing.navTos")}</Link>
              </div>
            </div>
            <button type="submit" disabled={loading} aria-busy={loading} className={`${publicButtonClass} w-full border-white`}>{loading ? _("register.creatingAccount") : _("register.createAccount")}</button>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}

function LoadingState() { return <div className="public-theme flex min-h-screen items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#292d30] border-t-[#2AABEE]" role="status"><span className="sr-only">Loading</span></div></div>; }
