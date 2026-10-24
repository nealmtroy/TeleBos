"use client";

import { useParams } from "next/navigation";
import { useAccount, useAccountTwoFAStatus, useUploadProfilePhoto, useDeleteProfilePhoto, useUpdateAutoReply } from "@/hooks/use-accounts";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import { ArrowLeft, Camera, Trash2, Loader2, Globe, ShieldCheck, Key, Bell, UserCog, Lock, Users, Phone, MessageSquare, Mail, Pencil, Check, X, Upload, AlertCircle, Info } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useState, useRef, useEffect } from "react";
import api from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const hasAutoReplyAccess =
    user?.role === "pro" || user?.role === "premium" || user?.role === "owner";

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="flex items-start gap-3 border-b border-border pb-5">
        <Link
          href={`/accounts/${id}`}
          aria-label="Back to account"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition shadow-2xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
      {hasAutoReplyAccess && <AutoReplySettings accountId={id} account={account} />}
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

  const hasPhoto = Boolean(
    account?.has_profile_photo ||
    (typeof account?.photo_version === "number" && account.photo_version > 0) ||
    Boolean(account?.profile_photo_path)
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync({ accountId, file });
      toast({
        variant: "success",
        title: _("accountSettings.photoUpdated"),
      });
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("accountSettings.uploadFailed"),
        description: err?.response?.data?.detail || err?.message || _("accountSettings.uploadFailed"),
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeletePhoto() {
    try {
      await deleteMutation.mutateAsync(accountId);
      toast({
        variant: "success",
        title: _("accountSettings.photoDeleted"),
      });
      setDeletePhotoOpen(false);
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("accountSettings.deleteFailed"),
        description: err?.response?.data?.detail || err?.message || _("accountSettings.deleteFailed"),
      });
    }
  }

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
      <div className="mb-4">
        <h2 className="font-semibold text-foreground">{_("accountSettings.profilePhoto")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{_("accountSettings.profileDesc")}</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <AccountAvatar
          accountId={accountId}
          telegramId={account?.telegram_id}
          firstName={account?.first_name}
          phone={account?.phone}
          colorId={account?.color_id}
          hasProfilePhoto={account?.has_profile_photo}
          photoVersion={account?.photo_version}
          isActive={account?.is_active}
          profilePhotoPath={account?.profile_photo_path}
          size="xl"
          className="size-20 text-xl border border-border shadow-xs"
          aria-label="Profile photo"
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={hasPhoto ? "outline" : "default"}
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending || deleteMutation.isPending}
              className="gap-1.5"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hasPhoto ? (
                <Camera className="size-4" />
              ) : (
                <Upload className="size-4" />
              )}
              {hasPhoto ? _("accountSettings.changePhoto") : _("accountSettings.uploadPhoto")}
            </Button>

            {hasPhoto && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeletePhotoOpen(true)}
                disabled={uploadMutation.isPending || deleteMutation.isPending}
                className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {_("accountSettings.deletePhoto")}
              </Button>
            )}
          </div>

          <Label htmlFor="profile-photo-upload" className="sr-only">
            {hasPhoto ? _("accountSettings.changePhoto") : _("accountSettings.uploadPhoto")}
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
          <p id="profile-photo-hint" className="text-xs text-muted-foreground">
            {_("accountSettings.photoHint")}
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={deletePhotoOpen}
        onOpenChange={setDeletePhotoOpen}
        onConfirm={handleDeletePhoto}
        title={_("accountSettings.deletePhoto")}
        message={_("accountSettings.removePhotoConfirm")}
        confirmText={_("accountSettings.deletePhoto")}
        cancelText={_("accountSettings.cancel")}
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Profile Editor ──────────────────────────────────────────────────────────

function ProfileEditor({ accountId, account }: { accountId: string; account: any }) {
  const _ = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(account?.first_name || "");
  const [lastName, setLastName] = useState(account?.last_name || "");
  const [username, setUsername] = useState(account?.username || "");
  const [bio, setBio] = useState(account?.bio || "");

  // Sync state when account data loads/changes while not actively editing
  useEffect(() => {
    if (!isEditing) {
      setFirstName(account?.first_name || "");
      setLastName(account?.last_name || "");
      setUsername(account?.username || "");
      setBio(account?.bio || "");
    }
  }, [account?.first_name, account?.last_name, account?.username, account?.bio, isEditing]);

  const initialUsername = (account?.username || "").replace(/^@+/, "").trim();
  const cleanUsername = username.replace(/^@+/, "").trim();
  const isUsernameChanged = cleanUsername.toLowerCase() !== initialUsername.toLowerCase();

  const [debouncedUsername, setDebouncedUsername] = useState(cleanUsername);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(cleanUsername);
    }, 400);
    return () => clearTimeout(timer);
  }, [cleanUsername]);

  // Client-side instant format validation according to Telegram MTProto rules
  const isTooShort = cleanUsername.length > 0 && cleanUsername.length < 5;
  const isTooLong = cleanUsername.length > 32;
  const startsWithDigit = /^[0-9]/.test(cleanUsername);
  const hasInvalidChars = cleanUsername.length > 0 && !/^[a-zA-Z0-9_]+$/.test(cleanUsername);
  const hasInvalidFormat = cleanUsername.includes("__") || cleanUsername.endsWith("_");
  const isFormatValid =
    cleanUsername.length >= 5 &&
    cleanUsername.length <= 32 &&
    !startsWithDigit &&
    !hasInvalidChars &&
    !hasInvalidFormat;

  const isCheckEligible =
    isEditing &&
    isUsernameChanged &&
    cleanUsername.length > 0 &&
    isFormatValid &&
    debouncedUsername === cleanUsername;

  const checkUsernameQuery = useQuery({
    queryKey: ["check-username", accountId, debouncedUsername],
    queryFn: async () => {
      const res = await api.get(`/accounts/${accountId}/check-username`, {
        params: { username: debouncedUsername },
      });
      return res.data as { available: boolean; reason: string; message: string };
    },
    enabled: isCheckEligible,
    staleTime: 30000,
    retry: false,
  });

  const getUsernameStatus = () => {
    if (!cleanUsername) {
      return initialUsername ? "will_remove" : "empty";
    }
    if (!isUsernameChanged) {
      return "unchanged";
    }
    if (isTooShort) {
      return "too_short";
    }
    if (startsWithDigit) {
      return "starts_with_digit";
    }
    if (hasInvalidChars) {
      return "invalid_chars";
    }
    if (isTooLong || hasInvalidFormat) {
      return "invalid_format";
    }
    if (debouncedUsername !== cleanUsername || checkUsernameQuery.isLoading) {
      return "checking";
    }
    if (checkUsernameQuery.isError) {
      return "error";
    }
    if (checkUsernameQuery.data) {
      if (checkUsernameQuery.data.available) return "available";
      if (checkUsernameQuery.data.reason === "purchase_available") return "purchase_available";
      if (checkUsernameQuery.data.reason === "flood_wait") return "flood_wait";
      return "occupied";
    }
    return "idle";
  };

  const usernameStatus = getUsernameStatus();

  const isUsernameBlocked =
    isUsernameChanged &&
    cleanUsername.length > 0 &&
    (isTooShort ||
      startsWithDigit ||
      hasInvalidChars ||
      isTooLong ||
      hasInvalidFormat ||
      (checkUsernameQuery.data && !checkUsernameQuery.data.available));

  const handleCancel = () => {
    setFirstName(account?.first_name || "");
    setLastName(account?.last_name || "");
    setUsername(account?.username || "");
    setBio(account?.bio || "");
    setIsEditing(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const cleanFirstName = firstName.trim();
      if (!cleanFirstName) {
        throw new Error(_("accountSettings.firstNameRequired"));
      }
      if (isUsernameBlocked) {
        throw new Error(
          usernameStatus === "occupied"
            ? _("accountSettings.usernameOccupied")
            : _("accountSettings.usernameInvalid")
        );
      }
      // Send "" (not null) for a cleared field: null means "leave unchanged"
      // to the backend, so an emptied last name would never be saved.
      await api.put(`/accounts/${accountId}/profile`, {
        first_name: cleanFirstName,
        last_name: lastName.trim(),
        username: cleanUsername,
        bio: bio.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts", accountId] });
      toast({
        variant: "success",
        title: _("accountSettings.profileUpdated"),
      });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast({
        variant: "error",
        title: _("accountSettings.updateFailed"),
        description: err?.response?.data?.detail || err?.message || _("accountSettings.updateFailed"),
      });
    },
  });

  const isSaveDisabled = mutation.isPending || isUsernameBlocked;

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="font-semibold text-foreground">{_("accountSettings.profile")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isEditing ? _("accountSettings.editingProfile") : _("accountSettings.profileDesc")}
          </p>
        </div>
        {!isEditing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5"
          >
            <Pencil className="size-3.5" />
            {_("accountSettings.editProfile")}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={handleCancel}
              className="gap-1.5"
            >
              <X className="size-3.5" />
              {_("accountSettings.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaveDisabled}
              onClick={() => mutation.mutate()}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              {mutation.isPending ? _("accountSettings.saving") : _("accountSettings.save")}
            </Button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">{_("accountSettings.firstName")}</span>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {account?.first_name || <span className="text-muted-foreground font-normal italic">{_("accountSettings.notSet")}</span>}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">{_("accountSettings.lastName")}</span>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {account?.last_name || <span className="text-muted-foreground font-normal italic">{_("accountSettings.notSet")}</span>}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">{_("accountSettings.username")}</span>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {account?.username ? (
                <span className="font-mono text-primary">@{account.username}</span>
              ) : (
                <span className="text-muted-foreground font-normal italic">{_("accountSettings.notSet")}</span>
              )}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">{_("accountSettings.bio")}</span>
            <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
              {account?.bio || <span className="text-muted-foreground italic">{_("accountSettings.notSet")}</span>}
            </p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-first-name" className="text-xs font-medium">
                {_("accountSettings.firstName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="profile-first-name"
                name="first_name"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={mutation.isPending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-last-name" className="text-xs font-medium">
                {_("accountSettings.lastName")}
              </Label>
              <Input
                id="profile-last-name"
                name="last_name"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-username" className="text-xs font-medium">
                {_("accountSettings.username")}
              </Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground text-sm pointer-events-none select-none">
                  @
                </span>
                <Input
                  id="profile-username"
                  name="username"
                  autoComplete="username"
                  className={cn(
                    "pl-7 pr-9 font-mono transition-colors",
                    usernameStatus === "available" && "border-emerald-500/70 focus-visible:ring-emerald-500/30",
                    (usernameStatus === "occupied" || usernameStatus === "starts_with_digit" || usernameStatus === "invalid_chars" || usernameStatus === "invalid_format") && "border-rose-500/70 focus-visible:ring-rose-500/30",
                    (usernameStatus === "too_short" || usernameStatus === "purchase_available" || usernameStatus === "flood_wait") && "border-amber-500/70 focus-visible:ring-amber-500/30"
                  )}
                  value={username.startsWith("@") ? username.slice(1) : username}
                  onChange={(e) => setUsername(e.target.value.replace(/^@+/, ""))}
                  placeholder={_("accountSettings.usernamePlaceholder")}
                  disabled={mutation.isPending}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  {usernameStatus === "checking" && (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  )}
                  {usernameStatus === "available" && (
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                  )}
                  {usernameStatus === "occupied" && (
                    <X className="size-4 text-rose-500 stroke-[2.5]" />
                  )}
                  {(usernameStatus === "too_short" || usernameStatus === "purchase_available" || usernameStatus === "starts_with_digit" || usernameStatus === "invalid_chars" || usernameStatus === "invalid_format" || usernameStatus === "flood_wait") && (
                    <AlertCircle className="size-4 text-amber-500" />
                  )}
                </div>
              </div>

              {/* Real-time username status indicator */}
              <div className="min-h-5 pt-0.5 flex items-center text-[12px] font-medium transition-all">
                {usernameStatus === "checking" && (
                  <span className="flex items-center gap-1.5 text-muted-foreground animate-pulse">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    {_("accountSettings.checkingUsername")}
                  </span>
                )}
                {usernameStatus === "available" && (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <Check className="size-3.5 stroke-[2.5]" />
                    {_("accountSettings.usernameAvailable")}
                  </span>
                )}
                {usernameStatus === "occupied" && (
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
                    <X className="size-3.5 stroke-[2.5]" />
                    {_("accountSettings.usernameOccupied")}
                  </span>
                )}
                {usernameStatus === "purchase_available" && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle className="size-3.5" />
                    {_("accountSettings.usernamePurchaseAvailable")}
                  </span>
                )}
                {usernameStatus === "too_short" && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle className="size-3.5" />
                    {_("accountSettings.usernameTooShort")}
                  </span>
                )}
                {usernameStatus === "starts_with_digit" && (
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="size-3.5" />
                    {_("accountSettings.usernameStartsWithDigit")}
                  </span>
                )}
                {usernameStatus === "invalid_chars" && (
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="size-3.5" />
                    {_("accountSettings.usernameInvalidChars")}
                  </span>
                )}
                {usernameStatus === "invalid_format" && (
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="size-3.5" />
                    {_("accountSettings.usernameInvalid")}
                  </span>
                )}
                {usernameStatus === "flood_wait" && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle className="size-3.5" />
                    {_("accountSettings.usernameFloodWait")}
                  </span>
                )}
                {usernameStatus === "unchanged" && (
                  <span className="flex items-center gap-1.5 text-muted-foreground/80 font-normal">
                    <Check className="size-3.5 text-muted-foreground" />
                    {_("accountSettings.usernameUnchanged")}
                  </span>
                )}
                {usernameStatus === "will_remove" && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-normal">
                    <Info className="size-3.5" />
                    {_("accountSettings.usernameWillBeRemoved")}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-bio" className="text-xs font-medium">
                  {_("accountSettings.bio")}
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {bio.length}/70
                </span>
              </div>
              <Textarea
                id="profile-bio"
                name="bio"
                value={bio}
                maxLength={70}
                rows={2}
                onChange={(e) => setBio(e.target.value)}
                placeholder={_("accountSettings.bioPlaceholder")}
                disabled={mutation.isPending}
                className="resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={handleCancel}
            >
              {_("accountSettings.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSaveDisabled}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {mutation.isPending ? _("accountSettings.saving") : _("accountSettings.save")}
            </Button>
          </div>
        </form>
      )}
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
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="min-w-[140px] h-9 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIVACY_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {_(opt.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
        <h2 className="font-semibold text-foreground mb-4">{_("accountSettings.privacySecurity")}</h2>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
      <h2 className="font-semibold text-foreground mb-4">{_("accountSettings.privacySecurity")}</h2>

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
  const { data: twofa, isLoading } = useAccountTwoFAStatus(accountId);

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

  if (isLoading) return <div className="bg-card rounded-xl border border-border p-6 animate-pulse h-24" />;

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground">{_("accountSettings.twoFactor")}</h2>
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
  const { data: twofa } = useAccountTwoFAStatus(accountId);

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
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
      <h2 className="font-semibold text-foreground mb-4">
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
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-xs">
      <h2 className="font-semibold text-foreground mb-4">{_("accountSettings.autoReply")}</h2>
      <p id="auto-reply-description" className="text-sm text-gray-500 mb-4 max-w-xl">
        {_("accountSettings.autoReplyDesc")}
      </p>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="auto-reply-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-describedby="auto-reply-description"
          />
          <Label htmlFor="auto-reply-enabled" className="text-sm font-normal text-foreground cursor-pointer">
            {enabled ? _("accountSettings.autoReplyOn") : _("accountSettings.autoReplyOff")}
          </Label>
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
