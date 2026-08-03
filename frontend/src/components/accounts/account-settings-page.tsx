"use client";

import { useParams } from "next/navigation";
import { useAccount, useUploadProfilePhoto, useDeleteProfilePhoto, useUpdateAutoReply } from "@/hooks/use-accounts";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import { ArrowLeft, Camera, Trash2, Loader2, Globe, ShieldCheck, Key, Bell, UserCog, Lock, Users, Phone, MessageSquare, Mail } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useState, useRef, useEffect } from "react";
import api from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  invalidateTwoFAAccountQueries,
  synchronizeAccountTwoFAStatus,
} from "@/app/(dashboard)/accounts/[id]/settings/two-fa-settings";

export default function AccountSettingsPage() {
  const _ = useT();
  const params = useParams();
  const id = params.id as string;
  const { data: account } = useAccount(id);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="flex items-start gap-3 border-b border-border pb-5">
        <Link
          href={`/accounts/${id}`}
          aria-label="Back to account"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
            {_("accountSettings.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account?.first_name || "Account"} · {account?.phone || "Telegram"}
            {user?.email ? <span> · {user.email}</span> : null}
          </p>
        </div>
      </header>

      <PhotoUpload accountId={id} account={account} />
      <ProfileEditor accountId={id} account={account} />
      <AutoReplySettings accountId={id} account={account} />
      <DeleteContacts accountId={id} />
    </div>
  );
}

// ── Photo Upload ──────────────────────────────────────────────────────────

function PhotoUpload({ accountId, account }: { accountId: string; account: any }) {
  const _ = useT();
  const { toast } = useToast();
  const uploadMutation = useUploadProfilePhoto();
  const deleteMutation = useDeleteProfilePhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletePhotoOpen, setDeletePhotoOpen] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync({ accountId, file });
      toast({ variant: "success", description: _("accountSettings.photoUpdated") });
    } catch (err: any) {
      toast({ variant: "error", description: err?.response?.data?.detail || _("accountSettings.uploadFailed") });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeletePhoto() {
    try {
      await deleteMutation.mutateAsync(accountId);
      toast({ variant: "success", description: _("accountSettings.photoDeleted") });
    } catch (err: any) {
      toast({ variant: "error", description: err?.response?.data?.detail || _("accountSettings.deleteFailed") });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.profilePhoto")}</h2>
      <div className="flex items-center gap-6">
        <AccountAvatar
          accountId={accountId}
          telegramId={account?.telegram_id}
          firstName={account?.first_name}
          phone={account?.phone}
          colorId={account?.color_id}
          hasProfilePhoto={account?.has_profile_photo}
          photoVersion={account?.photo_version}
          size="xl"
          className="size-20 text-xl border border-gray-200"
          aria-label="Profile photo"
        />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {_("accountSettings.changePhoto")}
            </button>
            <button
              onClick={() => setDeletePhotoOpen(true)}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
            >
              <Trash2 className="h-4 w-4" />
              {_("accountSettings.delete")}
            </button>
          </div>
          <Label htmlFor="profile-photo-upload" className="sr-only">
            {_("accountSettings.changePhoto")}
          </Label>
          <input
            id="profile-photo-upload"
            name="profile_photo"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            aria-describedby="profile-photo-hint"
            className="sr-only"
          />
          <p id="profile-photo-hint" className="text-xs text-muted-foreground">{_("accountSettings.photoHint")}</p>
        </div>
      </div>

      <ConfirmDialog
        open={deletePhotoOpen}
        onOpenChange={setDeletePhotoOpen}
        onConfirm={handleDeletePhoto}
        title={_("accountSettings.delete")}
        message={_("accountSettings.removePhotoConfirm")}
        confirmText={_("accountSettings.delete")}
        cancelText={_("navbar.cancel")}
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Profile Editor ──────────────────────────────────────────────────────────

function ProfileEditor({ accountId, account }: { accountId: string; account: any }) {
  const _ = useT();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(account?.first_name || "");
  const [lastName, setLastName] = useState(account?.last_name || "");
  const [username, setUsername] = useState(account?.username || "");
  const [bio, setBio] = useState(account?.bio || "");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Sync state when account data loads/changes
  useEffect(() => {
    setFirstName(account?.first_name || "");
    setLastName(account?.last_name || "");
    setUsername(account?.username || "");
    setBio(account?.bio || "");
  }, [account?.first_name, account?.last_name, account?.username, account?.bio]);

  const mutation = useMutation({
    mutationFn: async () => {
      await api.put(`/accounts/${accountId}/profile`, {
        first_name: firstName || null,
        last_name: lastName || null,
        username: username || null,
        bio: bio || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setMsg({ kind: "success", text: _("accountSettings.profileUpdated") });
      setTimeout(() => setMsg(null), 3000);
    },
    onError: (err: any) => {
      setMsg({ kind: "error", text: err?.response?.data?.detail || _("accountSettings.updateFailed") });
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.profile")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="profile-first-name">{_("accountSettings.firstName")}</Label>
          <Input
            id="profile-first-name"
            name="first_name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-last-name">{_("accountSettings.lastName")}</Label>
          <Input
            id="profile-last-name"
            name="last_name"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-username">{_("accountSettings.username")}</Label>
          <Input
            id="profile-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={_("accountSettings.usernamePlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-bio">{_("accountSettings.bio")}</Label>
          <Input
            id="profile-bio"
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
        >
          {mutation.isPending ? _("accountSettings.saving") : _("accountSettings.save")}
        </button>
        {msg && (
          <span
            role={msg.kind === "error" ? "alert" : "status"}
            aria-live={msg.kind === "error" ? "assertive" : "polite"}
            className={cn("text-sm", msg.kind === "success" ? "text-green-600" : "text-red-500")}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Privacy Settings ────────────────────────────────────────────────────────

const PRIVACY_GROUPS = [
  {
    title: "accountSettings.whoCanSee",
    icon: Globe,
    items: [
      { key: "last_seen", label: "accountSettings.lastSeen" },
      { key: "profile_photo", label: "accountSettings.photoPrivacy" },
      { key: "bio", label: "accountSettings.bioPrivacy" },
      { key: "birthday", label: "accountSettings.birthday" },
    ],
  },
  {
    title: "accountSettings.whoCanContact",
    icon: Phone,
    items: [
      { key: "phone_number", label: "accountSettings.phoneNumber" },
      { key: "phone_call", label: "accountSettings.whoCanCall" },
      { key: "chat_invite", label: "accountSettings.whoCanAddGroups" },
      { key: "added_by_phone", label: "accountSettings.whoCanFindByPhone" },
    ],
  },
  {
    title: "accountSettings.messagesForwarding",
    icon: MessageSquare,
    items: [
      { key: "forwards", label: "accountSettings.whoCanForward" },
      { key: "voice_messages", label: "accountSettings.whoCanSendVoice" },
    ],
  },
];

const PRIVACY_OPTIONS = [
  { value: "everybody", label: "accountSettings.everybody" },
  { value: "contacts", label: "accountSettings.myContacts" },
  { value: "close_friends", label: "accountSettings.closeFriends" },
  { value: "nobody", label: "accountSettings.nobody" },
];

function PrivacySelect({
  id,
  name,
  value,
  onChange,
  _,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  _: (key: string, params?: any) => string;
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-[130px] rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {PRIVACY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {_(opt.label)}
        </option>
      ))}
    </select>
  );
}

export function PrivacySettings({ accountId }: { accountId: string }) {
  const _ = useT();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: privacy, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["privacy", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/privacy`);
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      await api.put(`/accounts/${accountId}/privacy`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privacy", accountId] });
    },
  });

  function handleChange(key: string, value: string) {
    setDirty((prev) => ({ ...prev, [key]: value }));
  }

  function getValue(key: string): string {
    if (key in dirty) return dirty[key];
    return (privacy as any)?.[key] || "everybody";
  }

  function isDirty(): boolean {
    return Object.keys(dirty).length > 0;
  }

  async function handleSave() {
    if (!isDirty()) return;
    setSaving(true);
    setMsg("");
    try {
      await mutation.mutateAsync(dirty);
      setDirty({});
      setMsg(_("accountSettings.privacyUpdated"));
      setTimeout(() => setMsg(""), 3000);
    } catch (err: any) {
      setMsg(err?.response?.data?.detail || _("accountSettings.actionFailed"));
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.privacySecurity")}</h2>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.privacySecurity")}</h2>

      <div className="space-y-6">
        {PRIVACY_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="flex items-center gap-2 mb-3">
              <group.icon className="h-4 w-4 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {_(group.title)}
              </h3>
            </div>
            <div className="space-y-3 pl-6">
              {group.items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-1"
                >
                  <Label htmlFor={`privacy-${item.key}`} className="text-sm font-normal text-foreground">
                    {_(item.label)}
                  </Label>
                  <PrivacySelect
                    id={`privacy-${item.key}`}
                    name={`privacy_${item.key}`}
                    value={getValue(item.key)}
                    onChange={(v) => handleChange(item.key, v)}
                    _={_}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty() || saving}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
        >
          {saving ? _("accountSettings.saving") : _("accountSettings.savePrivacy")}
        </button>
        {isDirty() && !saving && (
          <span className="text-xs text-amber-600">
            {_("accountSettings.unsavedChanges", { count: Object.keys(dirty).length })}
          </span>
        )}
        {msg && (
          <span
            className={cn(
              "text-sm",
              msg.includes("updated") ? "text-green-600" : "text-red-500"
            )}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 2FA Settings ────────────────────────────────────────────────────────────

export function TwoFASettings({ accountId }: { accountId: string }) {
  const _ = useT();
  const qc = useQueryClient();
  const { data: twofa, isLoading } = useQuery<{
    enabled: boolean;
    live_checked: boolean;
    has_recovery: boolean | null;
    hint: string | null;
    login_email_pattern: string | null;
    unconfirmed_email_pattern: string | null;
  }>({
    queryKey: ["2fa", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/2fa`);
      return data;
    },
  });

  useEffect(() => {
    if (twofa) {
      synchronizeAccountTwoFAStatus(qc, accountId, twofa.enabled, twofa.live_checked);
    }
  }, [accountId, qc, twofa]);

  const [password, setPassword] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [emailConfirmCode, setEmailConfirmCode] = useState("");
  const [emailNeedsConfirm, setEmailNeedsConfirm] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [msg, setMsg] = useState("");

  // Tab: "main" | "change" | "forgot" | "recovery"
  const [tab, setTab] = useState<"main" | "change" | "forgot" | "recovery">("main");

  function resetMsg() { setTimeout(() => setMsg(""), 3000); }

  const mutation = useMutation({
    mutationFn: async (opts: { action: string; [k: string]: any }) => {
      const a = opts;
      switch (a.action) {
        case "enable":
          await api.post(`/accounts/${accountId}/2fa/enable`, { password: a.password });
          break;
        case "disable":
          await api.post(`/accounts/${accountId}/2fa/disable`, { password: a.password });
          setPassword("");
          break;
        case "change-password":
          await api.post(`/accounts/${accountId}/2fa/change-password`, {
            old_password: a.old_password,
            new_password: a.new_password,
          });
          setPassword(""); setNewPass(""); setConfirmPass("");
          setTab("main");
          break;
        case "request-recovery":
          const { data } = await api.post(`/accounts/${accountId}/2fa/request-recovery`);
          setRecoverySent(true);
          return data;
        case "recover":
          await api.post(`/accounts/${accountId}/2fa/recover`, {
            recovery_code: a.recovery_code,
            new_password: a.new_password,
          });
          setNewPass(""); setRecoveryCode(""); setTab("main");
          break;
        case "recovery-email":
          const res = await api.post(`/accounts/${accountId}/2fa/email`, { password: a.password, email: a.email });
          setPassword("");
          setRecoveryEmail("");
          if (res.data.needs_confirmation) {
            setEmailNeedsConfirm(true);
            setMsg("Confirmation code sent to your email. Please check and enter it below.");
          } else {
            setEmailNeedsConfirm(false);
            setTab("main");
          }
          break;
        case "confirm-email":
          await api.post(`/accounts/${accountId}/2fa/email/confirm`, { code: a.code });
          setEmailConfirmCode("");
          setEmailNeedsConfirm(false);
          setTab("main");
          break;
      }
    },
    onSuccess: async () => {
      await invalidateTwoFAAccountQueries(qc, accountId);
      setMsg(_("accountSettings.done"));
      resetMsg();
    },
    onError: (err: any) => {
      setMsg(err?.response?.data?.detail || _("accountSettings.actionFailed"));
      resetMsg();
    },
  });

  if (isLoading) return <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse h-24" />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">{_("accountSettings.twoFactor")}</h2>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            twofa?.enabled ? "bg-primary-600 text-white" : "border border-gray-300 bg-white text-gray-700"
          )}
        >
          {twofa?.enabled ? _("accountSettings.enabled") : _("accountSettings.disabled")}
        </span>
      </div>

      {!twofa?.enabled ? (
        /* ── Enable 2FA ────────────────────────── */
        <div className="space-y-1.5">
          <Label htmlFor="twofa-enable-password">{_("accountSettings.new2faPassword")}</Label>
          <div className="flex gap-2">
            <Input
              id="twofa-enable-password"
              name="twofa_enable_password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1"
            />
            <button
              onClick={() => mutation.mutate({ action: "enable", password })}
              disabled={!password || mutation.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition shrink-0"
            >
              {_("accountSettings.enable2fa")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {tab === "main" && (
            /* ── Main 2FA actions ──────────────── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="twofa-disable-password">{_("accountSettings.current2faPassword")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="twofa-disable-password"
                    name="twofa_disable_password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1"
                  />
                  <button
                    onClick={() => mutation.mutate({ action: "disable", password })}
                    disabled={!password || mutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition shrink-0"
                  >
                    {_("accountSettings.disable2fa")}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setTab("change"); setMsg(""); }}
                  className="text-sm text-primary-600 hover:underline"
                >
                  {_("accountSettings.change2faPassword")}
                </button>
                {twofa?.has_recovery && (
                  <button
                    onClick={() => { setTab("forgot"); setRecoverySent(false); setMsg(""); }}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {_("accountSettings.forgotPassword")}
                  </button>
                )}
                <button
                  onClick={() => { setTab("recovery"); setMsg(""); }}
                  className="text-sm text-primary-600 hover:underline"
                >
                  {_("accountSettings.recoveryEmail")}
                </button>
              </div>

              {twofa?.hint && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="mb-1 text-sm font-medium text-foreground">{_("accountSettings.passwordHint")}</p>
                  <p className="text-sm text-gray-500">{twofa.hint}</p>
                </div>
              )}
            </div>
          )}

          {tab === "change" && (
            /* ── Change Password ───────────────── */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="twofa-change-current-password">{_("accountSettings.current2faPassword")}</Label>
                <Input id="twofa-change-current-password" name="twofa_current_password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="twofa-change-new-password">{_("accountSettings.newPassword")}</Label>
                <Input id="twofa-change-new-password" name="twofa_new_password" type="password" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="twofa-change-confirm-password">{_("accountSettings.confirmPassword")}</Label>
                <Input id="twofa-change-confirm-password" name="twofa_confirm_password" type="password" autoComplete="new-password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (newPass !== confirmPass) { setMsg(_("accountSettings.passwordsDontMatch")); return; }
                    mutation.mutate({ action: "change-password", old_password: password, new_password: newPass });
                  }}
                  disabled={!password || !newPass || !confirmPass || mutation.isPending}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
                >
                  {_("accountSettings.changePassword")}
                </button>
                <button onClick={() => setTab("main")} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {tab === "forgot" && (
            /* ── Forgot Password / Recovery ───── */
            <div className="space-y-3">
              {!recoverySent ? (
                <div>
                  <p className="text-sm text-gray-500 mb-3">
                    {_("accountSettings.recoveryInfo")}
                  </p>
                  <button
                    onClick={() => mutation.mutate({ action: "request-recovery" })}
                    disabled={mutation.isPending}
                    className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
                  >
                    {mutation.isPending ? _("accountSettings.saving") : _("accountSettings.requestRecovery")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="twofa-recovery-code">{_("accountSettings.recoveryCode")}</Label>
                    <Input id="twofa-recovery-code" name="twofa_recovery_code" type="text" autoComplete="one-time-code" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="twofa-recovery-new-password">{_("accountSettings.newPassword")}</Label>
                    <Input id="twofa-recovery-new-password" name="twofa_recovery_new_password" type="password" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => mutation.mutate({ action: "recover", recovery_code: recoveryCode, new_password: newPass })}
                      disabled={!recoveryCode || !newPass || mutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition"
                    >
                      {_("accountSettings.recover")}
                    </button>
                    <button onClick={() => { setTab("main"); setRecoverySent(false); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "recovery" && (
            /* ── Recovery Email ────────────────── */
            <div className="space-y-3">
              {!emailNeedsConfirm ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="twofa-recovery-email-password">{_("accountSettings.current2faPassword")}</Label>
                    <Input id="twofa-recovery-email-password" name="twofa_recovery_email_password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="twofa-recovery-email">{_("accountSettings.recoveryEmail")}</Label>
                    <Input id="twofa-recovery-email" name="twofa_recovery_email" type="email" autoComplete="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder={_("accountSettings.recoveryEmailPlaceholder")} />
                  </div>
                  {twofa?.unconfirmed_email_pattern && (
                    <p className="text-xs text-amber-600">
                      {twofa.unconfirmed_email_pattern} — {_("accountSettings.waitingConfirmation")}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => mutation.mutate({ action: "recovery-email", password, email: recoveryEmail })}
                      disabled={!password || !recoveryEmail || mutation.isPending}
                      className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
                    >
                      {_("accountSettings.setEmail")}
                    </button>
                    <button onClick={() => setTab("main")} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    {_("accountSettings.recoveryEmailConfirmInfo")}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="twofa-recovery-email-confirmation-code">{_("accountSettings.verificationCode")}</Label>
                    <Input id="twofa-recovery-email-confirmation-code" name="twofa_recovery_email_confirmation_code" type="text" autoComplete="one-time-code" value={emailConfirmCode} onChange={(e) => setEmailConfirmCode(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => mutation.mutate({ action: "confirm-email", code: emailConfirmCode })}
                      disabled={!emailConfirmCode || mutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition"
                    >
                      {_("accountSettings.verifyEmail")}
                    </button>
                    <button
                      onClick={() => { setEmailNeedsConfirm(false); setEmailConfirmCode(""); }}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {msg && (
        <p className={cn("text-sm mt-3", msg === _("accountSettings.done") ? "text-green-600" : "text-red-500")}>
          {msg}
        </p>
      )}
    </div>
  );
}


// ── Login Email (separate from 2FA) ────────────────────────────────────────

export function LoginEmailSettings({ accountId }: { accountId: string }) {
  const _ = useT();
  const qc = useQueryClient();
  const { data: twofa } = useQuery<{ login_email_pattern: string | null }>({
    queryKey: ["2fa", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/2fa`);
      return data;
    },
  });

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "code-sent">("idle");
  const [msg, setMsg] = useState("");

  const sendMutation = useMutation({
    mutationFn: async (email: string) => {
      await api.post(`/accounts/${accountId}/login-email/send-code`, { email });
    },
    onSuccess: () => {
      setStep("code-sent");
      setMsg("Verification code sent! Check your email.");
      setTimeout(() => setMsg(""), 5000);
    },
    onError: (err: any) => {
      setMsg(err?.response?.data?.detail || _("accountSettings.actionFailed"));
      setTimeout(() => setMsg(""), 3000);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/accounts/${accountId}/login-email/verify`, { email, code });
    },
    onSuccess: async () => {
      await invalidateTwoFAAccountQueries(qc, accountId);
      setMsg(_("accountSettings.done"));
      setEmail("");
      setCode("");
      setStep("idle");
      setTimeout(() => setMsg(""), 3000);
    },
    onError: (err: any) => {
      setMsg(err?.response?.data?.detail || _("accountSettings.actionFailed"));
      setTimeout(() => setMsg(""), 3000);
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">
        <span className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          {_("accountSettings.loginEmail")}
        </span>
      </h2>

      {twofa?.login_email_pattern && (
        <div className="mb-3">
          <p className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
            {twofa.login_email_pattern}
          </p>
          <p className="text-xs text-gray-400 mt-1">{_("accountSettings.loginEmailDesc")}</p>
        </div>
      )}

      <p className="text-sm text-gray-500 mb-3">{_("accountSettings.changeLoginEmailDesc")}</p>

      {step === "idle" ? (
        <div className="space-y-1.5">
          <Label htmlFor="login-email">{_("accountSettings.newLoginEmail")}</Label>
          <div className="flex gap-2">
            <Input
              id="login-email"
              name="login_email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <button
              onClick={() => sendMutation.mutate(email)}
              disabled={!email || sendMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition shrink-0"
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : _("accountSettings.sendVerificationCode")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Code sent to <strong>{email}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="login-email-verification-code">{_("accountSettings.verificationCode")}</Label>
            <div className="flex gap-2">
              <Input
                id="login-email-verification-code"
                name="login_email_verification_code"
                type="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1"
              />
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={!code || verifyMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition shrink-0"
              >
                {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : _("accountSettings.verifyEmail")}
              </button>
            </div>
          </div>
          <button
            onClick={() => { setStep("idle"); setEmail(""); setCode(""); }}
            className="text-sm text-gray-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      {msg && (
        <p className={cn("text-sm mt-2", msg.endsWith("done") ? "text-green-600" : "text-red-500")}>
          {msg}
        </p>
      )}
    </div>
  );
}

// ── Auto-Reply (Welcome Message) ─────────────────────────────────────────

function AutoReplySettings({ accountId, account }: { accountId: string; account: any }) {
  const _ = useT();
  const [enabled, setEnabled] = useState(account?.auto_reply_enabled ?? false);
  const [replyText, setReplyText] = useState(account?.auto_reply_text ?? "");
  const [msg, setMsg] = useState("");

  const mutation = useUpdateAutoReply();

  // Sync state when account data loads/changes
  useEffect(() => {
    setEnabled(account?.auto_reply_enabled ?? false);
    setReplyText(account?.auto_reply_text ?? "");
  }, [account?.auto_reply_enabled, account?.auto_reply_text]);

  async function handleSave() {
    try {
      await mutation.mutateAsync({
        accountId,
        auto_reply_enabled: enabled,
        auto_reply_text: replyText.trim() || null,
      });
      setMsg(_("accountSettings.autoReplySaved"));
      setTimeout(() => setMsg(""), 3000);
    } catch (err: any) {
      setMsg(err?.response?.data?.detail || "Failed");
      setTimeout(() => setMsg(""), 3000);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.autoReply")}</h2>
      <p id="auto-reply-description" className="text-sm text-gray-500 mb-4">
        {_("accountSettings.autoReplyDesc")}
      </p>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Label htmlFor="auto-reply-enabled" className="relative inline-flex cursor-pointer items-center">
            <input
              id="auto-reply-enabled"
              name="auto_reply_enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-describedby="auto-reply-description"
              className="peer sr-only"
            />
            <span className="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-checked:after:translate-x-full after:absolute after:start-0.5 after:size-5 after:rounded-full after:border after:border-border after:bg-background after:transition-transform" />
            <span className="sr-only">{_("accountSettings.autoReply")}</span>
          </Label>
          <span className="text-sm text-foreground">
            {enabled ? _("accountSettings.autoReplyOn") : _("accountSettings.autoReplyOff")}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auto-reply-text">{_("accountSettings.replyMessage")}</Label>
          <Textarea
            id="auto-reply-text"
            name="auto_reply_text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={_("accountSettings.replyMessagePlaceholder")}
            rows={4}
            className="resize-none"
            disabled={!enabled}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={mutation.isPending || (enabled && !replyText.trim())}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition"
          >
            {mutation.isPending ? _("accountSettings.saving") : _("accountSettings.save")}
          </button>
          {msg && (
            <span
              className={cn(
                "text-sm",
                msg.includes("saved") ? "text-green-600" : "text-red-500"
              )}
            >
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete Synced Contacts ──────────────────────────────────────────────────

function DeleteContacts({ accountId }: { accountId: string }) {
  const _ = useT();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await api.post(`/accounts/${accountId}/sync-contacts`);
      toast({ variant: "success", description: _("accountSettings.contactsDeleted") });
    } catch (err: any) {
      toast({ variant: "error", description: err?.response?.data?.detail || "Failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h3 className="font-semibold text-red-600">{_("accountSettings.deleteContacts")}</h3>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        {_("accountSettings.deleteContactsDesc")}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-red-300 transition"
        >
          {loading ? _("accountSettings.deleting") : _("accountSettings.deleteAllContacts")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleDelete}
        title={_("accountSettings.deleteContacts")}
        message={_("accountSettings.contactsDeleteConfirm")}
        confirmText={_("accountSettings.deleteAllContacts")}
        cancelText={_("navbar.cancel")}
        variant="danger"
        loading={loading}
      />
    </div>
  );
}
