"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useT, useI18nStore } from "@/lib/i18n";
import {
  LayoutDashboard,
  Smartphone,
  Search,
  MessageSquare,
  Send,
  Radio,
  ClipboardList,
  Clock,
  X,
  ChevronDown,
  Plus,
  Users,
  FileText,
  MessageCircleReply,
  Bot,
  UserPlus,
  HelpCircle,
  BookOpen,
  LifeBuoy,
  ShoppingCart,
  Shield,
  Package,
  BarChart3,
  Hash,
  Crown,
  Tag,
  Ticket,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  Wallet,
  Star,
  User,
  Eye,
  Sparkles,
  CalendarClock,
  Check,
  Info,
  Bug,
  Keyboard,
  Sliders,
  ArrowLeft,
  ArrowRight,
  Repeat,
  TrendingUp,
  Activity,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BrandLogo } from "@/components/ui/brand-logo";
import { UserProfileMenu } from "@/components/layout/user-profile-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface SubItem {
  href: string;
  labelKey: string;
  icon: any;
  exact?: boolean;
  minRole?: number;
}

const broadcastSubItems: SubItem[] = [
  { href: "/broadcast/new", labelKey: "nav.newBroadcast", icon: Plus },
  { href: "/broadcast/history", labelKey: "nav.broadcastHistory", icon: Clock },
  { href: "/broadcast/logs", labelKey: "nav.broadcastLogs", icon: ClipboardList },
];

const inviteSubItems: SubItem[] = [
  { href: "/invite", labelKey: "invite.newInvite", icon: Plus, exact: true },
  { href: "/invite/history", labelKey: "invite.inviteHistory", icon: Clock },
  { href: "/invite/logs", labelKey: "invite.inviteLogs", icon: ClipboardList },
];

const groupsChannelsSubItems: SubItem[] = [
  { href: "/groups-channels", labelKey: "groupsChannels.myChats", icon: Smartphone, exact: true },
  { href: "/groups-channels/public", labelKey: "groupsChannels.publicIndex", icon: Search, exact: true, minRole: 2 },
];

const accountsSubItems: SubItem[] = [
  { href: "/accounts", labelKey: "nav.accounts", icon: Smartphone, exact: true },
  { href: "/accounts/age-checker", labelKey: "nav.ageChecker", icon: Clock, minRole: 2 },
];

const servicesSubItems: SubItem[] = [
  { href: "/orders/members", labelKey: "nav.telegramMembers", icon: Users },
  { href: "/orders/reactions", labelKey: "nav.telegramReactions", icon: Sparkles },
  { href: "/orders/auto-reactions", labelKey: "nav.telegramAutoReactions", icon: Clock },
  { href: "/orders/post-views", labelKey: "nav.telegramPostViews", icon: Eye },
  { href: "/orders/auto-post-views", labelKey: "nav.telegramAutoPostViews", icon: Repeat },
];

const administrationsSubItems: SubItem[] = [
  { href: "/admin/analytics", exact: true, labelKey: "admin.analytics", icon: TrendingUp },
  { href: "/admin/analytics/users", exact: false, labelKey: "admin.userAnalytics", icon: Users },
  { href: "/admin/analytics/telegram-accounts", exact: false, labelKey: "admin.telegramAccountAnalytics", icon: Radio },
  { href: "/admin/analytics/automation", exact: false, labelKey: "admin.automationAnalytics", icon: Bot },
  { href: "/admin/analytics/financial", exact: false, labelKey: "admin.financialAnalytics", icon: DollarSign },
  { href: "/admin/analytics/system-health", exact: false, labelKey: "admin.systemHealthAnalytics", icon: Activity },
  { href: "/admin/dashboard", exact: false, labelKey: "admin.overview", icon: BarChart3 },
  { href: "/admin/onboarding", exact: false, labelKey: "admin.onboarding", icon: Sparkles },
  { href: "/admin/users", exact: false, labelKey: "admin.users", icon: Users },
  { href: "/admin/transactions", exact: false, labelKey: "admin.transactions", icon: Wallet },
  { href: "/admin/broadcasts", exact: false, labelKey: "admin.manageBroadcasts", icon: Radio },
  { href: "/admin/auto-replies", exact: false, labelKey: "admin.manageAutoReplies", icon: Bot },
  { href: "/admin/account-prices", exact: false, labelKey: "admin.accountPrices", icon: Tag },
  { href: "/admin/tickets", exact: false, labelKey: "nav.tickets", icon: LifeBuoy },
  { href: "/admin/settings", exact: false, labelKey: "admin.systemConfig", icon: Settings },
];

const adminRedeemSubItems: SubItem[] = [
  { href: "/admin/redeem-codes", exact: false, labelKey: "adminRedeem.title", icon: Ticket },
  { href: "/admin/redeem-logs", exact: false, labelKey: "adminRedeem.logs", icon: ClipboardList },
];

const adminSmmSubItems: SubItem[] = [
  { href: "/admin/smm/services", exact: false, labelKey: "adminSmm.services", icon: Package },
  { href: "/admin/smm/orders", exact: false, labelKey: "adminSmm.allOrders", icon: ShoppingCart },
];

// role hierarchy: freetrial < basic < pro < premium < owner
const ROLE_HIERARCHY: Record<string, number> = {
  freetrial: 0,
  basic: 1,
  pro: 2,
  premium: 3,
  owner: 4,
};

interface NavItem {
  href: string;
  labelKey: string;
  icon: any;
  exact?: boolean;
  hasSubItems?: boolean;
  minRole?: number;
  subItems?: SubItem[];
  matchPrefixes?: string[];
}

interface NavGroup {
  id: string;
  labelKey: string;
  items: NavItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const user = useAuthStore((s) => s.user);
  const _ = useT();
  const locale = useI18nStore((s) => s.locale);

  const isAdminPage = pathname.startsWith("/admin");
  const isAccountsPage = pathname.startsWith("/accounts");
  const isInvitePage = pathname.startsWith("/invite");
  const isBroadcastPage =
    pathname.startsWith("/broadcast") &&
    !pathname.startsWith("/broadcast/group-lists") &&
    !pathname.startsWith("/broadcast/text-lists");
  const isGroupsChannelsPage =
    pathname.startsWith("/groups-channels") &&
    !pathname.startsWith("/groups-channels/auto-join");
  const isServicesOpen = servicesSubItems.some((sub) =>
    sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
  );

  const [accountsOpen, setAccountsOpen] = useState(isAccountsPage);
  const [inviteOpen, setInviteOpen] = useState(isInvitePage);
  const [broadcastOpen, setBroadcastOpen] = useState(isBroadcastPage);
  const [groupsChannelsOpen, setGroupsChannelsOpen] = useState(isGroupsChannelsPage);
  const [servicesOpen, setServicesOpen] = useState(isServicesOpen);

  // Auto-open sections on mount / pathname change
  useEffect(() => {
    if (isAccountsPage) setAccountsOpen(true);
    if (isInvitePage) setInviteOpen(true);
    if (isBroadcastPage) {
      setBroadcastOpen(true);
    } else if (
      pathname.startsWith("/broadcast/group-lists") ||
      pathname.startsWith("/broadcast/text-lists")
    ) {
      setBroadcastOpen(false);
    }
    if (isGroupsChannelsPage) {
      setGroupsChannelsOpen(true);
    } else if (pathname.startsWith("/groups-channels/auto-join")) {
      setGroupsChannelsOpen(false);
    }
    if (isServicesOpen) setServicesOpen(true);
  }, [
    pathname,
    isAccountsPage,
    isInvitePage,
    isBroadcastPage,
    isGroupsChannelsPage,
    isServicesOpen,
  ]);

  // Auto-open sidebar on desktop on first mount
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      useAppStore.setState({ sidebarOpen: true });
    }
  }, []);

  function handleNavClick() {
    if (window.innerWidth < 1024) closeSidebar();
  }

  // Navigation grouping
  const navGroups: NavGroup[] = [
    {
      id: "main",
      labelKey: locale === "id" ? "MENU UTAMA" : "MAIN MENU",
      items: [
        { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, minRole: 0 },
        {
          href: "/accounts",
          labelKey: "nav.accounts",
          icon: Smartphone,
          hasSubItems: true,
          subItems: accountsSubItems,
          minRole: 0,
        },
        { href: "/chats", labelKey: "nav.chats", icon: MessageSquare, minRole: 0 },
        { href: "/contacts", labelKey: "nav.contacts", icon: Users, minRole: 2 },
        {
          href: "/groups-channels",
          labelKey: "nav.groupsChannels",
          icon: Hash,
          hasSubItems: true,
          subItems: groupsChannelsSubItems,
          minRole: 0,
        },
      ],
    },
    {
      id: "automation",
      labelKey: locale === "id" ? "AUTOMASI" : "AUTOMATION",
      items: [
        // Group and Text Lists sit above the features that consume them:
        // both Broadcast and Auto Join pick targets from these lists.
        { href: "/broadcast/group-lists", labelKey: "nav.groupLists", icon: Users, minRole: 0 },
        { href: "/broadcast/text-lists", labelKey: "nav.textLists", icon: FileText, minRole: 0 },
        {
          href: "/groups-channels/auto-join",
          labelKey: "groupsChannels.autoJoin",
          icon: UserPlus,
          exact: true,
          minRole: 1,
        },
        { href: "/auto-reply", labelKey: "nav.autoReply", icon: MessageCircleReply, minRole: 0 },
        {
          href: "/invite",
          labelKey: "invite.navLabel",
          icon: Send,
          hasSubItems: true,
          subItems: inviteSubItems,
          minRole: 2,
        },
        {
          href: "/broadcast",
          labelKey: "nav.broadcast",
          icon: Radio,
          hasSubItems: true,
          subItems: broadcastSubItems,
          minRole: 0,
        },
      ],
    },
    {
      id: "billing",
      labelKey: locale === "id" ? "LAYANAN" : "SERVICES",
      items: [
        {
          href: "/orders-services",
          labelKey: "nav.services",
          icon: Sparkles,
          hasSubItems: true,
          subItems: servicesSubItems,
          matchPrefixes: ["/orders/members", "/orders/reactions", "/orders/auto-reactions", "/orders/post-views", "/orders/auto-post-views"],
          minRole: 0,
        },
        { href: "/orders/buy-accounts", labelKey: "orders.buyAccounts", icon: ShoppingCart, minRole: 0 },
        { href: "/orders/sell-accounts", labelKey: "orders.sellAccounts", icon: DollarSign, minRole: 0 },
        { href: "/orders", labelKey: "orders.history", icon: ClipboardList, exact: true, minRole: 0 },
        { href: "/wallet", labelKey: "wallet.title", icon: Wallet, minRole: 0 },
        { href: "/subscriptions", labelKey: "subscription.title", icon: Crown, minRole: 0 },
        { href: "/redeem", labelKey: "redeem.title", icon: Ticket, minRole: 0 },
      ],
    },
    {
      id: "support",
      labelKey: locale === "id" ? "DUKUNGAN" : "SUPPORT",
      items: [
        { href: "/support", labelKey: "nav.aiSupport", icon: Bot, minRole: 0 },
        { href: "/help", labelKey: "nav.help", icon: HelpCircle, minRole: 0 },
        { href: "/help/api", labelKey: "help.apiTitle", icon: BookOpen, minRole: 0 },
      ],
    },
  ];

  // Admin dedicated navigation groups (only shown when on /admin/*)
  const adminNavGroups: NavGroup[] = [
    {
      id: "admin-overview",
      labelKey: locale === "id" ? "IKHTISAR" : "OVERVIEW",
      items: [
        { href: "/admin/analytics", labelKey: "admin.analytics", icon: TrendingUp, exact: true, minRole: 4 },
        { href: "/admin/analytics/users", labelKey: "admin.userAnalytics", icon: Users, exact: false, minRole: 4 },
        { href: "/admin/analytics/security", labelKey: "admin.securityAnalytics", icon: Shield, exact: false, minRole: 4 },
        { href: "/admin/dashboard", labelKey: "admin.overview", icon: BarChart3, exact: true, minRole: 4 },
        { href: "/admin/users", labelKey: "admin.users", icon: Users, exact: false, minRole: 4 },
        { href: "/admin/transactions", labelKey: "admin.transactions", icon: Wallet, exact: false, minRole: 4 },
        { href: "/admin/settings", labelKey: "admin.systemConfig", icon: Settings, exact: false, minRole: 4 },
      ],
    },
    {
      id: "admin-telegram",
      labelKey: locale === "id" ? "TELEGRAM & BOT" : "TELEGRAM & BOTS",
      items: [
        { href: "/admin/broadcasts", labelKey: "admin.manageBroadcasts", icon: Radio, exact: false, minRole: 4 },
        { href: "/admin/auto-replies", labelKey: "admin.manageAutoReplies", icon: Bot, exact: false, minRole: 4 },
        { href: "/admin/account-prices", labelKey: "admin.accountPrices", icon: Tag, exact: false, minRole: 4 },
      ],
    },
    {
      id: "admin-smm",
      labelKey: locale === "id" ? "LAYANAN SMM" : "SMM SERVICES",
      items: [
        { href: "/admin/smm/services", labelKey: "adminSmm.services", icon: Package, exact: false, minRole: 4 },
        { href: "/admin/smm/orders", labelKey: "adminSmm.allOrders", icon: ShoppingCart, exact: false, minRole: 4 },
        { href: "/admin/smm/settings", labelKey: "adminSmm.settings", icon: Sliders, exact: false, minRole: 4 },
      ],
    },
    {
      id: "admin-voucher",
      labelKey: locale === "id" ? "VOUCHER & DUKUNGAN" : "VOUCHERS & SUPPORT",
      items: [
        { href: "/admin/redeem-codes", labelKey: "adminRedeem.title", icon: Ticket, exact: false, minRole: 4 },
        { href: "/admin/redeem-logs", labelKey: "adminRedeem.logs", icon: ClipboardList, exact: false, minRole: 4 },
        { href: "/admin/tickets", labelKey: "nav.tickets", icon: LifeBuoy, exact: false, minRole: 4 },
      ],
    },
  ];

  const displayedNavGroups = isAdminPage ? adminNavGroups : navGroups;

  const getSubmenuState = (href: string) => {
    if (href.startsWith("/accounts")) return { isOpen: accountsOpen, setIsOpen: setAccountsOpen };
    if (href.startsWith("/invite")) return { isOpen: inviteOpen, setIsOpen: setInviteOpen };
    if (href.startsWith("/broadcast")) return { isOpen: broadcastOpen, setIsOpen: setBroadcastOpen };
    if (href.startsWith("/groups-channels")) return { isOpen: groupsChannelsOpen, setIsOpen: setGroupsChannelsOpen };
    if (href === "/orders-services") return { isOpen: servicesOpen, setIsOpen: setServicesOpen };
    return { isOpen: false, setIsOpen: () => {} };
  };

  return (
    <>
      {/* Mobile overlay with fade transition */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ease-in-out",
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={closeSidebar}
      />

      <aside
        className={cn(
          "fixed lg:relative inset-y-0 left-0 z-50 bg-slate-950 border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-in-out text-slate-300 group/sidebar shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarOpen ? "w-64" : "w-64 lg:w-[72px]"
        )}
      >
        {/* Sidebar rail collapse button (visible on hover on desktop) */}
        <button
          onClick={toggleSidebar}
          className="absolute right-2 top-5 z-50 w-6 h-6 rounded-full border border-slate-700 bg-slate-900 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors duration-150 opacity-0 group-hover/sidebar:opacity-100 hidden lg:flex active:scale-95"
          aria-label="Toggle Sidebar"
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Header */}
        <div className="flex items-center h-16 px-5 border-b border-sidebar-border shrink-0 relative overflow-hidden">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <BrandLogo
                size="md"
                className="animate-in fade-in slide-in-from-left-2 duration-200"
              />
              {isAdminPage && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/25 animate-in fade-in duration-200">
                  Admin
                </span>
              )}
            </div>
          )}
          {/* Close button (mobile) */}
          <button
            onClick={closeSidebar}
            className="inline-flex h-8 w-8 ml-auto items-center justify-center rounded-lg border border-rose-800/80 bg-rose-950/60 text-rose-400 hover:border-rose-600 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer lg:hidden"
            aria-label="Close Sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-4">
          {/* Context Switcher: Admin Mode -> User App */}
          {isAdminPage && (
            <div className="pb-1">
              <Link
                href="/dashboard"
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all group/back",
                  !sidebarOpen && "justify-center px-0"
                )}
                title={locale === "id" ? "Kembali ke Aplikasi" : "Back to User App"}
              >
                <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 group-hover/back:text-white transition-colors" />
                {sidebarOpen && (
                  <span className="truncate">
                    {locale === "id" ? "Kembali ke Aplikasi" : "Back to User App"}
                  </span>
                )}
              </Link>
            </div>
          )}

          {/* Context Switcher: User App -> Admin Mode (Owner only) */}
          {!isAdminPage && user?.role === "owner" && (
            <div className="pb-1">
              <Link
                href="/admin/dashboard"
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/25 transition-all group/admin",
                  !sidebarOpen && "justify-center px-0"
                )}
                title={locale === "id" ? "Panel Admin" : "Admin Panel"}
              >
                <Shield className="h-4 w-4 shrink-0 text-rose-400" />
                {sidebarOpen && (
                  <>
                    <span className="truncate">{locale === "id" ? "Panel Admin" : "Admin Panel"}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-70 group-hover/admin:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Link>
            </div>
          )}

          <TooltipProvider delayDuration={0}>
            {displayedNavGroups.map((group, groupIdx) => {
              // Filter items in the group by user role
              const userLevel = ROLE_HIERARCHY[user?.role || "freetrial"] ?? 0;
              const visibleItems = group.items.filter((item) => {
                return userLevel >= (item.minRole ?? 0);
              });

                      if (visibleItems.length === 0) return null;

                      return (
                        <div key={group.id} className="space-y-1">
                          {/* Group Title or Divider */}
                          {sidebarOpen ? (
                            <div className="text-[11px] font-bold text-slate-400 px-3.5 pt-2 pb-1 tracking-wider uppercase select-none">
                              {group.labelKey}
                            </div>
                          ) : (
                            groupIdx > 0 && <div className="border-t border-slate-900/60 my-3 mx-2" />
                          )}

                          {visibleItems.map((item) => {
                            const isActive = (() => {
                              if (item.href === "/dashboard") return pathname === "/dashboard";
                              if (item.href === "/admin/dashboard") return pathname === "/admin" || pathname === "/admin/dashboard";
                              if (item.hasSubItems && item.subItems) {
                                const hasActiveSub = item.subItems.some((sub) =>
                                  sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
                                );
                                if (hasActiveSub) return true;
                              }
                              if (item.matchPrefixes) {
                                return item.matchPrefixes.some((pref) => pathname.startsWith(pref)) || (item.exact ? pathname === item.href : pathname.startsWith(item.href));
                              }
                              if (item.href === "/broadcast") {
                                if (
                                  pathname.startsWith("/broadcast/group-lists") ||
                                  pathname.startsWith("/broadcast/text-lists")
                                ) {
                                  return false;
                                }
                              }
                              if (item.href === "/groups-channels") {
                                if (pathname.startsWith("/groups-channels/auto-join")) {
                                  return false;
                                }
                              }
                              return item.exact ? pathname === item.href : pathname.startsWith(item.href);
                            })();

                            if (item.hasSubItems && item.subItems) {
                              const { isOpen, setIsOpen } = getSubmenuState(item.href);

                              return (
                                <div key={item.href} className="relative group/item">
                                  <Tooltip delayDuration={0}>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => {
                                          if (!sidebarOpen) {
                                            toggleSidebar();
                                            setIsOpen(true);
                                          } else {
                                            setIsOpen(!isOpen);
                                          }
                                        }}
                                        className={cn(
                                          "flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-colors duration-150 text-left relative",
                                          isActive
                                            ? "bg-primary-500/15 text-primary-400 font-semibold border-l-2 border-primary-500 pl-[10px]"
                                            : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-100"
                                        )}
                                      >
                                        <item.icon
                                          className={cn(
                                            "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                                            isActive ? "text-primary-400" : "text-slate-400 group-hover/item:text-slate-100"
                                          )}
                                        />
                                        {sidebarOpen ? (
                                          <>
                                            <span className="flex-1 text-left truncate">{_(item.labelKey)}</span>
                                            <ChevronDown
                                              className={cn(
                                                "h-3.5 w-3.5 transition-transform duration-200 shrink-0",
                                                isOpen && "rotate-180"
                                              )}
                                            />
                                          </>
                                        ) : (
                                          isActive && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary-500 rounded-r-md" />
                                          )
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    {!sidebarOpen && (
                                      <TooltipContent side="right" className="dark bg-slate-900 text-slate-100 border-slate-800 shadow-xl">
                                        {_(item.labelKey)}
                                      </TooltipContent>
                                    )}
                                  </Tooltip>

                                  {/* Submenu Accordion */}
                                  {sidebarOpen && isOpen && (
                                    <div
                                      className="ml-4 mt-1 space-y-0.5 border-l border-slate-900 pl-3 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                                    >
                                      {item.subItems
                                        .filter((sub) => userLevel >= (sub.minRole ?? 0))
                                        .map((sub) => {
                                        const isSubActive = sub.exact
                                          ? pathname === sub.href
                                          : pathname.startsWith(sub.href);
                                        return (
                                          <Link
                                            key={sub.href}
                                            href={sub.href}
                                            onClick={handleNavClick}
                                            className={cn(
                                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                              isSubActive
                                                ? "bg-primary-500/15 text-primary-300 font-semibold"
                                                : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                                            )}
                                          >
                                            <sub.icon className="h-3.5 w-3.5 flex-shrink-0" />
                                            <span className="truncate">{_(sub.labelKey)}</span>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div key={item.href} className="relative group/item">
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    <Link
                                      href={item.href}
                                      onClick={handleNavClick}
                                      className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 relative",
                                        isActive
                                          ? "bg-primary-500/15 text-primary-400 font-semibold border-l-2 border-primary-500 pl-[10px]"
                                          : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-100"
                                      )}
                                    >
                                      <item.icon
                                        className={cn(
                                          "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                                          isActive ? "text-primary-400" : "text-slate-400 group-hover/item:text-slate-100"
                                        )}
                                      />
                                      {sidebarOpen ? (
                                        <span className="truncate">{_(item.labelKey)}</span>
                                      ) : (
                                        isActive && (
                                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary-500 rounded-r-md" />
                                        )
                                      )}
                                    </Link>
                                  </TooltipTrigger>
                                  {!sidebarOpen && (
                                    <TooltipContent side="right" className="dark bg-slate-900 text-slate-100 border-slate-800 shadow-xl">
                                      {_(item.labelKey)}
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </TooltipProvider>
                </nav>

                {/* Footer (Profile Section) */}
                <div className="p-2 border-t border-slate-900 shrink-0 relative">
                  <UserProfileMenu variant="sidebar" collapsed={!sidebarOpen} />
                </div>
      </aside>
    </>
  );
}

