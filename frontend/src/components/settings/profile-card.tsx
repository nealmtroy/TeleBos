"use client";

import { useState } from "react";
import { AtSign, CalendarDays, Contact, Pencil, ShieldCheck, UserCog } from "lucide-react";
import { useT } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/store/auth-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SettingsBadge,
  SettingsCard,
  SettingsCardHeader,
  SettingsDivider,
  SettingsField,
  StatusDot,
} from "./settings-cards";

function initialsOf(name: string | null, email: string): string {
  const source = (name ?? "").trim();
  if (source) {
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  superadmin: "Super Admin",
  user: "User",
  reseller: "Reseller",
};

/**
 * Profile card: identity summary plus the fields that actually come from the
 * session. Every value below is read from the auth store / Better Auth — there
 * are no placeholder rows.
 */
export function ProfileCard() {
  const t = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!user) return null;

  const initials = initialsOf(user.full_name, user.email);
  const displayName = user.full_name || user.email;
  const roleLabel = ROLE_LABELS[user.role?.toLowerCase()] ?? user.role;

  function openEditor() {
    setFullName(user?.full_name ?? "");
    setIsEditing(true);
  }

  async function handleSave() {
    const next = fullName.trim();
    if (!next) {
      toast({ title: t("settings.fullNameRequired"), variant: "error" });
      return;
    }

    setIsSaving(true);
    try {
      // Better Auth owns the profile name. The backend databaseHooks.user.update
      // hook mirrors it into the legacy "users" row so /auth/me (and therefore
      // the navbar) reports the new value too.
      const { error } = await authClient.updateUser({ name: next });
      if (error) throw error;

      // Pull the mirrored value from /auth/me instead of patching local state,
      // so what we render is what the backend actually stored.
      await fetchMe();
      toast({ title: t("settings.profileSaved"), variant: "success" });
      setIsEditing(false);
    } catch {
      toast({ title: t("settings.failedSaveProfile"), variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <SettingsCard>
        <SettingsCardHeader
          icon={<UserCog className="h-4.5 w-4.5" />}
          title={t("settings.profile")}
          description={t("settings.profileDesc")}
          action={
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("settings.editProfile")}
            </button>
          }
        />

        <SettingsDivider className="my-4" />

        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-base font-semibold text-primary-foreground"
          >
            {initials || "--"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SettingsBadge tone="success">
                <StatusDot />
                {t("settings.active")}
              </SettingsBadge>
              <SettingsBadge>
                <ShieldCheck className="h-3 w-3" />
                {roleLabel}
              </SettingsBadge>
            </div>
          </div>
        </div>

        <SettingsDivider className="my-4" />

        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label={t("settings.username")}>
            <span className="inline-flex items-center gap-1.5">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
              {user.email.split("@")[0]}
            </span>
          </SettingsField>
          <SettingsField label={t("settings.email")}>
            <span className="inline-flex items-center gap-1.5">
              <Contact className="h-3.5 w-3.5 text-muted-foreground" />
              {user.email}
            </span>
          </SettingsField>
          <SettingsField label={t("settings.role")}>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
              {roleLabel}
            </span>
          </SettingsField>
          <SettingsField label={t("settings.joinedSince")}>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <JoinedSince />
            </span>
          </SettingsField>
        </div>
      </SettingsCard>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.editProfileTitle")}</DialogTitle>
            <DialogDescription>{t("settings.profileDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="settings-full-name" className="text-xs font-medium text-foreground">
              {t("settings.fullName")}
            </label>
            <input
              id="settings-full-name"
              name="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("settings.fullNamePlaceholder")}
              autoFocus
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.email")}: <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {t("settings.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !fullName.trim()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? t("settings.saving") : t("settings.saveChanges")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Renders the signup date from the API when the backend exposes it, and falls
 * back to an explicit "unknown" instead of printing today's date — a wrong date
 * here reads as real account metadata.
 */
function JoinedSince() {
  const t = useT();
  const createdAt = useAuthStore((s) => s.user?.created_at ?? null);

  if (!createdAt) return <span className="text-muted-foreground">{t("settings.unknown")}</span>;

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return <span className="text-muted-foreground">{t("settings.unknown")}</span>;
  }

  return (
    <time dateTime={parsed.toISOString()}>
      {parsed.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}
    </time>
  );
}