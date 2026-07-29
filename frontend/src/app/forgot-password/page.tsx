"use client";

import { useState } from "react";
import Link from "next/link";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicInput, publicButtonClass } from "@/components/public/public-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const _ = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      // Keep a uniform response for every address to prevent account enumeration.
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // The visible outcome intentionally remains identical when the request fails.
    } finally {
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <PublicShell
      footer={<PublicFooter compact />}
      mainClassName="flex min-h-screen items-center justify-center px-4 py-16 sm:px-8"
    >
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" aria-label="TeleBos home" className="public-focus rounded-[6px]">
            <BrandLogo size="md" priority />
          </Link>
          <Link href="/login" className="public-focus rounded-[6px] text-sm text-[#a1a4a5] hover:text-white">
            {_("forgotPassword.backToLogin")}
          </Link>
        </div>

        <div className="rounded-[16px] border border-[#292d30] p-6 sm:p-9">
          <h1 className="public-display text-5xl leading-none text-white">{_("forgotPassword.title")}</h1>
          <p className="mt-4 leading-7 text-[#a1a4a5]">{_("forgotPassword.subtitle")}</p>

          {sent ? (
            <div className="mt-9 space-y-6">
              <div role="status" aria-live="polite" className="rounded-[6px] border border-[#3ad389] p-4 text-sm leading-6 text-[#3ad389]">
                {_("forgotPassword.success")}
              </div>
              <Link href="/login" className={`${publicButtonClass} w-full border-white`}>
                {_("forgotPassword.backToLogin")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-9 space-y-5">
              <div>
                <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-[#f0f0f0]">
                  {_("forgotPassword.emailLabel")}
                </label>
                <PublicInput
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={_("forgotPassword.emailPlaceholder")}
                />
              </div>

              <button type="submit" disabled={loading} aria-busy={loading} className={`${publicButtonClass} w-full border-white`}>
                {loading ? _("forgotPassword.sending") : _("forgotPassword.sendLink")}
              </button>

              <p className="text-center text-sm text-[#a1a4a5]">
                {_("forgotPassword.rememberPassword")} {" "}
                <Link href="/login" className="public-focus rounded-[6px] text-[#2AABEE] hover:text-white">
                  {_("login.signIn")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
