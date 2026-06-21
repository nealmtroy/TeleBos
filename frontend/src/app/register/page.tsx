"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const _ = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) {
      setError(_("register.mustAgree"));
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await register(email, password, name);
      setSuccess(_("register.accountCreated"));
      setTimeout(() => router.push("/login"), 1500);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || _("register.registrationFailed")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-sm border">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">{_("register.createAccount")}</h2>
          <p className="mt-2 text-gray-500">{_("register.getStarted")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{_("register.fullNameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder={_("register.fullNamePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{_("register.emailLabel")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder={_("register.emailPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{_("register.passwordLabel")}</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder={_("register.passwordPlaceholder")}
            />
          </div>

          {/* Agree checkbox */}
          <div className="flex items-start gap-3">
            <input
              id="agree"
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <label htmlFor="agree" className="text-sm text-gray-500 leading-relaxed cursor-pointer select-none">
              {_("register.agreePrefix")}{" "}
              <Link href="/privacy" className="text-primary-600 hover:underline font-medium">
                {_("landing.navPrivacy")}
              </Link>
              {" "}{_("register.agreeAnd")}{" "}
              <Link href="/tos" className="text-primary-600 hover:underline font-medium">
                {_("landing.navTos")}
              </Link>
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
            {loading ? _("register.creatingAccount") : _("register.createAccount")}
          </button>

          <p className="text-center text-sm text-gray-500">
            {_("register.alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-primary-600 hover:underline font-medium">
              {_("register.signIn")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
