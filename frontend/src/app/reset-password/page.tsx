"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }

    setLoading(true);

    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (err) throw new Error(err.message || "Failed to reset password");
      setSuccess("Password reset successfully!");
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-md space-y-4 bg-white p-8 rounded-2xl shadow-sm border text-center">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Invalid or missing reset token. Please request a new password reset.
        </div>
        <Link href="/forgot-password" className="text-primary-600 hover:underline font-medium text-sm">
          Request reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-sm border">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">Set new password</h2>
        <p className="mt-2 text-gray-500">Enter your new password below</p>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="Min. 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="Repeat password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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
          {loading ? "Resetting..." : "Reset password"}
        </button>

        <p className="text-center text-sm text-gray-500">
          <Link href="/login" className="text-primary-600 hover:underline font-medium">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <Suspense fallback={
        <div className="h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
