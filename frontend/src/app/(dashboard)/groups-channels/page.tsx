"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import { useChats, type ChatItem } from "@/hooks/use-chats";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Search, ChevronLeft, ChevronRight, Users, Hash, Crown, Loader2, MessageSquare, Plus, X, Link as LinkIcon, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";

export default function GroupsChannelsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <GroupsChannelsContent />
    </Suspense>
  );
}

function GroupsChannelsContent() {
  const searchParams = useSearchParams();
  const _ = useT();
  const { data: accounts } = useAccounts();
  const [selectedAccount, setSelectedAccount] = useState<string>(
    searchParams.get("account") || ""
  );
  const [activeTab, setActiveTab] = useState<"groups" | "channels">("groups");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncSuccessMsg, setSyncSuccessMsg] = useState("");

  const activeAccountObj = (Array.isArray(accounts) ? accounts : []).find(acc => acc.id === selectedAccount);
  const syncedAt = activeAccountObj?.groups_channels_synced_at;

  const handleSync = async () => {
    if (!selectedAccount) return;
    setIsSyncing(true);
    setSyncError("");
    setSyncSuccessMsg("");
    try {
      const api = (await import("@/lib/api")).default;
      await api.post(`/accounts/${selectedAccount}/chats/sync-groups-channels`);
      setSyncSuccessMsg(_("groupsChannels.syncSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setTimeout(() => setSyncSuccessMsg(""), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || _("groupsChannels.syncFailed");
      setSyncError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinIdentifier, setJoinIdentifier] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinResult, setJoinResult] = useState<{ title: string; chat_type: string } | null>(null);

  const chatType = activeTab === "groups" ? "group,supergroup" : "channel";

  // Auto-select first account
  useEffect(() => {
    const activeAccs = Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : [];
    const isSelectedActive = activeAccs.some(acc => acc.id === selectedAccount);
    if (activeAccs.length > 0 && (!selectedAccount || !isSelectedActive)) {
      setSelectedAccount(activeAccs[0].id);
    }
  }, [accounts, selectedAccount]);

  // Reset when switching account
  useEffect(() => {
    setPage(1);
    setSearch("");
    setActiveTab("groups");
  }, [selectedAccount]);

  // ── Join handler ─────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!selectedAccount || !joinIdentifier.trim()) return;
    setJoinError("");
    setJoinSuccess("");
    setJoinResult(null);
    setIsJoining(true);

    try {
      const api = (await import("@/lib/api")).default;
      const { data } = await api.post(
        `/accounts/${selectedAccount}/chats/join`,
        { identifier: joinIdentifier.trim() }
      );
      setJoinResult(data);
      setJoinSuccess(_("groupsChannels.joinedSuccess"));
      setJoinIdentifier("");
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || _("groupsChannels.joinFailed");
      setJoinError(msg);
    } finally {
      setIsJoining(false);
    }
  };

  const openJoinModal = () => {
    setJoinIdentifier("");
    setJoinError("");
    setJoinSuccess("");
    setJoinResult(null);
    setShowJoinModal(true);
  };

  const {
    data: chatsData,
    isLoading,
    error,
    refetch,
  } = useChats(selectedAccount, page, 50, chatType);

  const chats = chatsData?.chats ?? [];
  const total = chatsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  // Client-side filter
  const q = search.toLowerCase();
  const filtered = q
    ? chats.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.username && c.username.toLowerCase().includes(q))
      )
    : chats;

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      {/* Header with account selector */}
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{_("groupsChannels.title")}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={!selectedAccount || isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
              {isSyncing ? _("groupsChannels.syncing") : _("groupsChannels.sync")}
            </button>
            <button
              onClick={openJoinModal}
              disabled={!selectedAccount}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              {_("groupsChannels.joinNew")}
            </button>
          </div>
        </div>

        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-gray-700"
        >
          <option value="">{_("chats.selectAccount")}</option>
          {(Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : []).map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.first_name || acc.phone}
            </option>
          ))}
        </select>

        {selectedAccount && syncedAt && (
          <div className="text-[11px] text-gray-500 flex items-center justify-between">
            <span>
              {_("groupsChannels.lastSynced").replace("{time}", new Date(syncedAt).toLocaleString())}
            </span>
          </div>
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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={activeTab === "groups" ? _("groupsChannels.searchGroups") : _("groupsChannels.searchChannels")}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto scrollbar-none">
        <button
          onClick={() => { setActiveTab("groups"); setPage(1); setSearch(""); }}
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
          onClick={() => { setActiveTab("channels"); setPage(1); setSearch(""); }}
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

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {!selectedAccount ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{_("chats.selectAccount")}</p>
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
            <button onClick={() => refetch()} className="text-sm text-primary-600 hover:underline">
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
                href={`/chats?account=${selectedAccount}&chat=${chat.chat_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
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
                    <h3 className="text-sm font-semibold truncate text-gray-900">{chat.title}</h3>
                    {chat.is_creator && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0">
                        <Crown className="h-2.5 w-2.5" />
                        {_("groupsChannels.owner")}
                      </span>
                    )}
                  </div>
                  {chat.username && <p className="text-xs text-gray-400 truncate">@{chat.username}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </Link>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-3">
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

      {/* ── Join Modal ───────────────────────────────────────────────────────── */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowJoinModal(false)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-base font-bold text-gray-900">{_("groupsChannels.joinNew")}</h2>
              <button
                onClick={() => setShowJoinModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 pb-5 space-y-4">
              <p className="text-sm text-gray-500">{_("groupsChannels.joinDescription")}</p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {_("groupsChannels.identifier")}
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={joinIdentifier}
                    onChange={(e) => { setJoinIdentifier(e.target.value); setJoinError(""); setJoinSuccess(""); setJoinResult(null); }}
                    placeholder={_("groupsChannels.joinPlaceholder")}
                    onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* Error */}
              {joinError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                  {joinError}
                </div>
              )}

              {/* Success */}
              {joinSuccess && joinResult && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 space-y-1">
                  <p className="font-medium">{joinSuccess}</p>
                  <p className="text-green-600">
                    <span className="font-medium">{joinResult.title}</span>
                    {" — "}
                    <span className="capitalize">{joinResult.chat_type}</span>
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  {joinResult ? _("common.close") : _("navbar.cancel")}
                </button>
                {!joinResult && (
                  <button
                    onClick={handleJoin}
                    disabled={isJoining || !joinIdentifier.trim()}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-1.5"
                  >
                    {isJoining ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {_("groupsChannels.joining")}
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        {_("groupsChannels.join")}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
