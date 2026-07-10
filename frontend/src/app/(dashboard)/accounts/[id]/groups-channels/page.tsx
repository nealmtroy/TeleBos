"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useChats, type ChatItem } from "@/hooks/use-chats";
import { useAccounts } from "@/hooks/use-accounts";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Search, ChevronLeft, ChevronRight, Users, Hash, Crown, ArrowLeft, MessageSquare, RefreshCw, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";

export default function GroupsChannelsPage() {
  const _ = useT();
  const params = useParams();
  const accountId = params.id as string;
  const { data: accounts } = useAccounts();
  const pageSize = 20;

  const [activeTab, setActiveTab] = useState<"groups" | "channels">("groups");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncSuccessMsg, setSyncSuccessMsg] = useState("");

  const account = Array.isArray(accounts) ? accounts.find((a) => a.id === accountId) : undefined;
  const syncedAt = account?.groups_channels_synced_at;

  const handleSync = async () => {
    if (!accountId) return;
    setIsSyncing(true);
    setSyncError("");
    setSyncSuccessMsg("");
    try {
      const api = (await import("@/lib/api")).default;
      await api.post(`/accounts/${accountId}/chats/sync-groups-channels`);
      setSyncSuccessMsg(_("groupsChannels.syncSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["chats", accountId] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setTimeout(() => setSyncSuccessMsg(""), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || _("groupsChannels.syncFailed");
      setSyncError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset page when switching tabs
  useEffect(() => {
    setPage(1);
    setSearch("");
  }, [activeTab]);

  // Client-side search filter
  const q = search.toLowerCase();
  const filtered = q
    ? chats.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.username && c.username.toLowerCase().includes(q))
      )
    : chats;

  const chatType = activeTab === "groups" ? "group,supergroup" : "channel";

  const {
    data: chatsData,
    isLoading,
    error,
    refetch,
  } = useChats(accountId, page, pageSize, chatType);

  const chats = chatsData?.chats ?? [];
  const total = chatsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/accounts/${accountId}`}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-base font-bold text-gray-900">
              {account?.first_name || account?.phone || _("groupsChannels.title")}
            </h1>
            <p className="text-xs text-gray-400">{_("groupsChannels.title")}</p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={!accountId || isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
          {isSyncing ? _("groupsChannels.syncing") : _("groupsChannels.sync")}
        </button>
      </div>

      {/* Sync Status / Errors */}
      <div className="px-4 pt-2 pb-0 space-y-2">
        {accountId && syncedAt && (
          <p className="text-[11px] text-gray-500">
            {_("groupsChannels.lastSynced").replace("{time}", new Date(syncedAt).toLocaleString())}
          </p>
        )}

        {syncError && (
          <div className="p-2 text-xs rounded-lg bg-red-50 border border-red-200 text-red-600">
            {syncError}
          </div>
        )}

        {syncSuccessMsg && (
          <div className="p-2 text-xs rounded-lg bg-green-50 border border-green-200 text-green-700">
            {syncSuccessMsg}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
      </div>

      {/* Tabs: Groups | Channels */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("groups")}
          className={cn(
            "flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition whitespace-nowrap",
            activeTab === "groups"
              ? "bg-primary-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          <Users className="h-3 w-3 inline mr-1" />
          {_("groupsChannels.groups")}
        </button>
        <button
          onClick={() => setActiveTab("channels")}
          className={cn(
            "flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition whitespace-nowrap",
            activeTab === "channels"
              ? "bg-primary-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          <Hash className="h-3 w-3 inline mr-1" />
          {_("groupsChannels.channels")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!accountId ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{_("chats.noAccounts")}</p>
          </div>
        ) : !syncedAt && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3">
              <RefreshCw className="h-6 w-6 text-primary-600 animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{_("groupsChannels.neverSynced")}</h3>
            <p className="text-xs text-gray-500 mb-4">{_("groupsChannels.syncRequiredDesc")}</p>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {_("groupsChannels.syncing")}
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {_("groupsChannels.sync")}
                </>
              )}
            </button>
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <ChatRowSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-sm text-red-400 mb-2">{_("groupsChannels.failedToLoad")}</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-primary-600 hover:underline"
            >
              {_("groupsChannels.retry")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            {activeTab === "groups" ? _("groupsChannels.noGroups") : _("groupsChannels.noChannels")}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((chat) => (
              <Link
                key={chat.chat_id}
                href={`/chats?account=${accountId}&chat=${chat.chat_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                  style={{
                    backgroundColor: activeTab === "channels" ? "#dbeafe" : "#f3e8ff",
                    color: activeTab === "channels" ? "#1d4ed8" : "#7c3aed",
                  }}
                >
                  {(chat.title || "?")[0]?.toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold truncate text-gray-900">
                      {chat.title}
                    </h3>
                    {chat.is_creator && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0">
                        <Crown className="h-2.5 w-2.5" />
                        {_("groupsChannels.owner")}
                      </span>
                    )}
                  </div>
                  {chat.username && (
                    <p className="text-xs text-gray-400 truncate">
                      @{chat.username}
                    </p>
                  )}
                </div>

                {/* Chevron */}
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </Link>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-3">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                </button>
                <span className="text-xs text-gray-400">
                  {_("groupsChannels.page")} {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
