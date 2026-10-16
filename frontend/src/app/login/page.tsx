"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Eye, EyeOff } from "lucide-react";

import { PublicCheckbox } from "@/components/public/public-checkbox";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicInput, publicButtonClass, publicPrimaryButtonClass } from "@/components/public/public-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GoogleIcon } from "@/components/ui/google-icon";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";

function LoginForm() {
  const router = useRouter();
  const pathname = usePathname();
  const isId = pathname === "/id" || pathname?.startsWith("/id/");
  const prefix = isId ? "/id" : "";
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const _ = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryAfterMinutes, setRetryAfterMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(_("login.googleAuthFailed"));
    }
  }, [searchParams, _]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (user && user.onboarding_completed === false) {
        router.replace("/onboarding");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, user, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setErrorCode(null);
    setRetryAfterMinutes(null);
    setVerificationSent(false);
    setLoading(true);
    try {
      await login(email, password);
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.onboarding_completed === false) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      const code = err?.code || null;
      setErrorCode(code);
      if (code === "TWO_FACTOR_REQUIRED") {
        router.push("/login/two-factor");
      } else if (code === "ACCOUNT_LOCKED") {
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

  async function handleGoogleSignIn() {
    setError("");
    setErrorCode(null);
    setRetryAfterMinutes(null);
    setVerificationSent(false);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
    } catch (err: any) {
      setError(err?.message || _("login.googleAuthFailed"));
      setGoogleLoading(false);
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
          <Link href={isId ? "/id" : "/"} aria-label="TeleBos home" className="public-focus rounded-[6px]">
            <BrandLogo size="md" priority />
          </Link>
          <Link href={`${prefix}/register`} className="public-focus rounded-[6px] text-sm text-[var(--public-muted)] hover:text-[var(--public-text)]">
            {_("login.register")}
          </Link>
        </div>

        <div className="rounded-[16px] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-6 sm:p-9">
          <h1 className="public-display text-5xl leading-none text-[var(--public-text)]">{_("login.welcomeBack")}</h1>
          <p className="mt-4 text-[var(--public-muted)]">{_("login.signInSubtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            {verified && !error && !verificationSent && (
              <div role="status" className="rounded-[6px] border border-[var(--public-success)] p-4 text-sm text-[var(--public-success)]">
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
              <div role="status" className="rounded-[6px] border border-[var(--public-success)] p-4 text-sm text-[var(--public-success)]">
                {_("login.verificationSent")}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading || googleLoading}
              className={`${publicButtonClass} w-full flex items-center justify-center gap-2.5 border-slate-500 bg-slate-900/60 hover:bg-slate-800 text-slate-100 shadow-sm`}
            >
              {googleLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--public-border)] border-t-[var(--public-accent)]" />
              ) : (
                <GoogleIcon className="h-4 w-4 shrink-0" />
              )}
              <span>{_("login.signInWithGoogle")}</span>
            </button>

            <div className="relative my-2 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--public-border)]" />
              </div>
              <div className="relative bg-[var(--public-canvas)] px-3 text-xs uppercase tracking-wider text-[var(--public-subtle)]">
                {_("login.orContinueWith")}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--public-body)]">
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
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--public-body)]">
                {_("login.passwordLabel")}
              </label>
              <div className="relative">
                <PublicInput
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={_("login.passwordPlaceholder")}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? _("login.hidePassword") : _("login.showPassword")}
                  className="public-focus absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--public-muted)] hover:text-[var(--public-text)] transition-colors focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-sm">
              <label htmlFor="rememberMe" className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[6px] text-[var(--public-muted)] transition-colors hover:text-[var(--public-body)]">
                <PublicCheckbox id="rememberMe" name="rememberMe" />
                <span>{_("login.rememberMe")}</span>
              </label>
              <Link href={`${prefix}/forgot-password`} className="public-focus rounded-[6px] text-[var(--public-accent)] hover:text-[var(--public-text)]">
                {_("login.forgotPassword")}
              </Link>
            </div>

            <button type="submit" disabled={loading || googleLoading} aria-busy={loading} className={`${publicPrimaryButtonClass} w-full`}>
              {loading ? _("login.signingIn") : _("login.signIn")}
            </button>

            <p className="text-center text-sm text-[var(--public-muted)]">
              {_("login.noAccount")} {" "}
              <Link href={`${prefix}/register`} className="public-focus rounded-[6px] text-[var(--public-accent)] hover:text-[var(--public-text)]">
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
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--public-border)] border-t-[var(--public-accent)]" role="status">
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
