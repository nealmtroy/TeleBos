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
} from "lucide-react";
import { useT } from "@/lib/i18n";

export default function BroadcastDashboardPage() {
  const _ = useT();
  const cards = [
    {
      title: _("broadcastDashboard.groupLists"),
      desc: _("broadcastDashboard.groupListsDesc"),
      icon: List,
      href: "/broadcast/group-lists",
      color: "bg-blue-500",
    },
    {
      title: _("broadcastDashboard.textLists"),
      desc: _("broadcastDashboard.textListsDesc"),
      icon: FileText,
      href: "/broadcast/text-lists",
      color: "bg-green-500",
    },
    {
      title: _("broadcastDashboard.newBroadcast"),
      desc: _("broadcastDashboard.newBroadcastDesc"),
      icon: Send,
      href: "/broadcast/new",
      color: "bg-purple-500",
    },
    {
      title: _("broadcastDashboard.broadcastHistory"),
      desc: _("broadcastDashboard.broadcastHistoryDesc"),
      icon: Clock,
      href: "/broadcast/history",
      color: "bg-cyan-500",
    },
    {
      title: _("broadcastDashboard.broadcastLogs"),
      desc: _("broadcastDashboard.broadcastLogsDesc"),
      icon: ClipboardList,
      href: "/broadcast/logs",
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("broadcastDashboard.title")}</h1>
        <p className="text-gray-500 mt-1">
          {_("broadcastDashboard.desc")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition group h-full flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <card.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {card.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-primary-600 transition" />
            </div>
          </Link>
        ))}
      </div>

      {/* Getting started */}
      <div className="bg-primary-50 rounded-xl border border-primary-200 p-6">
        <h3 className="font-semibold text-primary-800">{_("broadcastDashboard.gettingStarted")}</h3>
        <ol className="mt-2 space-y-2 text-sm text-primary-700 list-decimal list-inside">
          <li>{_("broadcastDashboard.step1")}</li>
          <li>{_("broadcastDashboard.step2")}</li>
          <li>{_("broadcastDashboard.step3")}</li>
          <li>{_("broadcastDashboard.step4")}</li>
        </ol>
      </div>
    </div>
  );
}
