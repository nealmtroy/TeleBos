"use client";

import { useState, Suspense, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { usePublicChatsIndex, type ChatItem } from "@/hooks/use-chats";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import {
  Search, ChevronLeft, ChevronRight, Users, Hash, Crown, Loader2, MessageSquare, Link as LinkIcon, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";

const getApiUrl = () => {
  if (typeof window !== "undefined") {
    return (process.env.NEXT_PUBLIC_API_URL || window.location.origin + "/api/v1").replace(/\/+$/, "");
  }
  return (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "") + "/api/v1";
};

export default function PublicGroupsChannelsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <PublicGroupsChannelsContent />
    </Suspense>
  );
}

function PublicGroupsChannelsContent() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<"groups" | "channels">("groups");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // Submitted search
  const [sortBy, setSortBy] = useState<"member_count" | "online_count">("member_count");

  const [copiedChatId, setCopiedChatId] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Check if user is Basic member
  const isBasic = user?.role === "basic";

  const chatType = activeTab === "groups" ? "group,supergroup" : "channel";

  const {
    data: chatsData,
    isLoading,
    error,
    refetch,
  } = usePublicChatsIndex(page, 50, searchQuery, chatType, sortBy);

  const chats = chatsData?.chats ?? [];
  const total = chatsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const getInviteLink = (chat: ChatItem) => {
    return chat.invite_link || (chat.username ? `https://t.me/${chat.username}` : "");
  };

  const handleCopyLink = (e: React.MouseEvent, chat: ChatItem) => {
    e.preventDefault();
    e.stopPropagation();
    const link = getInviteLink(chat);
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedChatId(chat.chat_id);
      setTimeout(() => setCopiedChatId(null), 2000);
    }
  };

  const handleCopyAll = () => {
    const links = chats
      .map((chat) => getInviteLink(chat))
      .filter((link) => !!link);
    if (links.length > 0) {
      navigator.clipboard.writeText(links.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  // Reset page when tab changes
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  // Handle search submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(search.trim());
    setPage(1);
  };

  // ── 1. Basic User Subscription Wall ──────────────────────────────────────────
  if (isBasic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-amber-500 shadow-sm animate-bounce">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {_("groupsChannels.proOnly")}
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {_("groupsChannels.proOnlyDesc")}
        </p>
        <Link
          href="/subscriptions"
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md transition-all hover:scale-105 active:scale-95"
        >
          <Crown className="h-4 w-4 mr-2" />
          {_("groupsChannels.upgradeNow")}
        </Link>
      </div>
    );
  }

  // ── 2. Pro/Premium/Owner Index Finder ─────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-7rem)] -m-6 bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {_("groupsChannels.publicIndex")}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {_("groupsChannels.publicIndexDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {chats.some(chat => getInviteLink(chat)) && (
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                {copiedAll ? _("groupsChannels.copiedAllLinks") : _("groupsChannels.copyAllLinks")}
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition flex items-center justify-center"
          >
            {_("groupsChannels.join")}
          </button>
        </form>
      </div>

      {/* Tabs & Sort */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setActiveTab("groups"); setSearchQuery(""); setSearch(""); }}
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
            onClick={() => { setActiveTab("channels"); setSearchQuery(""); setSearch(""); }}
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

        {/* Sort Select */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setPage(1);
            }}
            className="px-2 py-1 text-xs border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-700"
          >
            <option value="member_count">{_("groupsChannels.memberCount") || "Total Members"}</option>
            <option value="online_count">{_("groupsChannels.onlineCount") || "Active Members"}</option>
          </select>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <ChatRowSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-sm text-red-400 mb-2">{_("groupsChannels.failedToLoad")}</p>
            <button onClick={() => refetch()} className="text-sm text-primary-600 hover:underline">
              {_("groupsChannels.retry")}
            </button>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{_("groupsChannels.noPublicChats")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {chats.map((chat) => {
              const linkToCopy = getInviteLink(chat);
              return (
                <div
                  key={chat.chat_id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full flex-shrink-0 relative bg-slate-100 ring-2 ring-slate-100/50 overflow-hidden flex items-center justify-center">
                    {chat.account_id && (
                      <img
                        src={`${getApiUrl()}/accounts/${chat.account_id}/chats/${chat.chat_id}/photo`}
                        onLoad={(e) => {
                          const fb = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fb) fb.style.display = "none";
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        className="w-full h-full object-cover rounded-full"
                        alt=""
                      />
                    )}
                    <div
                      className="w-full h-full flex items-center justify-center text-white font-bold text-sm select-none rounded-full"
                      style={{
                        backgroundColor: activeTab === "channels" ? "#dbeafe" : "#f3e8ff",
                        color: activeTab === "channels" ? "#1d4ed8" : "#7c3aed",
                      }}
                    >
                      {(chat.title || "?")[0]?.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate text-gray-900">{chat.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {chat.username && <span className="text-xs text-gray-400">@{chat.username}</span>}
                      {chat.username && (chat.member_count !== undefined && chat.member_count !== null || chat.online_count !== undefined && chat.online_count !== null) && <span className="text-gray-300 text-xs">•</span>}
                      {chat.member_count !== undefined && chat.member_count !== null && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {chat.member_count.toLocaleString()}
                        </span>
                      )}
                      {chat.online_count !== undefined && chat.online_count !== null && (
                        <>
                          <span className="text-gray-300 text-xs">•</span>
                          <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                            {chat.online_count.toLocaleString()} {_("groupsChannels.onlineCount")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {linkToCopy && (
                      <button
                        onClick={(e) => handleCopyLink(e, chat)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition flex-shrink-0 relative group"
                        title={_("groupsChannels.copyLink")}
                      >
                        {copiedChatId === chat.chat_id ? (
                          <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded border border-green-200 whitespace-nowrap">
                            {_("groupsChannels.copiedLink")}
                          </span>
                        ) : (
                          <LinkIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-50">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                </button>
                <span className="text-xs text-gray-400">{_("groupsChannels.page")} {page} / {totalPages}</span>
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
