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
  Check,
  Info,
  Bug,
  Keyboard,
  Sliders,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useThemeStore } from "@/store/theme-store";
import { motion, AnimatePresence } from "framer-motion";

interface SubItem {
  href: string;
  labelKey: string;
  icon: any;
  exact?: boolean;
}

const broadcastSubItems: SubItem[] = [
  { href: "/broadcast/new", labelKey: "nav.newBroadcast", icon: Plus },
  { href: "/broadcast/group-lists", labelKey: "nav.groupLists", icon: Users },
  { href: "/broadcast/text-lists", labelKey: "nav.textLists", icon: FileText },
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
  { href: "/groups-channels/public", labelKey: "groupsChannels.publicIndex", icon: Search, exact: true },
  { href: "/groups-channels/auto-join", labelKey: "groupsChannels.autoJoin", icon: UserPlus, exact: true },
];

const accountsSubItems: SubItem[] = [
  { href: "/accounts", labelKey: "nav.accounts", icon: Smartphone, exact: true },
  { href: "/accounts/age-checker", labelKey: "nav.ageChecker", icon: Clock },
];

const servicesSubItems: SubItem[] = [
  { href: "/orders/members", labelKey: "nav.telegramMembers", icon: Users },
  { href: "/orders/reactions", labelKey: "nav.telegramReactions", icon: Sparkles },
  { href: "/orders/auto-reactions", labelKey: "nav.telegramAutoReactions", icon: Clock },
  { href: "/orders/post-views", labelKey: "nav.telegramPostViews", icon: Eye },
];

const administrationsSubItems: SubItem[] = [
  { href: "/admin", exact: true, labelKey: "admin.overview", icon: BarChart3 },
  { href: "/admin/users", exact: false, labelKey: "admin.users", icon: Users },
  { href: "/admin/broadcasts", exact: false, labelKey: "admin.manageBroadcasts", icon: Radio },
  { href: "/admin/auto-replies", exact: false, labelKey: "admin.manageAutoReplies", icon: Bot },
  { href: "/admin/account-prices", exact: false, labelKey: "admin.accountPrices", icon: Tag },
];

const adminRedeemSubItems: SubItem[] = [
  { href: "/admin/redeem-codes", exact: false, labelKey: "adminRedeem.title", icon: Ticket },
  { href: "/admin/redeem-logs", exact: false, labelKey: "adminRedeem.logs", icon: ClipboardList },
];

const adminSmmSubItems: SubItem[] = [
  { href: "/admin/smm/services", exact: false, labelKey: "adminSmm.services", icon: Package },
  { href: "/admin/smm/orders", exact: false, labelKey: "adminSmm.allOrders", icon: ShoppingCart },
  { href: "/admin/smm/settings", exact: true, labelKey: "adminSmm.settings", icon: Settings },
];

// role hierarchy: basic < pro < premium < owner
const ROLE_HIERARCHY: Record<string, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
  owner: 3,
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

  const isAccountsPage = pathname.startsWith("/accounts");
  const isInvitePage = pathname.startsWith("/invite");
  const isBroadcastPage = pathname.startsWith("/broadcast");
  const isGroupsChannelsPage = pathname.startsWith("/groups-channels");
  const isServicesOpen = servicesSubItems.some((sub) =>
    sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
  );
  const isAdministrationsOpen = administrationsSubItems.some((sub) =>
    sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
  );
  const isAdminRedeemOpen = adminRedeemSubItems.some((sub) =>
    sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
  );
  const isAdminSmmOpen = adminSmmSubItems.some((sub) =>
    sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
  );

  const [accountsOpen, setAccountsOpen] = useState(isAccountsPage);
  const [inviteOpen, setInviteOpen] = useState(isInvitePage);
  const [broadcastOpen, setBroadcastOpen] = useState(isBroadcastPage);
  const [groupsChannelsOpen, setGroupsChannelsOpen] = useState(isGroupsChannelsPage);
  const [servicesOpen, setServicesOpen] = useState(isServicesOpen);
  const [administrationsOpen, setAdministrationsOpen] = useState(isAdministrationsOpen);
  const [adminRedeemOpen, setAdminRedeemOpen] = useState(isAdminRedeemOpen);
  const [adminSmmOpen, setAdminSmmOpen] = useState(isAdminSmmOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<"account" | "help" | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const logout = useAuthStore((s) => s.logout);

  // Auto-open sections on mount / pathname change
  useEffect(() => {
    if (isAccountsPage) setAccountsOpen(true);
    if (isInvitePage) setInviteOpen(true);
    if (isBroadcastPage) setBroadcastOpen(true);
    if (isGroupsChannelsPage) setGroupsChannelsOpen(true);
    if (isServicesOpen) setServicesOpen(true);
    if (isAdministrationsOpen) setAdministrationsOpen(true);
    if (isAdminRedeemOpen) setAdminRedeemOpen(true);
    if (isAdminSmmOpen) setAdminSmmOpen(true);
  }, [pathname]);

  // Auto-open sidebar on desktop on first mount
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      useAppStore.setState({ sidebarOpen: true });
    }
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setActiveSubmenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleNavClick() {
    if (window.innerWidth < 1024) closeSidebar();
  }

  function confirmLogout() {
    setShowLogoutDialog(false);
    logout();
  }

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "U";

  // Role details mapping
  const roleDisplay = {
    owner: { icon: Shield, text: "Owner", color: "text-rose-400 bg-rose-950/40 border-rose-900/50" },
    premium: { icon: Crown, text: "Premium", color: "text-amber-400 bg-amber-950/40 border-amber-900/50" },
    pro: { icon: Star, text: "Pro", color: "text-blue-400 bg-blue-950/40 border-blue-900/50" },
    basic: { icon: User, text: "Basic", color: "text-slate-400 bg-slate-900 border-slate-800" },
  };
  const userRole = user?.role || "basic";
  const RoleIcon = roleDisplay[userRole as keyof typeof roleDisplay]?.icon || User;
  const roleColor = roleDisplay[userRole as keyof typeof roleDisplay]?.color || roleDisplay.basic.color;
  const roleText = roleDisplay[userRole as keyof typeof roleDisplay]?.text || "Basic";
  const planName = userRole === "basic" ? "Free" : roleText;

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
        { href: "/contacts", labelKey: "nav.contacts", icon: Users, minRole: 1 },
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
        { href: "/auto-reply", labelKey: "nav.autoReply", icon: MessageCircleReply, minRole: 1 },
        {
          href: "/invite",
          labelKey: "invite.navLabel",
          icon: UserPlus,
          hasSubItems: true,
          subItems: inviteSubItems,
          minRole: 1,
        },
        {
          href: "/broadcast",
          labelKey: "nav.broadcast",
          icon: Send,
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
          matchPrefixes: ["/orders/members", "/orders/reactions", "/orders/auto-reactions", "/orders/post-views"],
          minRole: 0,
        },
        { href: "/orders/buy-accounts", labelKey: "orders.buyAccounts", icon: ShoppingCart, minRole: 0 },
        { href: "/orders/sell-accounts", labelKey: "orders.sellAccounts", icon: DollarSign, minRole: 0 },
        { href: "/orders", labelKey: "orders.history", icon: ClipboardList, exact: true, minRole: 0 },
        { href: "/subscriptions", labelKey: "subscription.title", icon: Crown, minRole: 0 },
        { href: "/redeem", labelKey: "redeem.title", icon: Ticket, minRole: 0 },
      ],
    },
    {
      id: "support",
      labelKey: locale === "id" ? "DUKUNGAN" : "SUPPORT",
      items: [
        { href: "/help", labelKey: "nav.help", icon: HelpCircle, minRole: 0 },
      ],
    },
  ];

  // Add admin group if owner
  if (user?.role === "owner") {
    navGroups.push({
      id: "admin",
      labelKey: locale === "id" ? "ADMINISTRASI" : "ADMINISTRATION",
      items: [
        {
          href: "/admin-administrations",
          labelKey: "nav.administrations",
          icon: Shield,
          hasSubItems: true,
          subItems: administrationsSubItems,
          matchPrefixes: [
            "/admin/users",
            "/admin/broadcasts",
            "/admin/auto-replies",
            "/admin/account-prices",
          ],
          minRole: 3,
        },
        {
          href: "/admin-redeem",
          labelKey: "nav.redeem",
          icon: Ticket,
          hasSubItems: true,
          subItems: adminRedeemSubItems,
          matchPrefixes: ["/admin/redeem-codes", "/admin/redeem-logs"],
          minRole: 3,
        },
        {
          href: "/admin-smm",
          labelKey: "nav.smm",
          icon: Package,
          hasSubItems: true,
          subItems: adminSmmSubItems,
          matchPrefixes: ["/admin/smm/services", "/admin/smm/orders", "/admin/smm/settings"],
          minRole: 3,
        },
      ],
    });
  }

  const getSubmenuState = (href: string) => {
    if (href.startsWith("/accounts")) return { isOpen: accountsOpen, setIsOpen: setAccountsOpen };
    if (href.startsWith("/invite")) return { isOpen: inviteOpen, setIsOpen: setInviteOpen };
    if (href.startsWith("/broadcast")) return { isOpen: broadcastOpen, setIsOpen: setBroadcastOpen };
    if (href.startsWith("/groups-channels")) return { isOpen: groupsChannelsOpen, setIsOpen: setGroupsChannelsOpen };
    if (href === "/orders-services") return { isOpen: servicesOpen, setIsOpen: setServicesOpen };
    if (href === "/admin-administrations") return { isOpen: administrationsOpen, setIsOpen: setAdministrationsOpen };
    if (href === "/admin-redeem") return { isOpen: adminRedeemOpen, setIsOpen: setAdminRedeemOpen };
    if (href === "/admin-smm") return { isOpen: adminSmmOpen, setIsOpen: setAdminSmmOpen };
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
          "fixed lg:relative inset-y-0 left-0 z-50 bg-slate-950 border-r border-slate-900 flex flex-col transition-transform duration-300 ease-in-out text-slate-300 group/sidebar shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarOpen ? "w-64" : "w-64 lg:w-[72px]"
        )}
      >
        {/* Sidebar rail collapse button (visible on hover on desktop) */}
        <button
          onClick={toggleSidebar}
          className="absolute right-[-12px] top-6 z-50 w-6 h-6 rounded-full border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer shadow-md transition-all duration-200 opacity-0 group-hover/sidebar:opacity-100 hidden lg:flex active:scale-95"
          aria-label="Toggle Sidebar"
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Header (Title only) */}
        <div className="flex items-center h-16 px-5 border-b border-slate-900 shrink-0 relative overflow-hidden">
          {sidebarOpen && (
            <BrandLogo
              size="md"
              className="animate-in fade-in slide-in-from-left-2 duration-200"
            />
          )}
          {/* Close button (mobile) */}
          <button
            onClick={closeSidebar}
            className="p-1.5 ml-auto hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-colors lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto no-scrollbar">
          {navGroups.map((group, groupIdx) => {
            // Filter items in the group by user role
            const visibleItems = group.items.filter((item) => {
              const userLevel = ROLE_HIERARCHY[user?.role || "basic"] ?? 0;
              return userLevel >= (item.minRole ?? 0);
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.id} className="space-y-1">
                {/* Group Title or Divider */}
                {sidebarOpen ? (
                  <div className="text-[10px] font-bold text-slate-400 px-3.5 pt-2 pb-1 tracking-wider uppercase select-none">
                    {group.labelKey}
                  </div>
                ) : (
                  groupIdx > 0 && <div className="border-t border-slate-900/60 my-3 mx-2" />
                )}

                {visibleItems.map((item) => {
                  const isActive = (() => {
                    if (item.href === "/dashboard") return pathname === "/dashboard";
                    if (item.hasSubItems && item.subItems) {
                      const hasActiveSub = item.subItems.some((sub) =>
                        sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)
                      );
                      if (hasActiveSub) return true;
                    }
                    if (item.matchPrefixes) {
                      return item.matchPrefixes.some((pref) => pathname.startsWith(pref)) || (item.exact ? pathname === item.href : pathname.startsWith(item.href));
                    }
                    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  })();

                  if (item.hasSubItems && item.subItems) {
                    const { isOpen, setIsOpen } = getSubmenuState(item.href);

                    return (
                      <div key={item.href} className="relative group/item">
                        <button
                          onClick={() => {
                            if (!sidebarOpen) {
                              // Expand sidebar and open submenu
                              toggleSidebar();
                              setIsOpen(true);
                            } else {
                              setIsOpen(!isOpen);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-all duration-200 text-left relative",
                            isActive
                              ? "bg-primary-500/10 text-primary-400 border-l-2 border-primary-500 pl-[10px] rounded-l-none"
                              : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-100 pl-3"
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

                        {/* Collapsed Tooltip */}
                        {!sidebarOpen && (
                          <div className="absolute left-[56px] top-1/2 -translate-y-1/2 bg-slate-900 border border-slate-800 text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all duration-150 translate-x-2 group-hover/item:translate-x-0 whitespace-nowrap z-50">
                            {_(item.labelKey)}
                          </div>
                        )}

                        {/* Submenu Accordion */}
                        {sidebarOpen && (
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                                className="ml-4 mt-1 space-y-0.5 border-l border-slate-900 pl-3 overflow-hidden"
                              >
                                {item.subItems.map((sub) => {
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
                                          ? "bg-primary-500/10 text-white font-semibold"
                                          : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                                      )}
                                    >
                                      <sub.icon className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="truncate">{_(sub.labelKey)}</span>
                                    </Link>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={item.href} className="relative group/item">
                      <Link
                        href={item.href}
                        onClick={handleNavClick}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
                          isActive
                            ? "bg-primary-500/10 text-primary-400 border-l-2 border-primary-500 pl-[10px] rounded-l-none"
                            : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-100 pl-3"
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

                      {/* Collapsed Tooltip */}
                      {!sidebarOpen && (
                        <div className="absolute left-[56px] top-1/2 -translate-y-1/2 bg-slate-900 border border-slate-800 text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all duration-150 translate-x-2 group-hover/item:translate-x-0 whitespace-nowrap z-50">
                          {_(item.labelKey)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer (Profile Section) */}
        <div className="p-2 border-t border-slate-900 shrink-0 relative" ref={profileRef}>
          {/* Profile Card / Trigger */}
          {sidebarOpen ? (
            <div className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-slate-900/60 rounded-xl transition-all duration-200 select-none">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  if (profileOpen) setActiveSubmenu(null);
                }}
                className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-[#9d7d47] text-white flex items-center justify-center text-[11px] font-medium shrink-0 shadow-sm">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white truncate leading-tight">
                    {user?.full_name || _("navbar.user")}
                  </p>
                  <p className="text-[10px] text-neutral-400 font-normal capitalize truncate leading-tight mt-0.5">
                    {planName}
                  </p>
                </div>
              </button>

              {userRole === "basic" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push("/subscriptions");
                  }}
                  className="px-2.5 py-0.5 text-[11px] font-medium text-white bg-[#2f2f2f] hover:bg-[#3d3d3d] border border-neutral-700/80 rounded-full transition-all duration-150 shrink-0 shadow-sm active:scale-95 ml-2 cursor-pointer"
                >
                  Upgrade
                </button>
              ) : (
                <div
                  onClick={() => {
                    setProfileOpen(!profileOpen);
                    if (profileOpen) setActiveSubmenu(null);
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider shrink-0 ml-2 cursor-pointer",
                    roleColor
                  )}
                >
                  {roleText}
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center w-full">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  if (profileOpen) setActiveSubmenu(null);
                }}
                className="w-7 h-7 rounded-full bg-[#9d7d47] text-white flex items-center justify-center text-[11px] font-medium hover:ring-2 hover:ring-white/20 transition-all shrink-0 shadow-sm active:scale-95 cursor-pointer"
                title={user?.full_name || user?.email || "Profile"}
              >
                {initials}
              </button>
            </div>
          )}

          {/* Floating Dropdown Popover */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className={cn(
                  "absolute bottom-16 bg-[#212121] border border-neutral-800 rounded-2xl shadow-2xl p-1.5 z-50 text-neutral-200 select-none",
                  sidebarOpen ? "left-2 right-2" : "left-2 w-[260px]"
                )}
              >
                {/* 1. Account item (with flyout submenu) */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu("account")}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSubmenu(activeSubmenu === "account" ? null : "account")}
                    className={cn(
                      "flex items-center justify-between w-full px-2 py-1.5 rounded-xl text-left transition-colors cursor-pointer",
                      activeSubmenu === "account" ? "bg-[#2f2f2f] text-white" : "hover:bg-[#2a2a2a] text-neutral-200"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-[#9d7d47] text-white flex items-center justify-center text-[11px] font-medium shrink-0 shadow-sm">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate leading-tight">
                          {user?.full_name || _("navbar.user")}
                        </p>
                        <p className="text-[10px] text-neutral-400 capitalize truncate leading-tight mt-0.5">
                          {planName}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-neutral-400 shrink-0 ml-1.5" />
                  </button>

                  {/* Account Flyout Submenu */}
                  {activeSubmenu === "account" && (
                    <div
                      className="absolute left-full bottom-0 pl-2 w-64 z-50 max-sm:left-0 max-sm:bottom-full max-sm:mb-2 max-sm:pl-0 max-sm:w-full"
                      onMouseLeave={() => setActiveSubmenu(null)}
                    >
                      <div className="bg-[#212121] border border-neutral-800 rounded-2xl shadow-2xl p-2 text-neutral-200">
                        {/* Email Row */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-400 border-b border-neutral-800 pb-2 mb-1">
                          <User className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span className="truncate">{user?.email || "user@telebos.com"}</span>
                        </div>

                        {/* Active Account with Checkmark */}
                        <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-[#2a2a2a] text-white my-1">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-[#9d7d47] text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
                              {initials}
                            </div>
                            <span className="text-sm font-medium truncate">{user?.full_name || "User"}</span>
                          </div>
                          <Check className="h-4 w-4 text-white shrink-0 ml-2" />
                        </div>

                        {/* Balance Row */}
                        <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-neutral-300">
                          <span className="flex items-center gap-1.5 text-neutral-400">
                            <Wallet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            {locale === "id" ? "Saldo" : "Balance"}
                          </span>
                          <span className="font-semibold text-emerald-400">Rp {(user?.balance || 0).toLocaleString()}</span>
                        </div>

                        <div className="border-t border-neutral-800 my-1" />

                        {/* Add Account */}
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/accounts");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <Plus className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Tambah akun" : "Add account"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-neutral-800 my-1" />

                {/* 2. Upgrade plan */}
                <button
                  type="button"
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => {
                    setProfileOpen(false);
                    setActiveSubmenu(null);
                    router.push("/subscriptions");
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-neutral-300 shrink-0" />
                  <span>{locale === "id" ? "Tingkatkan paket" : "Upgrade plan"}</span>
                </button>

                {/* 3. Personalization */}
                <button
                  type="button"
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => {
                    setProfileOpen(false);
                    setActiveSubmenu(null);
                    router.push("/settings?tab=appearance");
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Sliders className="h-4 w-4 text-neutral-300 shrink-0" />
                  <span>{locale === "id" ? "Personalisasi" : "Personalization"}</span>
                </button>

                {/* Theme Mode Segmented Switcher */}
                <div className="px-2.5 py-1.5 bg-[#1e1e1e] rounded-xl my-1 border border-neutral-800">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5 px-0.5">
                    <span>{locale === "id" ? "Tema" : "Theme"}</span>
                  </div>
                  <ThemeToggle variant="segmented" />
                </div>

                {/* 4. Profile */}
                <button
                  type="button"
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => {
                    setProfileOpen(false);
                    setActiveSubmenu(null);
                    router.push("/settings");
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                >
                  <User className="h-4 w-4 text-neutral-300 shrink-0" />
                  <span>{locale === "id" ? "Profil" : "Profile"}</span>
                </button>

                {/* 5. Settings */}
                <button
                  type="button"
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => {
                    setProfileOpen(false);
                    setActiveSubmenu(null);
                    router.push("/settings");
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Settings className="h-4 w-4 text-neutral-300 shrink-0" />
                  <span>{_("navbar.settings")}</span>
                </button>

                <div className="border-t border-neutral-800 my-1" />

                {/* 6. Help item (with flyout submenu) */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu("help")}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSubmenu(activeSubmenu === "help" ? null : "help")}
                    className={cn(
                      "flex items-center justify-between w-full px-2.5 py-2 rounded-xl text-left text-xs font-normal transition-colors cursor-pointer",
                      activeSubmenu === "help" ? "bg-[#2f2f2f] text-white" : "hover:bg-[#2a2a2a] text-neutral-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <HelpCircle className="h-4 w-4 text-neutral-300 shrink-0" />
                      <span>{locale === "id" ? "Bantuan" : "Help"}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                  </button>

                  {/* Help Flyout Submenu */}
                  {activeSubmenu === "help" && (
                    <div
                      className="absolute left-full bottom-0 pl-2 w-60 z-50 max-sm:left-0 max-sm:bottom-full max-sm:mb-2 max-sm:pl-0 max-sm:w-full"
                      onMouseLeave={() => setActiveSubmenu(null)}
                    >
                      <div className="bg-[#212121] border border-neutral-800 rounded-2xl shadow-2xl p-1.5 text-neutral-200 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/help");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <HelpCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Pusat Bantuan" : "Help center"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/privacy");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <Shield className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Pusat Privasi" : "Privacy center"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/help#release-notes");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Catatan Rilis" : "Release notes"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/help");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <Smartphone className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Unduh Aplikasi" : "Download apps"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/help#shortcuts");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <Keyboard className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Pintasan Keyboard" : "Keyboard shortcuts"}</span>
                        </button>

                        <div className="border-t border-neutral-800 my-1" />

                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/tos");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Ketentuan Layanan" : "Terms of Service"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/privacy");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <Info className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Kebijakan Privasi" : "Privacy Policy"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveSubmenu(null);
                            router.push("/help");
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors text-left cursor-pointer"
                        >
                          <Bug className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span>{locale === "id" ? "Laporkan Bug" : "Report a bug"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 7. Log out */}
                <button
                  type="button"
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => {
                    setProfileOpen(false);
                    setActiveSubmenu(null);
                    setShowLogoutDialog(true);
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 w-full text-xs font-normal text-neutral-200 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl transition-colors text-left cursor-pointer"
                >
                  <LogOut className="h-4 w-4 text-neutral-400 hover:text-rose-400 shrink-0" />
                  <span>{_("navbar.logout")}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

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

