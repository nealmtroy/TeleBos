"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useT } from "@/lib/i18n";
import {
  LayoutDashboard,
  Smartphone,
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
  Ticket,
  DollarSign,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";

const broadcastSubItems = [
  { href: "/broadcast/new", labelKey: "nav.newBroadcast", icon: Plus },
  { href: "/broadcast/group-lists", labelKey: "nav.groupLists", icon: Users },
  { href: "/broadcast/text-lists", labelKey: "nav.textLists", icon: FileText },
  { href: "/broadcast/history", labelKey: "nav.broadcastHistory", icon: Clock },
  { href: "/broadcast/logs", labelKey: "nav.broadcastLogs", icon: ClipboardList },
];

const ordersSubItems = [
  { href: "/orders/buy-accounts", labelKey: "orders.buyAccounts", icon: ShoppingCart },
  { href: "/orders/sell-accounts", labelKey: "orders.sellAccounts", icon: DollarSign },
  { href: "/orders", labelKey: "orders.history", icon: ClipboardList },
];

const adminSubItems = [
  { href: "/admin", exact: true, labelKey: "admin.overview", icon: BarChart3 },
  { href: "/admin/users", exact: false, labelKey: "admin.users", icon: Users },
  { href: "/admin/redeem-codes", exact: false, labelKey: "adminRedeem.title", icon: Ticket },
  { href: "/admin/redeem-logs", exact: false, labelKey: "adminRedeem.logs", icon: ClipboardList },
  { href: "/admin/smm", exact: false, labelKey: "adminSmm.services", icon: Package },
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
  hasSubItems?: boolean;
  /** Minimum role level required to see this item. 0 = basic (everyone), 1 = pro+, 2 = premium+, 3 = owner only */
  minRole?: number;
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, minRole: 0 },
  { href: "/accounts", labelKey: "nav.accounts", icon: Smartphone, minRole: 0 },
  { href: "/chats", labelKey: "nav.chats", icon: MessageSquare, minRole: 0 },
  { href: "/contacts", labelKey: "nav.contacts", icon: Users, minRole: 1 },
  { href: "/groups-channels", labelKey: "nav.groupsChannels", icon: Hash, minRole: 0 },
  { href: "/auto-reply", labelKey: "nav.autoReply", icon: MessageCircleReply, minRole: 1 },
  { href: "/invite", labelKey: "invite.navLabel", icon: UserPlus, minRole: 1 },
  { href: "/broadcast", labelKey: "nav.broadcast", icon: Send, hasSubItems: true, minRole: 0 },
  { href: "/orders", labelKey: "nav.orders", icon: ShoppingCart, hasSubItems: true, minRole: 0 },
  { href: "/subscriptions", labelKey: "subscription.title", icon: Crown, minRole: 0 },
  { href: "/help", labelKey: "nav.help", icon: HelpCircle, minRole: 0 },
];

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const user = useAuthStore((s) => s.user);
  const _ = useT();

  const isBroadcastPage = pathname.startsWith("/broadcast");
  const isOrdersPage = pathname.startsWith("/orders");
  const isAdminPage = pathname.startsWith("/admin");

  const [broadcastOpen, setBroadcastOpen] = useState(isBroadcastPage);
  const [ordersOpen, setOrdersOpen] = useState(isOrdersPage);
  const [adminOpen, setAdminOpen] = useState(isAdminPage);

  // Auto-open sections on mount
  useEffect(() => {
    if (isBroadcastPage) setBroadcastOpen(true);
  }, [isBroadcastPage]);

  useEffect(() => {
    if (isOrdersPage) setOrdersOpen(true);
  }, [isOrdersPage]);

  useEffect(() => {
    if (isAdminPage) setAdminOpen(true);
  }, [isAdminPage]);

  // Auto-open sidebar on desktop on first mount
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      useAppStore.setState({ sidebarOpen: true });
    }
  }, []);

  function handleNavClick() {
    if (window.innerWidth < 1024) closeSidebar();
  }

  return (
    <>
      {/* Mobile overlay with fade transition */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ease-in-out",
          sidebarOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={toggleSidebar}
      />

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-950 border-r border-slate-900 flex flex-col transition-all duration-300 ease-in-out text-slate-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"
        )}
      >
        {/* Header (Logo + Title) */}
        <div className="flex items-center h-16 px-5 border-b border-slate-900 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center font-bold text-white shadow-lg shadow-primary-600/20 mr-3">
            T
          </div>
          <span className="text-xl font-bold text-white tracking-tight">TeleBos</span>
          {/* Close button (mobile) */}
          <button onClick={toggleSidebar} className="p-1.5 ml-auto hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-colors lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems
            .filter((item) => {
              const userLevel = ROLE_HIERARCHY[user?.role || "basic"] ?? 0;
              return userLevel >= (item.minRole ?? 0);
            })
            .map((item) => {
            if (item.hasSubItems) {
              const isActive = pathname.startsWith(item.href);
              const isOpen = item.href === "/broadcast" ? broadcastOpen : ordersOpen;
              const setIsOpen = item.href === "/broadcast" ? setBroadcastOpen : setOrdersOpen;
              const subItems = item.href === "/broadcast" ? broadcastSubItems : ordersSubItems;
              return (
                <div key={item.href}>
                  <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl text-sm font-medium transition-all duration-200 group",
                      isActive
                        ? "bg-primary-600 text-white shadow-lg shadow-primary-600/15"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                    )}
                  >
                    <item.icon className={cn("h-4.5 w-4.5 flex-shrink-0 transition-colors", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-100")} />
                    <span className="flex-1 text-left">{_(item.labelKey)}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Submenu with slide animation */}
                  <div
                    className={cn(
                      "ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-3 overflow-hidden transition-all duration-300 ease-in-out",
                      isOpen
                        ? "max-h-80 opacity-100"
                        : "max-h-0 opacity-0"
                    )}
                  >
                    {subItems.map((sub) => {
                        const isSubActive =
                          sub.href === "/broadcast/new"
                            ? pathname === "/broadcast/new"
                            : sub.href === "/orders"
                            ? pathname === "/orders"
                            : pathname.startsWith(sub.href);
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={handleNavClick}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                              isSubActive
                                ? "bg-primary-600/20 text-white"
                                : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                            )}
                          >
                            <sub.icon className="h-3.5 w-3.5 flex-shrink-0" />
                            {_(sub.labelKey)}
                          </Link>
                        );
                      })}
                    </div>
                </div>
              );
            }

            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                  isActive
                    ? "bg-primary-600 text-white shadow-lg shadow-primary-600/15"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                )}
              >
                <item.icon className={cn("h-4.5 w-4.5 flex-shrink-0 transition-colors", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-100")} />
                {_(item.labelKey)}
              </Link>
            );
          })}
          {/* Admin section - only visible to owner */}
          {user?.role === "owner" && (
            <div className="pt-2 mt-2 border-t border-slate-800">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl text-sm font-medium transition-all duration-200 group",
                  isAdminPage
                    ? "bg-primary-600 text-white shadow-lg shadow-primary-600/15"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                )}
              >
                <Shield className="h-4.5 w-4.5 flex-shrink-0" />
                <span className="flex-1 text-left">{_("admin.title")}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    adminOpen && "rotate-180"
                  )}
                />
              </button>

              {/* Admin submenu */}
              <div
                className={cn(
                  "ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-3 overflow-hidden transition-all duration-300 ease-in-out",
                  adminOpen
                    ? "max-h-80 opacity-100"
                    : "max-h-0 opacity-0"
                )}
              >
                <Link
                  href="/admin"
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    pathname === "/admin"
                      ? "bg-primary-600/20 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  <BarChart3 className="h-3.5 w-3.5 flex-shrink-0" />
                  {_("admin.overview")}
                </Link>
                <Link
                  href="/admin/users"
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    pathname === "/admin/users"
                      ? "bg-primary-600/20 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  <Users className="h-3.5 w-3.5 flex-shrink-0" />
                  {_("admin.users")}
                </Link>
                <Link
                  href="/admin/smm"
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    pathname.startsWith("/admin/smm")
                      ? "bg-primary-600/20 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  <Package className="h-3.5 w-3.5 flex-shrink-0" />
                  {_("adminSmm.services")}
                </Link>
                <Link
                  href="/admin/redeem-codes"
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    pathname === "/admin/redeem-codes"
                      ? "bg-primary-600/20 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  <Ticket className="h-3.5 w-3.5 flex-shrink-0" />
                  {_("adminRedeem.title")}
                </Link>
                <Link
                  href="/admin/redeem-logs"
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    pathname === "/admin/redeem-logs"
                      ? "bg-primary-600/20 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  <ClipboardList className="h-3.5 w-3.5 flex-shrink-0" />
                  {_("adminRedeem.logs")}
                </Link>
              </div>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
