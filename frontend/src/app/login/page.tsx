"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Smartphone, MessageSquare, Send, Activity } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const _ = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      router.push("/dashboard");
    } catch (err: any) {
      setError(
          err?.response?.data?.detail || _("login.loginFailed")
      );
    } finally {
      setLoading(false);
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
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
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

            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer accent-primary-600"
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-900 cursor-pointer select-none">
                {_("login.rememberMe")}
              </label>
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
