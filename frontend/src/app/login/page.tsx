"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Smartphone, MessageSquare, Send, Activity } from "lucide-react";
import { authClient } from "@/lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";

  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
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
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        setError(
          err?.message || _("login.loginFailed")
        );
      } else if (code === "TOO_MANY_REQUESTS") {
        setError(
          err?.message || "Terlalu banyak percobaan. Silakan tunggu dan coba lagi."
        );
      } else if (code === "EMAIL_NOT_VERIFIED" || err?.message?.toLowerCase().includes("verify")) {
        setError("Email Anda belum diverifikasi. Silakan periksa kotak masuk email Anda atau kirim ulang verifikasi di bawah.");
      } else {
        setError(
          err?.message || _("login.loginFailed")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) {
      setError("Silakan masukkan email Anda terlebih dahulu untuk mengirim ulang verifikasi.");
      return;
    }
    setResendLoading(true);
    setError("");
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/login?verified=true`,
      });
      if (err) throw new Error(err.message || "Failed to send verification email");
      setVerificationSent(true);
    } catch (err: any) {
      setError(err?.message || "Gagal mengirim ulang email verifikasi. Silakan coba lagi.");
    } finally {
      setResendLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) return null;

  const features = [
    {
      title: _("login.featureMultipleAccounts"),
      desc: _("login.featureMultipleAccountsDesc"),
      icon: Smartphone,
    },
    {
      title: _("login.featureChatManagement"),
      desc: _("login.featureChatManagementDesc"),
      icon: MessageSquare,
    },
    {
      title: _("login.featureSmartBroadcast"),
      desc: _("login.featureSmartBroadcastDesc"),
      icon: Send,
    },
    {
      title: _("login.featureRealTimeLogs"),
      desc: _("login.featureRealTimeLogsDesc"),
      icon: Activity,
    },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Left — brand */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-indigo-900 via-primary-800 to-primary-950 flex-col justify-between p-12 text-white">
        <div>
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold tracking-tight">TeleBos</h1>
          </Link>
          <p className="mt-2 text-primary-200">{_("login.brandSubtitle")}</p>
        </div>

        <div className="space-y-6 my-auto max-w-lg">
          <h2 className="text-2xl font-bold tracking-tight text-white/90">
            {_("login.toolkitTitle")}
          </h2>
          <div className="grid grid-cols-1 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition duration-300"
              >
                <div className="p-3 bg-white/10 rounded-lg h-fit flex-shrink-0">
                  <feature.icon className="h-6 w-6 text-primary-200" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{feature.title}</h3>
                  <p className="text-sm text-primary-200/70 mt-1">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-primary-300 text-sm">
          {_("login.footerTagline")}
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-gray-900">{_("login.welcomeBack")}</h2>
            <p className="mt-2 text-gray-500">{_("login.signInSubtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {verified && !error && !verificationSent && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">
                Email berhasil diverifikasi! Silakan masuk ke akun Anda.
              </div>
            )}

            {error && errorCode === "ACCOUNT_LOCKED" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5">&#x1f512;</span>
                  <div>
                    <p className="font-semibold">Akun Dikunci Sementara</p>
                    <p className="mt-1">{error}</p>
                    {retryAfterMinutes && (
                      <p className="mt-1 text-amber-600">
                        Estimasi waktu tunggu: <strong>{retryAfterMinutes} menit</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && errorCode === "TOO_MANY_REQUESTS" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5">&#x26a0;&#xfe0f;</span>
                  <div>
                    <p className="font-semibold">Terlalu Banyak Percobaan</p>
                    <p className="mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {error && errorCode !== "ACCOUNT_LOCKED" && errorCode !== "TOO_MANY_REQUESTS" && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm space-y-2">
                <div>{error}</div>
                {(error.includes("verifikasi") || error.includes("verification") || error.includes("verify") || error.includes("belum diverifikasi")) && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendLoading}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 underline block"
                  >
                    {resendLoading ? "Mengirim ulang..." : "Kirim ulang email verifikasi"}
                  </button>
                )}
              </div>
            )}

            {verificationSent && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                Email verifikasi telah dikirim ulang! Silakan periksa kotak masuk email Anda.
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                {_("login.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder={_("login.emailPlaceholder")}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {_("login.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder={_("login.passwordPlaceholder")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="rememberMe"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer accent-primary-600"
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-900 cursor-pointer select-none">
                  {_("login.rememberMe")}
                </label>
              </div>
              <Link
                href="/forgot-password"
                className="text-sm text-primary-600 hover:underline font-medium"
              >
                {_("login.forgotPassword") || "Forgot password?"}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-2.5 rounded-lg text-white font-medium transition",
                loading
                  ? "bg-primary-400 cursor-not-allowed"
                  : "bg-primary-600 hover:bg-primary-700"
              )}
            >
              {loading ? _("login.signingIn") : _("login.signIn")}
            </button>

            <p className="text-center text-sm text-gray-500">
              {_("login.noAccount")}{" "}
              <Link href="/register" className="text-primary-600 hover:underline font-medium">
                {_("login.register")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
