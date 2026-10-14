"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useT, useI18nStore } from "@/lib/i18n";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  Crown,
  Star,
  User,
  Clock,
  Wallet,
  Settings,
  LogOut,
  Sliders,
  CalendarClock,
  Sparkles,
  HelpCircle,
  ChevronsUpDown,
  Smartphone,
} from "lucide-react";

export interface UserProfileMenuProps {
  variant?: "sidebar" | "navbar";
  collapsed?: boolean;
  className?: string;
}

export function UserProfileMenu({
  variant = "navbar",
  collapsed = false,
  className,
}: UserProfileMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const isAdminPage = pathname?.startsWith("/admin");
  const userRole = user?.role || "freetrial";

  const roleDisplay = {
    owner: {
      icon: Shield,
      text: "Owner",
      badgeColor: "text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900/50",
    },
    premium: {
      icon: Crown,
      text: "Business",
      badgeColor: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/50",
    },
    pro: {
      icon: Star,
      text: "Pro",
      badgeColor: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-900/50",
    },
    basic: {
      icon: User,
      text: "Starter",
      badgeColor: "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-900 dark:border-slate-800",
    },
    freetrial: {
      icon: Clock,
      text: "Free Trial",
      badgeColor: "text-sky-600 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-900/50",
    },
  };

  const currentRole = roleDisplay[userRole as keyof typeof roleDisplay] || roleDisplay.freetrial;
  const roleText = currentRole.text;

  const planName =
    userRole === "owner"
      ? "Owner Access"
      : userRole === "premium"
      ? "Business Plan"
      : userRole === "pro"
      ? "Pro Plan"
      : userRole === "basic"
      ? "Starter Plan"
      : "Free Trial";

  function confirmLogout() {
    setShowLogoutDialog(false);
    logout();
  }

  // Position and alignment matching shadcn-admin
  const menuSide = variant === "navbar" ? "bottom" : collapsed ? "right" : "top";
  const menuAlign = variant === "navbar" ? "end" : collapsed ? "end" : "start";

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          {variant === "sidebar" ? (
            collapsed ? (
              /* ── Sidebar: Collapsed (Icon Only) ── */
              <button
                type="button"
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg hover:bg-slate-800/80 transition-colors mx-auto data-[state=open]:bg-slate-800 data-[state=open]:text-white",
                  className
                )}
                title={user?.full_name || user?.email || "Profile"}
                aria-label="User Profile Menu"
              >
                <UserAvatar user={user} size="sm" className="h-8 w-8 rounded-lg" />
              </button>
            ) : (
              /* ── Sidebar: Expanded (NavUser style matching shadcn-admin) ── */
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start text-sm hover:bg-slate-800 hover:text-slate-100 transition-colors data-[state=open]:bg-slate-800 data-[state=open]:text-slate-100 outline-none",
                  className
                )}
                aria-label="User Profile Menu"
              >
                <UserAvatar user={user} size="sm" className="h-8 w-8 rounded-lg" />
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user?.full_name || _("navbar.user")}
                  </span>
                  <span className="truncate text-xs text-slate-400">
                    {user?.email || planName}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </button>
            )
          ) : (
            /* ── Navbar: ProfileDropdown style matching shadcn-admin ── */
            <button
              type="button"
              className={cn(
                "relative h-8 w-8 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground",
                className
              )}
              aria-label="User Profile Menu"
            >
              <UserAvatar user={user} size="sm" className="h-8 w-8 rounded-full" />
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={menuSide}
          align={menuAlign}
          sideOffset={variant === "navbar" ? 4 : 8}
          className={cn("w-56 min-w-56 rounded-lg", variant === "sidebar" && "dark bg-slate-900 text-slate-100 border-slate-800")}
        >
          {/* ── 1. Header: Avatar + User Info (matches shadcn-admin) ── */}
          {variant === "sidebar" ? (
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                <UserAvatar user={user} size="sm" className="h-8 w-8 rounded-lg" />
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user?.full_name || _("navbar.user")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email || "user@telebos.com"}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
          ) : (
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm leading-none font-medium">
                  {user?.full_name || _("navbar.user")}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email || "user@telebos.com"}
                </p>
              </div>
            </DropdownMenuLabel>
          )}

            {/* Saldo summary */}
            <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground border-t border-border mt-1 pt-1">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Wallet className="size-3 text-emerald-500 shrink-0" />
                {locale === "id" ? "Saldo" : "Balance"}
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                Rp {(user?.balance || 0).toLocaleString("id-ID")}
              </span>
            </div>

          <DropdownMenuSeparator className="my-1" />

          {/* ── 2. Plan / Upgrade ── */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => router.push("/subscriptions")}
              className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md"
            >
              {userRole === "premium" || userRole === "owner" ? (
                <CalendarClock className="size-4 text-amber-500 shrink-0" />
              ) : (
                <Sparkles className="size-4 text-primary shrink-0" />
              )}
              <span className="flex-1 font-medium">
                {userRole === "premium" || userRole === "owner"
                  ? locale === "id"
                    ? "Status Langganan"
                    : "Subscription"
                  : locale === "id"
                  ? "Tingkatkan Paket"
                  : "Upgrade Plan"}
              </span>
              <Badge variant="outline" className={cn("text-[9px] font-bold uppercase py-0 px-1.5", currentRole.badgeColor)}>
                {roleText}
              </Badge>
            </DropdownMenuItem>

            {userRole === "owner" && (
              <DropdownMenuItem
                onSelect={() => router.push(isAdminPage ? "/dashboard" : "/admin/dashboard")}
                className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md text-rose-600 dark:text-rose-400 focus:text-rose-700 dark:focus:text-rose-300 focus:bg-rose-50 dark:focus:bg-rose-950/40 font-medium"
              >
                <Shield className="size-4 shrink-0" />
                <span>
                  {isAdminPage
                    ? locale === "id"
                    ? "Kembali ke Aplikasi"
                    : "Back to User App"
                    : locale === "id"
                    ? "Panel Admin"
                    : "Admin Panel"}
                </span>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1" />

          {/* ── 3. Quick Links ── */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => router.push("/accounts")}
              className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md"
            >
              <Smartphone className="size-4 text-muted-foreground shrink-0" />
              <span>{locale === "id" ? "Kelola Akun Telegram" : "Telegram Accounts"}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => router.push("/settings?tab=appearance")}
              className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md"
            >
              <Sliders className="size-4 text-muted-foreground shrink-0" />
              <span>{locale === "id" ? "Personalisasi Tema" : "Personalization"}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => router.push("/settings")}
              className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md"
            >
              <Settings className="size-4 text-muted-foreground shrink-0" />
              <span>{_("navbar.settings") || "Pengaturan & Profil"}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => router.push("/help")}
              className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md"
            >
              <HelpCircle className="size-4 text-muted-foreground shrink-0" />
              <span>{locale === "id" ? "Pusat Bantuan" : "Help & Policies"}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1" />

          {/* ── 4. Sign out ── */}
          <DropdownMenuItem
            onSelect={() => setShowLogoutDialog(true)}
            className="cursor-pointer gap-2 px-2 py-1.5 text-xs rounded-md text-rose-600 dark:text-rose-400 focus:text-rose-700 dark:focus:text-rose-300 focus:bg-rose-50 dark:focus:bg-rose-950/40 font-semibold"
          >
            <LogOut className="size-4 text-rose-500 shrink-0" />
            <span>{_("navbar.logout") || "Keluar"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={showLogoutDialog}
        onOpenChange={setShowLogoutDialog}
        onConfirm={confirmLogout}
        title={_("navbar.logoutTitle")}
        message={_("navbar.logoutConfirm")}
        confirmText={_("navbar.yesLogout")}
        cancelText={_("navbar.cancel")}
        variant="danger"
      />
    </>
  );
}
