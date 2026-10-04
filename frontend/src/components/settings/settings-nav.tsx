"use client";

import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { SettingsBadge, StatusDot } from "./settings-cards";

/**
 * Tab ids for the /settings page.
 *
 * `profile` is a view that has no equivalent tab content of its own — it is the
 * default landing card set. It reuses the change-password tab body, because the
 * reference design shows the profile summary *and* the password card together
 * on first paint rather than hiding the form behind a tab.
 */
export type SettingsSectionKey =
  | "profile"
  | "security"
  | "2fa"
  | "api-keys"
  | "bank-accounts"
  | "appearance"
  | "language";

type NavItem = {
  key: SettingsSectionKey;
  labelKey: string;
  descKey: string;
};

/**
 * Order matters: it is the visual order of the secondary nav and also the
 * order in which cards appear on the page.
 */
const NAV_ITEMS: NavItem[] = [
  { key: "profile", labelKey: "settings.navProfile", descKey: "settings.navProfileDesc" },
  {
    key: "security",
    labelKey: "settings.navChangePassword",
    descKey: "settings.navChangePasswordDesc",
  },
  { key: "2fa", labelKey: "settings.navTwoFactor", descKey: "settings.navTwoFactorDesc" },
  { key: "api-keys", labelKey: "settings.navApiKeys", descKey: "settings.navApiKeysDesc" },
  {
    key: "bank-accounts",
    labelKey: "settings.navBankAccounts",
    descKey: "settings.navBankAccountsDesc",
  },
  { key: "appearance", labelKey: "settings.navAppearance", descKey: "settings.navAppearanceDesc" },
  { key: "language", labelKey: "settings.navLanguage", descKey: "settings.navLanguageDesc" },
];

function initialsOf(name: string | null, email: string): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0] ?? "").join("").toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function SettingsNav({
  active,
  onSelect,
}: {
  active: SettingsSectionKey;
  onSelect: (key: SettingsSectionKey) => void;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);

  const displayName = user?.full_name || user?.email || "";
  const initials = initialsOf(user?.full_name ?? null, user?.email ?? "");

  return (
    <nav aria-label={t("settings.title")} className="space-y-6">
      {/* Identity summary */}
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-sm font-semibold text-primary-foreground"
          >
            {initials || "--"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="mt-4">
          <SettingsBadge tone="success">
            <StatusDot />
            {t("settings.active")}
          </SettingsBadge>
        </div>
      </div>

      {/* Section list */}
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent/60"
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-medium",
                    isActive ? "text-primary" : "text-foreground"
                  )}
                >
                  {t(item.labelKey)}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs leading-relaxed",
                    isActive ? "text-primary/70" : "text-muted-foreground"
                  )}
                >
                  {t(item.descKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { NAV_ITEMS };