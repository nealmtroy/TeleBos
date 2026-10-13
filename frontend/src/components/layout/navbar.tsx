"use client";

import { useAuthStore } from "@/store/auth-store";
import { useAppStore } from "@/store/app-store";
import { useT } from "@/lib/i18n";
import { Menu, Wallet } from "lucide-react";
import Link from "next/link";
import { NotificationCenter } from "@/components/layout/notification-center";
import { UserProfileMenu } from "@/components/layout/user-profile-menu";

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const _ = useT();

  return (
    <header className="h-14 sm:h-16 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-2 sm:px-4 lg:px-6 relative z-30 transition-colors">
      {/* Left: Hamburger */}
      <button
        onClick={toggleSidebar}
        className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors duration-200 active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle Sidebar Navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      {/* Right: Balance → Notification → Avatar */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Balance chip — always visible, compact */}
        <Link
          href="/wallet"
          className="flex items-center gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition-all duration-200 active:scale-95 group"
          title={_("navbar.balance")}
        >
          <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-xs sm:text-[13px] font-bold text-emerald-700 dark:text-emerald-300 font-mono tracking-tight whitespace-nowrap">
            Rp {(user?.balance || 0).toLocaleString("id-ID")}
          </span>
        </Link>

        <NotificationCenter />

        <UserProfileMenu variant="navbar" />
      </div>
    </header>
  );
}
