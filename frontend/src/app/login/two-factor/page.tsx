"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PublicCheckbox } from "@/components/public/public-checkbox";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicShell } from "@/components/public/public-shell";
import { PublicInput, publicButtonClass } from "@/components/public/public-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";

export default function TwoFactorPage() {
  const router = useRouter();
  const _ = useT();
  const fetchMe = useAuthStore((state) => state.fetchMe);

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [trustDevice, setTrustDevice] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "totp") {
        const { error: err } = await authClient.twoFactor.verifyTotp({
          code,
          trustDevice,
        });
        if (err) throw new Error(err.message || _("settings.totpInvalid"));
      } else {
        const { error: err } = await authClient.twoFactor.verifyBackupCode({
          code,
        });
        if (err) throw new Error(err.message || _("settings.totpInvalid"));
      }

      // Sync session into Zustand store & backend axios configuration
      await fetchMe();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSwitchMode() {
    setError("");
    setCode("");
    setMode((prev) => (prev === "totp" ? "backup" : "totp"));
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
            {_("login.backToLogin")}
          </Link>
        </div>

        <div className="rounded-[16px] border border-[#292d30] p-6 sm:p-9">
          <h1 className="public-display text-4xl leading-none text-white">
            {mode === "totp" ? _("login.twoFactorTitle") : _("login.backupCodeTitle")}
          </h1>
          <p className="mt-4 text-[#a1a4a5]">
            {mode === "totp" ? _("login.twoFactorDesc") : _("login.backupCodeDesc")}
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            {error && (
              <div role="alert" aria-live="polite" className="rounded-[6px] border border-[#ff9592] p-4 text-sm text-[#ff9592]">
                <p className="font-medium">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="code" className="mb-2 block text-sm font-medium text-[#f0f0f0]">
                {mode === "totp" ? _("login.codeLabel") : _("login.backupCodeLabel")}
              </label>
              <PublicInput
                id="code"
                name="code"
                type="text"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={mode === "totp" ? _("login.codePlaceholder") : _("login.backupCodePlaceholder")}
                className="font-mono text-center tracking-widest text-lg"
                maxLength={mode === "totp" ? 6 : 10}
                autoFocus
                autoComplete="one-time-code"
              />
            </div>

            {mode === "totp" && (
              <div className="flex items-center text-sm">
                <label
                  htmlFor="trustDevice"
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[6px] text-[#a1a4a5] transition-colors hover:text-[#f0f0f0]"
                >
                  <PublicCheckbox
                    id="trustDevice"
                    name="trustDevice"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                  />
                  <span>{_("login.trustDevice")}</span>
                </label>
              </div>
            )}

            <button type="submit" disabled={loading} className={`${publicButtonClass} w-full border-white`}>
              {loading ? _("login.verifying") : _("login.verify")}
            </button>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={handleSwitchMode}
                className="text-sm text-[#2AABEE] hover:text-white transition-colors duration-150 underline"
              >
                {mode === "totp" ? _("login.useBackupCode") : _("login.useTotp")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}
