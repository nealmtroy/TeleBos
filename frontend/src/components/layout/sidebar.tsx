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
  ClipboardList,
  Clock,
  X,
  ChevronDown,
  Plus,
  Users,
  FileText,
  MessageCircleReply,
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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { motion, AnimatePresence } from "framer-motion";

const broadcastSubItems = [
  { href: "/broadcast/new", labelKey: "nav.newBroadcast", icon: Plus },
  { href: "/broadcast/group-lists", labelKey: "nav.groupLists", icon: Users },
  { href: "/broadcast/text-lists", labelKey: "nav.textLists", icon: FileText },
  { href: "/broadcast/history", labelKey: "nav.broadcastHistory", icon: Clock },
  { href: "/broadcast/logs", labelKey: "nav.broadcastLogs", icon: ClipboardList },
];

const groupsChannelsSubItems = [
  { href: "/groups-channels", labelKey: "groupsChannels.myChats", icon: Smartphone },
  { href: "/groups-channels/public", labelKey: "groupsChannels.publicIndex", icon: Search },
];

const servicesSubItems = [
  { href: "/orders/members", labelKey: "nav.telegramMembers", icon: Users },
  { href: "/orders/reactions", labelKey: "nav.telegramReactions", icon: Sparkles },
  { href: "/orders/auto-reactions", labelKey: "nav.telegramAutoReactions", icon: Clock },
  { href: "/orders/post-views", labelKey: "nav.telegramPostViews", icon: Eye },
];

const administrationsSubItems = [
  { href: "/admin", exact: true, labelKey: "admin.overview", icon: BarChart3 },
  { href: "/admin/users", exact: false, labelKey: "admin.users", icon: Users },
  { href: "/admin/account-prices", exact: false, labelKey: "Account Prices", icon: Tag },
];

const adminRedeemSubItems = [
  { href: "/admin/redeem-codes", exact: false, labelKey: "adminRedeem.title", icon: Ticket },
  { href: "/admin/redeem-logs", exact: false, labelKey: "adminRedeem.logs", icon: ClipboardList },
];

const adminSmmSubItems = [
  { href: "/admin/smm/services", exact: false, labelKey: "adminSmm.services", icon: Package },
  { href: "/admin/smm/orders", exact: false, labelKey: "adminSmm.allOrders", icon: ShoppingCart },
  { href: "/admin/smm", exact: true, labelKey: "adminSmm.settings", icon: Settings },
];

// role hierarchy: basic < pro < premium < owner
const ROLE_HIERARCHY: Record<string, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
  owner: 3,
};

interface SubItem {
  href: string;
  labelKey: string;
  icon: any;
  exact?: boolean;
}

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

  const isBroadcastPage = pathname.startsWith("/broadcast");
  const isGroupsChannelsPage = pathname.startsWith("/groups-channels");
  const isServicesOpen =
    pathname.startsWith("/orders/members") ||
    pathname.startsWith("/orders/reactions") ||
    pathname.startsWith("/orders/auto-reactions") ||
    pathname.startsWith("/orders/post-views");
  const isAdministrationsOpen =
    pathname === "/admin" ||
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/account-prices");
  const isAdminRedeemOpen =
    pathname.startsWith("/admin/redeem-codes") ||
    pathname.startsWith("/admin/redeem-logs");
  const isAdminSmmOpen = pathname.startsWith("/admin/smm");

  const [broadcastOpen, setBroadcastOpen] = useState(isBroadcastPage);
  const [groupsChannelsOpen, setGroupsChannelsOpen] = useState(isGroupsChannelsPage);
  const [servicesOpen, setServicesOpen] = useState(isServicesOpen);
  const [administrationsOpen, setAdministrationsOpen] = useState(isAdministrationsOpen);
  const [adminRedeemOpen, setAdminRedeemOpen] = useState(isAdminRedeemOpen);
  const [adminSmmOpen, setAdminSmmOpen] = useState(isAdminSmmOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const logout = useAuthStore((s) => s.logout);

  // Auto-open sections on mount / pathname change
  useEffect(() => {
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

  // Navigation grouping
  const navGroups: NavGroup[] = [
    {
      id: "main",
      labelKey: locale === "id" ? "MENU UTAMA" : "MAIN MENU",
      items: [
        { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, minRole: 0 },
        { href: "/accounts", labelKey: "nav.accounts", icon: Smartphone, minRole: 0 },
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
        { href: "/invite", labelKey: "invite.navLabel", icon: UserPlus, minRole: 1 },
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
          matchPrefixes: ["/admin/users", "/admin/account-prices"],
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
          matchPrefixes: ["/admin/smm/services", "/admin/smm/orders", "/admin/smm"],
          minRole: 3,
        },
      ],
    });
  }

  const getSubmenuState = (href: string) => {
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
            <span className="text-xl font-bold text-white tracking-tight animate-in fade-in slide-in-from-left-2 duration-200">
              TeleBos
            </span>
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
        <div className="p-3 border-t border-slate-900 shrink-0 relative hidden lg:block" ref={profileRef}>
          {/* Profile Card */}
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={cn(
              "flex items-center gap-3 w-full p-2 hover:bg-slate-900/60 rounded-xl transition-all duration-200 text-left active:scale-98 select-none",
              !sidebarOpen && "justify-center px-0 hover:bg-slate-900"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-semibold shadow-md shrink-0">
              {initials}
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {user?.full_name || _("navbar.user")}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0",
                    profileOpen && "rotate-180"
                  )}
                />
              </>
            )}
          </button>

          {/* Floating Dropdown Popover */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className={cn(
                  "absolute bottom-16 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-3 z-50 text-slate-300",
                  sidebarOpen ? "left-3 right-3" : "left-2 w-56"
                )}
              >
                {/* Profile Details */}
                <div className="px-2 py-2 border-b border-slate-850 mb-2">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-semibold shadow-md">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {user?.full_name || _("navbar.user")}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                    </div>
                  </div>
                  {/* Role Badge */}
                  <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-extrabold uppercase tracking-wider", roleColor)}>
                    <RoleIcon className="h-2.5 w-2.5 shrink-0" />
                    {roleText}
                  </div>
                </div>

                {/* Wallet / Balance */}
                <div className="px-2 py-1.5 border-b border-slate-850 mb-2">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-950/40 border border-emerald-900/50 rounded-lg text-emerald-400">
                    <Wallet className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] font-medium truncate">
                      Balance: <span className="font-bold">{(user?.balance || 0).toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      router.push("/settings");
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors group text-left"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-400 group-hover:text-white shrink-0" />
                    <span>{_("navbar.settings")}</span>
                  </button>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      setShowLogoutDialog(true);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 w-full text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 rounded-lg transition-colors group text-left"
                  >
                    <LogOut className="h-3.5 w-3.5 text-rose-500 group-hover:text-rose-400 shrink-0" />
                    <span>{_("navbar.logout")}</span>
                  </button>
                </div>
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

