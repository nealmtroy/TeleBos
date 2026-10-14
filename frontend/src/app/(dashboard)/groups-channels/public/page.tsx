"use client";

import { useState, Suspense, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { usePublicChatsIndex, type ChatItem } from "@/hooks/use-chats";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import {
  Search, ChevronLeft, ChevronRight, Users, Hash, Crown, Loader2, MessageSquare, Link as LinkIcon, ShieldAlert,
} from "lucide-react";
import { DataPagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getTelegramAvatarColor, getPublicChatPhotoUrl } from "@/lib/avatar";

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

  // Check if user has access to Public Index (Pro, Business, Owner only)
  const isRestricted = user?.role !== "pro" && user?.role !== "premium" && user?.role !== "owner";

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
    return chat.username ? `https://t.me/${chat.username}` : "";
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

  // ── 1. Subscription Wall (Pro & Business Only) ──────────────────────────────
  if (isRestricted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400 shadow-2xs">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">
          {_("groupsChannels.proOnly")}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {_("groupsChannels.proOnlyDesc")}
        </p>
        <Link
          href="/subscriptions"
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-xs transition-all active:scale-95"
        >
          <Crown className="h-4 w-4 mr-2" />
          {_("groupsChannels.upgradeNow")}
        </Link>
      </div>
    );
  }

  // ── 2. Pro/Premium/Owner Index Finder ─────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-7rem)] -m-4 md:-m-6 bg-card text-card-foreground overflow-hidden border-t border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {_("groupsChannels.publicIndex")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {_("groupsChannels.publicIndexDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {chats.some(chat => getInviteLink(chat)) && (
              <Button
                variant="outline"
                onClick={handleCopyAll}
                className="h-9 px-3 text-xs cursor-pointer"
              >
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                {copiedAll ? _("groupsChannels.copiedAllLinks") : _("groupsChannels.copyAllLinks")}
              </Button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="public-groups-channels-search"
              name="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
              aria-label={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring outline-none"
            />
          </div>
          <Button
            type="submit"
            className="h-9 px-4 text-xs font-semibold cursor-pointer"
          >
            {_("groupsChannels.join")}
          </Button>
        </form>
      </div>

      {/* Tabs & Sort */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val as "groups" | "channels");
            setSearchQuery("");
            setSearch("");
          }}
        >
          <TabsList className="h-8 bg-muted p-0.5">
            <TabsTrigger
              value="groups"
              className="text-xs px-3 py-1 gap-1 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-border/60 transition-colors"
            >
              <Users className="h-3 w-3" />
              {_("groupsChannels.groups")}
            </TabsTrigger>
            <TabsTrigger
              value="channels"
              className="text-xs px-3 py-1 gap-1 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-border/60 transition-colors"
            >
              <Hash className="h-3 w-3" />
              {_("groupsChannels.channels")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sort Select */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">Sort:</span>
          <Select
            value={sortBy}
            onValueChange={(val) => {
              setSortBy(val as any);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member_count">{_("groupsChannels.memberCount") || "Total Members"}</SelectItem>
              <SelectItem value="online_count">{_("groupsChannels.onlineCount") || "Active Members"}</SelectItem>
            </SelectContent>
          </Select>
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
                  <Avatar
                    className="w-10 h-10 rounded-full ring-2 ring-slate-100/50 dark:ring-slate-800 shrink-0 font-bold text-white select-none"
                    style={{ backgroundColor: getTelegramAvatarColor(chat.chat_id, chat.color_id) }}
                  >
                    {chat.username ? (
                      <AvatarImage
                        src={getPublicChatPhotoUrl(chat.username)}
                        alt={chat.title || ""}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="font-semibold text-sm text-white bg-transparent">
                      {chat.title ? chat.title.charAt(0).toUpperCase() : (activeTab === "channels" ? "C" : "G")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold truncate text-gray-900 dark:text-slate-100">{chat.title}</h2>
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
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
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
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition shrink-0 relative group"
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
              <div className="py-2 border-t border-gray-100 dark:border-slate-800">
                <DataPagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  compact
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
