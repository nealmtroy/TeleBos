"use client";

import Link from "next/link";
import {
  List,
  FileText,
  Send,
  ClipboardList,
  Clock,
  Plus,
  ArrowRight,
  UserPlus,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import { useGroupLists } from "@/hooks/use-broadcast";
import { CardSkeleton } from "@/components/ui/skeleton-cards";

export default function BroadcastDashboardPage() {
  const _ = useT();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: groupLists, isLoading: groupListsLoading } = useGroupLists();

  const cards = [
    {
      title: _("broadcastDashboard.groupLists"),
      desc: _("broadcastDashboard.groupListsDesc"),
      icon: List,
      href: "/broadcast/group-lists",
      color: "bg-sky-600 text-white",
    },
    {
      title: _("broadcastDashboard.textLists"),
      desc: _("broadcastDashboard.textListsDesc"),
      icon: FileText,
      href: "/broadcast/text-lists",
      color: "bg-emerald-600 text-white",
    },
    {
      title: _("broadcastDashboard.newBroadcast"),
      desc: _("broadcastDashboard.newBroadcastDesc"),
      icon: Send,
      href: "/broadcast/new",
      color: "bg-primary text-primary-foreground",
    },
    {
      title: _("broadcastDashboard.broadcastHistory"),
      desc: _("broadcastDashboard.broadcastHistoryDesc"),
      icon: Clock,
      href: "/broadcast/history",
      color: "bg-slate-700 text-white dark:bg-slate-800",
    },
    {
      title: _("broadcastDashboard.broadcastLogs"),
      desc: _("broadcastDashboard.broadcastLogsDesc"),
      icon: ClipboardList,
      href: "/broadcast/logs",
      color: "bg-amber-600 text-white",
    },
  ];

  if (accountsLoading || groupListsLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{_("broadcastDashboard.title")}</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">
            {_("broadcastDashboard.desc")}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
        </div>
      </div>
    );
  }

  // Check if there are no accounts connected
  if (!accounts || accounts.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{_("broadcastDashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {_("broadcastDashboard.desc")}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center text-center p-12 bg-card text-card-foreground rounded-2xl border border-border shadow-sm max-w-2xl mx-auto my-8 space-y-6 transition duration-300 hover:shadow-md">
          <div className="bg-primary-50 dark:bg-primary-950/50 p-5 rounded-full text-primary animate-pulse">
            <UserPlus className="h-10 w-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {_("broadcastDashboard.noAccountsTitle")}
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
              {_("broadcastDashboard.noAccountsDesc")}
            </p>
          </div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition shadow-sm hover:shadow active:scale-98"
          >
            <Plus className="h-4 w-4" />
            {_("broadcastDashboard.noAccountsBtn")}
          </Link>
        </div>
      </div>
    );
  }

  // Check if there are accounts but no group lists
  if (!groupLists || groupLists.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{_("broadcastDashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {_("broadcastDashboard.desc")}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center text-center p-12 bg-card text-card-foreground rounded-2xl border border-border shadow-sm max-w-2xl mx-auto my-8 space-y-6 transition duration-300 hover:shadow-md">
          <div className="bg-blue-50 dark:bg-blue-950/50 p-5 rounded-full text-blue-600 dark:text-blue-400 animate-pulse">
            <List className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {_("broadcastDashboard.noGroupListsTitle")}
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
              {_("broadcastDashboard.noGroupListsDesc")}
            </p>
          </div>
          <Link
            href="/broadcast/group-lists"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition shadow-sm hover:shadow active:scale-98"
          >
            <Plus className="h-4 w-4" />
            {_("broadcastDashboard.noGroupListsBtn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{_("broadcastDashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {_("broadcastDashboard.desc")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="bg-card text-card-foreground rounded-xl border border-border p-6 hover:shadow-md hover:border-primary/40 transition group h-full flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <card.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {card.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{card.desc}</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-300 dark:text-slate-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition" />
            </div>
          </Link>
        ))}
      </div>

      {/* Getting started */}
      <div className="bg-primary-50 dark:bg-blue-950/30 rounded-xl border border-primary-200 dark:border-blue-900/50 p-6">
        <h3 className="font-semibold text-primary-800 dark:text-blue-300">{_("broadcastDashboard.gettingStarted")}</h3>
        <ol className="mt-2 space-y-2 text-sm text-primary-700 dark:text-blue-200/90 list-decimal list-inside">
          <li>{_("broadcastDashboard.step1")}</li>
          <li>{_("broadcastDashboard.step2")}</li>
          <li>{_("broadcastDashboard.step3")}</li>
          <li>{_("broadcastDashboard.step4")}</li>
        </ol>
      </div>
    </div>
  );
}
