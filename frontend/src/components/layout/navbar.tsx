"use client";

import { useAuthStore } from "@/store/auth-store";
import { useAppStore } from "@/store/app-store";
import { useT } from "@/lib/i18n";
import { Menu, LogOut, ChevronDown, Settings, Wallet, Crown, Shield, Star, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const _ = useT();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [animating, setAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "U";

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleProfileToggle() {
    if (profileOpen) {
      setAnimating(false);
      setTimeout(() => setProfileOpen(false), 200);
    } else {
      setProfileOpen(true);
      requestAnimationFrame(() => setAnimating(true));
    }
  }

  function handleCloseDropdown() {
    setAnimating(false);
    setTimeout(() => setProfileOpen(false), 200);
  }

  function handleSettings() {
    handleCloseDropdown();
    router.push("/settings");
  }

  function handleLogoutClick() {
    handleCloseDropdown();
    setTimeout(() => setShowLogoutDialog(true), 150);
  }

  function confirmLogout() {
    setShowLogoutDialog(false);
    logout();
  }

  // Role details mapping
  const roleDisplay = {
    owner: { icon: Shield, text: "Owner", color: "text-rose-600 bg-rose-100 border-rose-200" },
    premium: { icon: Crown, text: "Premium", color: "text-amber-600 bg-amber-100 border-amber-200" },
    pro: { icon: Star, text: "Pro", color: "text-blue-600 bg-blue-100 border-blue-200" },
    basic: { icon: User, text: "Basic", color: "text-slate-600 bg-slate-100 border-slate-200" },
  };
  const userRole = user?.role || "basic";
  const RoleIcon = roleDisplay[userRole as keyof typeof roleDisplay]?.icon || User;
  const roleColor = roleDisplay[userRole as keyof typeof roleDisplay]?.color || roleDisplay.basic.color;
  const roleText = roleDisplay[userRole as keyof typeof roleDisplay]?.text || "Basic";

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 relative z-30">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors duration-200 active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex-1" />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Profile section */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleProfileToggle}
            className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-all duration-200 active:scale-95"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">
                {user?.full_name || _("navbar.user")}
              </p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-medium shadow-sm transition-transform duration-200 group-hover:scale-105">
              {initials}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-gray-400 transition-transform duration-200",
                animating && "rotate-180"
              )}
            />
          </button>

          {/* Dropdown menu */}
          {profileOpen && (
            <div
              className={cn(
                "absolute right-0 top-full mt-2 z-50 w-56 bg-white rounded-xl border border-gray-200 shadow-lg py-1.5 overflow-hidden",
                animating
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 -translate-y-2 scale-95"
              )}
              style={{
                transition:
                  "opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                transformOrigin: "top right",
              }}
            >
              {/* Profile header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-medium shadow-sm">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user?.full_name || _("navbar.user")}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user?.email}
                    </p>
                  </div>
                </div>
                {/* Role Badge */}
                <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide", roleColor)}>
                  <RoleIcon className="h-3 w-3" />
                  {roleText}
                </div>
              </div>

              {/* Balance display */}
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-emerald-700 font-medium">
                    Balance: <span className="font-bold">{(user?.balance || 0).toLocaleString()}</span>
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={handleSettings}
                  className="flex items-center gap-3 px-4 py-2.5 w-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-150 group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 group-hover:bg-primary-50 group-hover:text-primary-600 transition-all duration-200">
                    <Settings className="h-4 w-4" />
                  </div>
                  <span>{_("navbar.settings")}</span>
                  <span className="ml-auto text-xs text-gray-400">⌘,</span>
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Logout */}
              <div className="py-1">
                <button
                  onClick={handleLogoutClick}
                  className="flex items-center gap-3 px-4 py-2.5 w-full text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors duration-150 group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-50 text-rose-500 group-hover:bg-rose-100 transition-all duration-200">
                    <LogOut className="h-4 w-4" />
                  </div>
                  <span>{_("navbar.logout")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

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
