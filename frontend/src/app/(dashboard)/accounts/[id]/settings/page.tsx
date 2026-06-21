"use client";

import { useParams } from "next/navigation";
import { useAccount, getPhotoUrl, useUploadProfilePhoto, useDeleteProfilePhoto, useUpdateAutoReply } from "@/hooks/use-accounts";
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

export default function AccountSettingsPage() {
  const _ = useT();
  const params = useParams();
  const id = params.id as string;
  const { data: account } = useAccount(id);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("accountSettings.title")}</h1>
          <p className="text-sm text-gray-500">
            {account?.first_name || "Account"} — {account?.phone || "Telegram"} {user?.email ? <span className="text-gray-400">· {user.email}</span> : null}
          </p>
        </div>
      </div>

      <PhotoUpload accountId={id} account={account} />
      <ProfileEditor accountId={id} account={account} />
      <AutoReplySettings accountId={id} account={account} />
      <PrivacySettings accountId={id} />
      <LoginEmailSettings accountId={id} />
      <TwoFASettings accountId={id} />
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
  const [msg, setMsg] = useState("");
  const [photoKey, setPhotoKey] = useState(Date.now());
  const [deletePhotoOpen, setDeletePhotoOpen] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync({ accountId, file });
      toast({ variant: "success", description: _("accountSettings.photoUpdated") });
      setPhotoKey(Date.now());
    } catch (err: any) {
      toast({ variant: "error", description: err?.response?.data?.detail || _("accountSettings.uploadFailed") });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeletePhoto() {
    try {
      await deleteMutation.mutateAsync(accountId);
      toast({ variant: "success", description: _("accountSettings.photoDeleted") });
      setPhotoKey(Date.now());
    } catch (err: any) {
      toast({ variant: "error", description: err?.response?.data?.detail || _("accountSettings.deleteFailed") });
    }
  }

  // Try to show photo; fallback to initials on error
  const photoUrl = getPhotoUrl(accountId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.profilePhoto")}</h2>
      <div className="flex items-center gap-6">
        <div className="relative">
          <img
            src={photoUrl}
            alt="Profile"
            className="w-20 h-20 rounded-full object-cover border border-gray-200 bg-gray-100"
            onError={(e) => {
              // Fallback to initials on error (no photo)
              const target = e.currentTarget;
              target.style.display = "none";
              const parent = target.parentElement;
              if (parent) {
                const fallback = parent.querySelector<HTMLDivElement>(".initials-fallback");
                if (fallback) fallback.style.display = "flex";
              }
            }}
            onLoad={(e) => {
              // Photo loaded successfully — hide fallback
              const target = e.currentTarget;
              target.style.display = "block";
              const parent = target.parentElement;
              if (parent) {
                const fallback = parent.querySelector<HTMLDivElement>(".initials-fallback");
                if (fallback) fallback.style.display = "none";
              }
            }}
          />
          <div
            className="initials-fallback w-20 h-20 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xl font-bold border border-gray-200"
            style={{ display: "none" }}
          >
            {(account?.first_name || "T")[0].toUpperCase()}
          </div>
        </div>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-xs text-gray-400">{_("accountSettings.photoHint")}</p>
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
  const [msg, setMsg] = useState("");

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
      setMsg(_("accountSettings.profileUpdated"));
      setTimeout(() => setMsg(""), 3000);
    },
    onError: (err: any) => {
      setMsg(err?.response?.data?.detail || _("accountSettings.updateFailed"));
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{_("accountSettings.profile")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{_("accountSettings.firstName")}</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{_("accountSettings.lastName")}</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{_("accountSettings.username")}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder={_("accountSettings.usernamePlaceholder")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{_("accountSettings.bio")}</label>
          <input
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
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
            className={cn(
              "text-sm",
              msg.startsWith("Profile") ? "text-green-600" : "text-red-500"
            )}
          >
            {msg}
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
  value,
  onChange,
  _,
}: {
  value: string;
  onChange: (value: string) => void;
  _: (key: string, params?: any) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white min-w-[130px]"
    >
      {PRIVACY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {_(opt.label)}
        </option>
      ))}
    </select>
  );
}

function PrivacySettings({ accountId }: { accountId: string }) {
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
                  <span className="text-sm text-gray-700">{_(item.label)}</span>
                  <PrivacySelect
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

function TwoFASettings({ accountId }: { accountId: string }) {
  const _ = useT();
  const qc = useQueryClient();
  const { data: twofa, isLoading } = useQuery<{
    enabled: boolean;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["2fa", accountId] });
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
            twofa?.enabled ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-500"
          )}
        >
          {twofa?.enabled ? _("accountSettings.enabled") : _("accountSettings.disabled")}
        </span>
      </div>

      {!twofa?.enabled ? (
        /* ── Enable 2FA ────────────────────────── */
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={_("accountSettings.new2faPassword")}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <button
            onClick={() => mutation.mutate({ action: "enable", password })}
            disabled={!password || mutation.isPending}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition shrink-0"
          >
            {_("accountSettings.enable2fa")}
          </button>
        </div>
      ) : (
        <>
          {tab === "main" && (
            /* ── Main 2FA actions ──────────────── */
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={_("accountSettings.current2faPassword")}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <button
                  onClick={() => mutation.mutate({ action: "disable", password })}
                  disabled={!password || mutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition shrink-0"
                >
                  {_("accountSettings.disable2fa")}
                </button>
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
                  <label className="text-sm text-gray-700 block mb-1">{_("accountSettings.passwordHint")}</label>
                  <p className="text-sm text-gray-500">{twofa.hint}</p>
                </div>
              )}
            </div>
          )}

          {tab === "change" && (
            /* ── Change Password ───────────────── */
            <div className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={_("accountSettings.current2faPassword")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder={_("accountSettings.newPassword")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder={_("accountSettings.confirmPassword")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
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
                  <input
                    type="text"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    placeholder={_("accountSettings.recoveryCode")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder={_("accountSettings.newPassword")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
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
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={_("accountSettings.current2faPassword")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder={_("accountSettings.recoveryEmailPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
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
                  <input
                    type="text"
                    value={emailConfirmCode}
                    onChange={(e) => setEmailConfirmCode(e.target.value)}
                    placeholder={_("accountSettings.verificationCode")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
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

function LoginEmailSettings({ accountId }: { accountId: string }) {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["2fa", accountId] });
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
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={_("accountSettings.newLoginEmail")}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <button
            onClick={() => sendMutation.mutate(email)}
            disabled={!email || sendMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition shrink-0"
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : _("accountSettings.sendVerificationCode")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Code sent to <strong>{email}</strong>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={_("accountSettings.verificationCode")}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <button
              onClick={() => verifyMutation.mutate()}
              disabled={!code || verifyMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition shrink-0"
            >
              {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : _("accountSettings.verifyEmail")}
            </button>
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
      <p className="text-sm text-gray-500 mb-4">
        {_("accountSettings.autoReplyDesc")}
      </p>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
          <span className="text-sm text-gray-700">
            {enabled ? _("accountSettings.autoReplyOn") : _("accountSettings.autoReplyOff")}
          </span>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">{_("accountSettings.replyMessage")}</label>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={_("accountSettings.replyMessagePlaceholder")}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
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
