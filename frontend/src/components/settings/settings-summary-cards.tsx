"use client";

import { useEffect, useState } from "react";
import {
  Code2,
  Contrast,
  KeyRound,
  Languages,
  Landmark,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useT, useI18nStore } from "@/lib/i18n";
import { useThemeStore } from "@/store/theme-store";
import { authClient } from "@/lib/auth-client";
import {
  SettingsBadge,
  SettingsCard,
  SettingsCardHeader,
  SettingsDivider,
  SettingsField,
  StatusDot,
} from "./settings-cards";

/**
 * Summary cards for the sections that used to be full-width tab bodies.
 *
 * Each one exposes the current state plus a single primary action that hands off
 * to the detailed editor, so the page reads as a dashboard instead of a stack of
 * long forms. The real forms still live in their tab bodies.
 */

type ApiKeySummary = {
  id: string;
  name: string;
  created_at?: string | null;
  last_used_at?: string | null;
  revoked_at: string | null;
};

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ── Change password ─────────────────────────────────────────────────────── */

export function ChangePasswordCard({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const [lastChanged, setLastChanged] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Better Auth exposes per-provider accounts; the credential account's
    // updatedAt is bumped automatically whenever the password changes, so this
    // is real data rather than a stored "changed at" field we would have to
    // maintain ourselves.
    (async () => {
      try {
        const res = await authClient.listAccounts();
        const credential = res.data?.find(
          (a: { providerId?: string }) => a.providerId === "credential"
        );
        if (cancelled) return;
        setLastChanged(formatDate(credential?.updatedAt));
      } catch {
        if (!cancelled) setLastChanged(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<KeyRound className="h-4.5 w-4.5" />}
        title={t("settings.changePasswordTitle")}
        description={t("settings.changePasswordCardDesc")}
      />
      <SettingsDivider className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("settings.passwordLastChanged")}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {lastChanged ?? (
              <span className="text-muted-foreground">
                {t("settings.passwordLastChangedUnknown")}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/5 px-4 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {t("settings.changePasswordBtn")}
        </button>
      </div>
    </SettingsCard>
  );
}

/* ── Two-factor ──────────────────────────────────────────────────────────── */

export function TwoFactorCard({
  onOpen,
  enabled,
  loading,
}: {
  onOpen: () => void;
  enabled: boolean;
  loading: boolean;
}) {
  const t = useT();

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<ShieldCheck className="h-4.5 w-4.5" />}
        title={t("settings.twoFactorTitle")}
        description={t("settings.twoFactorCardDesc")}
      />
      <SettingsDivider className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("settings.status")}</p>
          <div className="mt-1.5">
            {loading ? (
              <span className="text-sm font-medium text-muted-foreground">…</span>
            ) : enabled ? (
              <SettingsBadge tone="success">
                <StatusDot />
                {t("settings.enabled")}
              </SettingsBadge>
            ) : (
              <SettingsBadge>{t("settings.statusOff")}</SettingsBadge>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/5 px-4 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {t("settings.manageTwoFactor")}
        </button>
      </div>
      {!enabled && !loading ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t("settings.twoFaRecommendation")}
        </p>
      ) : null}
    </SettingsCard>
  );
}

/* ── API keys ────────────────────────────────────────────────────────────── */

export function ApiKeysCard({
  onOpen,
  keys,
  loading,
}: {
  onOpen: () => void;
  keys: ApiKeySummary[];
  loading: boolean;
}) {
  const t = useT();

  const active = keys.filter((k) => !k.revoked_at);
  const lastUsed = active
    .map((k) => k.last_used_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Code2 className="h-4.5 w-4.5" />}
        title={t("settings.apiKeysTitle")}
        description={t("settings.apiKeysCardDesc")}
      />
      <SettingsDivider className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("settings.totalApiKeys")}</p>
          <div className="mt-1.5">
            {loading ? (
              <span className="text-sm font-medium text-muted-foreground">…</span>
            ) : (
              <SettingsBadge tone={active.length > 0 ? "success" : "neutral"}>
                {t("settings.apiKeysCount", { count: active.length })}
              </SettingsBadge>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/5 px-4 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {t("settings.manageApiKeys")}
        </button>
      </div>
      {!loading && active.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SettingsField label={t("settings.lastUsed")}>
            {lastUsed ? formatDate(lastUsed) : t("settings.never")}
          </SettingsField>
          <SettingsField label={t("settings.created")}>
            {formatDate(active[0]?.created_at ?? null) ?? t("settings.unknown")}
          </SettingsField>
        </div>
      ) : null}
    </SettingsCard>
  );
}

/* ── Bank accounts ───────────────────────────────────────────────────────── */

export function BankAccountsCard({
  onOpen,
  count,
  loading,
}: {
  onOpen: () => void;
  count: number;
  loading: boolean;
}) {
  const t = useT();

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Landmark className="h-4.5 w-4.5" />}
        title={t("settings.bankAccountsTitle")}
        description={t("settings.bankAccountsCardDesc")}
      />
      <SettingsDivider className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("settings.totalAccounts")}</p>
          <div className="mt-1.5">
            {loading ? (
              <span className="text-sm font-medium text-muted-foreground">…</span>
            ) : (
              <SettingsBadge tone={count > 0 ? "success" : "neutral"}>
                {t("settings.accountCount", { count })}
              </SettingsBadge>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/5 px-4 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Wallet className="h-3.5 w-3.5" />
          {t("settings.addAccount")}
        </button>
      </div>
    </SettingsCard>
  );
}

/* ── Appearance ──────────────────────────────────────────────────────────── */

export function AppearanceCard({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const { theme } = useThemeStore();

  const themeLabel =
    theme === "dark"
      ? t("settings.themeDarkDefault")
      : theme === "light"
        ? t("settings.themeLight")
        : t("settings.themeSystem");

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Contrast className="h-4.5 w-4.5" />}
        title={t("settings.appearance")}
        description={t("settings.appearanceCardDesc")}
      />
      <SettingsDivider className="my-4" />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("settings.theme")}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{themeLabel}</p>
        </div>
        <span aria-hidden className="shrink-0 text-muted-foreground">
          ›
        </span>
      </button>
    </SettingsCard>
  );
}

/* ── Language ────────────────────────────────────────────────────────────── */

const LOCALES = [
  { code: "id", label: "Indonesia", flag: "🇮🇩" },
  { code: "en", label: "English", flag: "🇬🇧" },
] as const;

export function LanguageCard({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const active = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Languages className="h-4.5 w-4.5" />}
        title={t("settings.language")}
        description={t("settings.languageCardDesc")}
      />
      <SettingsDivider className="my-4" />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("settings.languageLabel")}</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <span aria-hidden className="text-base">{active.flag}</span>
            {active.label}
          </p>
        </div>
        <span aria-hidden className="shrink-0 text-muted-foreground">
          ›
        </span>
      </button>
    </SettingsCard>
  );
}