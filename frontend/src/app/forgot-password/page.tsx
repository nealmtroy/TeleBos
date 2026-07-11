"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const _ = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Always show the success state regardless of the API response.
      // The server returns a uniform 200 for all emails to prevent user
      // enumeration (vuln-0006).  We still attempt the call so the reset
      // email is actually sent when the account exists.
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } catch {
      // Silently show success even on error — the server may reject with
      // a non-200 status in edge cases, but we must not disclose whether
      // the email exists.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-sm border">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Reset password</h2>
          <p className="mt-2 text-gray-500">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              Check your email for the reset link
            </div>
            <Link
              href="/login"
              className="text-primary-600 hover:underline font-medium text-sm"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="you@example.com"
              />
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
              {loading ? "Sending..." : "Send reset link"}
            </button>

            <p className="text-center text-sm text-gray-500">
              Remember your password?{" "}
              <Link href="/login" className="text-primary-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
