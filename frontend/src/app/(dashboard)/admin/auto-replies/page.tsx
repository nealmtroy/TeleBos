"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminAutoReplies,
  useAdminToggleAutoReply,
  type AdminAutoReplyItem,
} from "@/hooks/use-admin";
import {
  Bot,
  Shield,
  Search,
  RefreshCw,
  Power,
  Clock,
  Copy,
  Check,
  Smartphone,
  User as UserIcon,
  MessageCircleReply,
  Radio,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatRelative } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function AdminAutoRepliesPage() {
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 mt-6">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only system owners can manage platform auto-reply responders.</p>
      </div>
    );
  }

  return <AutoReplyManagementContent />;
}

function AutoReplyManagementContent() {
  const _ = useT();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<AdminAutoReplyItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, refetch } = useAdminAutoReplies({
    search: debouncedSearch,
    status: statusFilter,
    page,
    limit: PAGE_SIZE,
  });

  const toggleMutation = useAdminToggleAutoReply();

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600 border border-teal-100">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                {_("admin.manageAutoReplies") || "Auto-Reply Management"}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {_("admin.autoRepliesDesc") || "Monitor and control auto-reply bot responders across accounts"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-3 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-teal-600")} />
            <span>Refresh</span>
          </Button>
          <Link href="/auto-reply">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs text-teal-700 border-teal-200 bg-teal-50/50 hover:bg-teal-100 flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>User Auto-Reply</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Responders */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Responders</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-1">{data?.total ?? 0}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Configured bot accounts</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Bot className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Running Now */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Responders</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-extrabold text-emerald-600">{data?.running_count ?? 0}</span>
                {(data?.running_count ?? 0) > 0 && (
                  <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                    Listening
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">Auto-responding to incoming chats</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Radio className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Stopped */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Stopped / Inactive</p>
              <p className="text-3xl font-extrabold text-amber-600 mt-1">{data?.stopped_count ?? 0}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Disabled or paused accounts</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <XCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Total Sent */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Replied</p>
              <p className="text-3xl font-extrabold text-indigo-600 mt-1">
                {(data?.total_sent ?? 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">Automatic welcome replies sent</p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <MessageCircleReply className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border border-gray-200 overflow-hidden shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-200/60 rounded-xl">
            {(
              [
                { id: "all", label: "All Accounts" },
                { id: "running", label: "Running" },
                { id: "stopped", label: "Stopped" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  statusFilter === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, user email, or text..."
              className="pl-9 h-9 text-xs bg-white rounded-xl"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Owner / User</th>
                <th className="py-3 px-4 min-w-[220px]">Auto-Reply Text</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Total Replied</th>
                <th className="py-3 px-4">Last Sent</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 rounded w-28" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 rounded w-36" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 rounded w-48" /></td>
                    <td className="py-4 px-4"><div className="h-5 bg-gray-200 rounded w-16 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 rounded w-12 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                    <td className="py-4 px-4"><div className="h-6 bg-gray-200 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <Bot className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium text-gray-600 text-sm">No auto-reply jobs found</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {search ? "Try adjusting your search query" : "No accounts have auto-reply configured yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                data.items.map((item: AdminAutoReplyItem) => {
                  const isRunning = item.status === "running";
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Account info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-gray-100 text-gray-600 shrink-0">
                            <Smartphone className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {item.first_name ? `${item.first_name} ${item.last_name || ""}` : item.phone}
                            </p>
                            <p className="text-[11px] text-gray-400 font-mono">
                              {item.phone}
                              {item.username && ` • @${item.username}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Owner / User */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="h-3 w-3 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 truncate">{item.user_email}</p>
                            {item.user_full_name && (
                              <p className="text-[10px] text-gray-400 truncate">{item.user_full_name}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Auto-Reply Text */}
                      <td className="py-3.5 px-4">
                        {item.auto_reply_text ? (
                          <div className="flex items-center gap-2 group max-w-sm">
                            <span
                              onClick={() => setPreviewItem(item)}
                              className="text-gray-700 bg-gray-50 border border-gray-200/80 px-2 py-1 rounded-lg text-[11px] truncate max-w-[280px] cursor-pointer hover:border-teal-300 hover:bg-teal-50/30 transition block"
                              title="Click to view full message"
                            >
                              &quot;{item.auto_reply_text}&quot;
                            </span>
                            <button
                              onClick={() => handleCopy(item.id, item.auto_reply_text!)}
                              className="text-gray-400 hover:text-gray-600 transition shrink-0 p-1 rounded hover:bg-gray-100"
                              title="Copy message"
                            >
                              {copiedId === item.id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">None configured</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                            isRunning
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : item.auto_reply_enabled
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              isRunning
                                ? "bg-emerald-500 animate-pulse"
                                : item.auto_reply_enabled
                                ? "bg-amber-500"
                                : "bg-gray-400"
                            )}
                          />
                          {isRunning ? "Running" : item.auto_reply_enabled ? "Stopped" : "Disabled"}
                        </span>
                      </td>

                      {/* Total Replied */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-gray-900">
                          {item.total_replied.toLocaleString()}
                        </span>
                      </td>

                      {/* Last Sent */}
                      <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">
                        {item.last_replied_at ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span>{formatRelative(item.last_replied_at)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate(item.id)}
                          className={cn(
                            "h-7 px-2.5 text-[11px] font-medium transition rounded-lg",
                            item.auto_reply_enabled
                              ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          )}
                          title={item.auto_reply_enabled ? "Turn OFF Auto-Reply" : "Turn ON Auto-Reply"}
                        >
                          <Power className="h-3 w-3 mr-1" />
                          {item.auto_reply_enabled ? "Disable" : "Enable"}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50/70 border-t border-gray-100 text-xs text-gray-500">
            <div>
              Showing <span className="font-semibold text-gray-800">{(page - 1) * PAGE_SIZE + 1}</span> to{" "}
              <span className="font-semibold text-gray-800">{Math.min(page * PAGE_SIZE, data.total)}</span> of{" "}
              <span className="font-semibold text-gray-800">{data.total}</span> accounts
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 font-medium text-gray-700">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Message Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Auto-Reply Message Preview</h3>
                  <p className="text-xs text-gray-400">{previewItem.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-gray-400 hover:text-gray-600 text-sm p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {previewItem.auto_reply_text || "No text configured."}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-gray-400">
                Replied: {previewItem.total_replied.toLocaleString()} times
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (previewItem.auto_reply_text) {
                    handleCopy(previewItem.id, previewItem.auto_reply_text);
                  }
                }}
                className="text-xs flex items-center gap-1.5"
              >
                {copiedId === previewItem.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedId === previewItem.id ? "Copied" : "Copy Message"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
