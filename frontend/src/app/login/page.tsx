"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { PublicCheckbox } from "@/components/public/public-checkbox";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicInput, publicButtonClass } from "@/components/public/public-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const _ = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryAfterMinutes, setRetryAfterMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setErrorCode(null);
    setRetryAfterMinutes(null);
    setVerificationSent(false);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      const code = err?.code || null;
      setErrorCode(code);
      if (code === "ACCOUNT_LOCKED") {
        setRetryAfterMinutes(err?.retryAfterMinutes || null);
        setError(err?.message || _("login.loginFailed"));
      } else if (code === "TOO_MANY_REQUESTS") {
        setError(err?.message || _("login.tooManyMessage"));
      } else if (code === "EMAIL_NOT_VERIFIED" || err?.message?.toLowerCase().includes("verify")) {
        setError(_("login.emailNotVerified"));
      } else {
        setError(err?.message || _("login.loginFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) {
      setError(_("login.enterEmailToResend"));
      return;
    }
    setResendLoading(true);
    setError("");
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/login?verified=true`,
      });
      if (err) throw new Error(err.message || _("login.resendFailed"));
      setVerificationSent(true);
    } catch (err: any) {
      setError(err?.message || _("login.resendFailed"));
    } finally {
      setResendLoading(false);
    }
  }

  if (isLoading) return <LoadingState />;
  if (isAuthenticated) return null;

  const showResend =
    Boolean(error) &&
    errorCode !== "ACCOUNT_LOCKED" &&
    errorCode !== "TOO_MANY_REQUESTS" &&
    (error.toLowerCase().includes("verif") || error.toLowerCase().includes("verify"));

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
          <Link href="/register" className="public-focus rounded-[6px] text-sm text-[#a1a4a5] hover:text-white">
            {_("login.register")}
          </Link>
        </div>

        <div className="rounded-[16px] border border-[#292d30] p-6 sm:p-9">
          <h1 className="public-display text-5xl leading-none text-white">{_("login.welcomeBack")}</h1>
          <p className="mt-4 text-[#a1a4a5]">{_("login.signInSubtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            {verified && !error && !verificationSent && (
              <div role="status" className="rounded-[6px] border border-[#3ad389] p-4 text-sm text-[#3ad389]">
                {_("login.verifiedSuccess")}
              </div>
            )}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className={`rounded-[6px] border p-4 text-sm ${
                  errorCode === "ACCOUNT_LOCKED" || errorCode === "TOO_MANY_REQUESTS"
                    ? "border-[#ffca16] text-[#ffca16]"
                    : "border-[#ff9592] text-[#ff9592]"
                }`}
              >
                <p className="font-medium">
                  {errorCode === "ACCOUNT_LOCKED"
                    ? _("login.lockedTitle")
                    : errorCode === "TOO_MANY_REQUESTS"
                      ? _("login.tooManyTitle")
                      : error}
                </p>
                {errorCode === "ACCOUNT_LOCKED" && retryAfterMinutes && (
                  <p className="mt-2">{_("login.retryEstimate", { minutes: retryAfterMinutes })}</p>
                )}
                {showResend && (
                  <button type="button" onClick={handleResendVerification} disabled={resendLoading} className="public-focus mt-3 rounded-[6px] text-xs underline">
                    {resendLoading ? _("login.resendingVerification") : _("login.resendVerification")}
                  </button>
                )}
              </div>
            )}
            {verificationSent && (
              <div role="status" className="rounded-[6px] border border-[#3ad389] p-4 text-sm text-[#3ad389]">
                {_("login.verificationSent")}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#f0f0f0]">
                {_("login.emailLabel")}
              </label>
              <PublicInput
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={_("login.emailPlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#f0f0f0]">
                {_("login.passwordLabel")}
              </label>
              <PublicInput
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={_("login.passwordPlaceholder")}
              />
            </div>

            <div className="flex items-center justify-between gap-4 text-sm">
              <label htmlFor="rememberMe" className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[6px] text-[#a1a4a5] transition-colors hover:text-[#f0f0f0]">
                <PublicCheckbox id="rememberMe" name="rememberMe" />
                <span>{_("login.rememberMe")}</span>
              </label>
              <Link href="/forgot-password" className="public-focus rounded-[6px] text-[#2AABEE] hover:text-white">
                {_("login.forgotPassword")}
              </Link>
            </div>

            <button type="submit" disabled={loading} aria-busy={loading} className={`${publicButtonClass} w-full border-white`}>
              {loading ? _("login.signingIn") : _("login.signIn")}
            </button>
            <p className="text-center text-sm text-[#a1a4a5]">
              {_("login.noAccount")} {" "}
              <Link href="/register" className="public-focus rounded-[6px] text-[#2AABEE] hover:text-white">
                {_("login.register")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}

function LoadingState() {
  return (
    <div className="public-theme flex min-h-screen items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#292d30] border-t-[#2AABEE]" role="status">
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}
