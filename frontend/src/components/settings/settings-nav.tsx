"use client";

import type { ComponentType } from "react";
import {
  Code2,
  Contrast,
  KeyRound,
  Landmark,
  Languages,
  LockKeyhole,
  ShieldCheck,
  User,
  Bot,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { SettingsBadge, StatusDot } from "./settings-cards";
import { UserAvatar } from "@/components/ui/user-avatar";

/**
 * Section ids for the /settings page.
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
  | "telegram"
  | "appearance"
  | "language";

type NavItem = {
  key: SettingsSectionKey;
  labelKey: string;
  descKey: string;
  /** Leading line icon. Matches the reference design, where every row of the
   *  secondary settings menu carries a muted icon to the left of its label. */
  Icon: ComponentType<{ className?: string }>;
};

/**
 * Order matters: it is the visual order of the secondary nav and also the
 * order in which cards appear on the page.
 */
const NAV_ITEMS: NavItem[] = [
  {
    key: "profile",
    labelKey: "settings.navProfile",
    descKey: "settings.navProfileDesc",
    Icon: User,
  },
  {
    key: "security",
    labelKey: "settings.navChangePassword",
    descKey: "settings.navChangePasswordDesc",
    Icon: LockKeyhole,
  },
  {
    key: "2fa",
    labelKey: "settings.navTwoFactor",
    descKey: "settings.navTwoFactorDesc",
    Icon: ShieldCheck,
  },
  {
    key: "api-keys",
    labelKey: "settings.navApiKeys",
    descKey: "settings.navApiKeysDesc",
    Icon: KeyRound,
  },
  {
    key: "bank-accounts",
    labelKey: "settings.navBankAccounts",
    descKey: "settings.navBankAccountsDesc",
    Icon: Landmark,
  },
  {
    key: "telegram",
    labelKey: "settings.navTelegram",
    descKey: "settings.navTelegramDesc",
    Icon: Bot,
  },
  {
    key: "appearance",
    labelKey: "settings.navAppearance",
    descKey: "settings.navAppearanceDesc",
    Icon: Contrast,
  },
  {
    key: "language",
    labelKey: "settings.navLanguage",
    descKey: "settings.navLanguageDesc",
    Icon: Languages,
  },
];

/** Maps a section id onto the `?tab=` value the wallet + sidebar deep-links use. */
const SECTION_TO_TAB: Partial<Record<SettingsSectionKey, string>> = {
  security: "security",
  "2fa": "2fa",
  "api-keys": "api-keys",
  "bank-accounts": "bank-accounts",
  telegram: "telegram",
  appearance: "appearance",
  language: "language",
};

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

  return (
    <nav aria-label={t("settings.title")} className="space-y-4">
      {/* Identity summary */}
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-3">
          <UserAvatar
            user={user}
            size="lg"
            className="ring-1 ring-border shadow-xs"
          />
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
          const { Icon } = item;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                  isActive
                    ? "bg-primary/10 text-primary dark:text-blue-300 font-semibold border-l-2 border-primary pl-[10px]"
                    : "text-foreground hover:bg-accent/60"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                    isActive
                      ? "bg-primary/15 text-primary dark:text-blue-300"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-semibold",
                      isActive ? "text-primary dark:text-blue-300" : "text-foreground font-medium"
                    )}
                  >
                    {t(item.labelKey)}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-xs leading-relaxed",
                      isActive ? "text-primary/90 dark:text-blue-200/90" : "text-muted-foreground"
                    )}
                  >
                    {t(item.descKey)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { NAV_ITEMS, SECTION_TO_TAB };