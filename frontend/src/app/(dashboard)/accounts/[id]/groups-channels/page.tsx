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
import { DataPagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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

  // Client-side search filter
  const q = search.toLowerCase();
  const filtered = q
    ? chats.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.username && c.username.toLowerCase().includes(q))
      )
    : chats;

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 bg-card rounded-xl overflow-hidden border border-border shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-muted/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/accounts/${accountId}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-foreground hover:bg-muted shadow-2xs transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-base font-bold text-foreground">
              {account?.first_name || account?.phone || _("groupsChannels.title")}
            </h1>
            <p className="text-xs text-muted-foreground">{_("groupsChannels.title")}</p>
          </div>
        </div>
        <Button
          onClick={handleSync}
          disabled={!accountId || isSyncing}
          variant="outline"
          className="text-xs h-9 border-slate-300 dark:border-slate-700 bg-card shadow-2xs cursor-pointer"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isSyncing && "animate-spin text-primary")} />
          <span>{isSyncing ? _("groupsChannels.syncing") : _("groupsChannels.sync")}</span>
        </Button>
      </div>

      {/* Sync Status / Errors */}
      <div className="px-4 pt-2 pb-0 space-y-2">
        {accountId && syncedAt && (
          <p className="text-[11px] text-muted-foreground">
            {_("groupsChannels.lastSynced").replace("{time}", new Date(syncedAt).toLocaleString())}
          </p>
        )}

        {syncError && (
          <div className="p-2 text-xs rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300">
            {syncError}
          </div>
        )}

        {syncSuccessMsg && (
          <div className="p-2 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
            {syncSuccessMsg}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="account-groups-channels-search"
            name="search"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
            placeholder={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
            className="w-full pl-9 pr-4 py-2 bg-card border border-slate-300 dark:border-slate-700 text-foreground placeholder:text-muted-foreground rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none shadow-2xs"
          />
        </div>
      </div>

      {/* Tabs: Groups | Channels */}
      <div className="px-3 py-2 border-b border-border">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "groups" | "channels")}
        >
          <TabsList className="h-8 bg-muted p-0.5">
            <TabsTrigger value="groups" className="text-xs px-3 py-1 gap-1 data-[state=active]:bg-primary-600 data-[state=active]:text-white">
              <Users className="h-3 w-3" />
              {_("groupsChannels.groups")}
            </TabsTrigger>
            <TabsTrigger value="channels" className="text-xs px-3 py-1 gap-1 data-[state=active]:bg-primary-600 data-[state=active]:text-white">
              <Hash className="h-3 w-3" />
              {_("groupsChannels.channels")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!accountId ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{_("chats.noAccounts")}</p>
          </div>
        ) : !syncedAt && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <RefreshCw className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">{_("groupsChannels.neverSynced")}</h3>
            <p className="text-xs text-muted-foreground mb-4">{_("groupsChannels.syncRequiredDesc")}</p>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
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
          <div className="divide-y divide-border/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <ChatRowSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-sm text-rose-500 mb-2">{_("groupsChannels.failedToLoad")}</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-primary hover:underline"
            >
              {_("groupsChannels.retry")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {activeTab === "groups" ? _("groupsChannels.noGroups") : _("groupsChannels.noChannels")}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((chat) => (
              <Link
                key={chat.chat_id}
                href={`/chats?account=${accountId}&chat=${chat.chat_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm",
                    activeTab === "channels"
                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  )}
                >
                  {(chat.title || "?")[0]?.toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold truncate text-foreground">
                      {chat.title}
                    </h3>
                    {chat.is_creator && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/30 flex-shrink-0">
                        <Crown className="h-2.5 w-2.5" />
                        {_("groupsChannels.owner")}
                      </span>
                    )}
                  </div>
                  {chat.username && (
                    <p className="text-xs text-muted-foreground truncate">
                      @{chat.username}
                    </p>
                  )}
                </div>

                {/* Chevron */}
                <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
              </Link>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="py-2 border-t border-border">
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
