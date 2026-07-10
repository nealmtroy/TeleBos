"use client";

import { useState, Suspense, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import { useChatSocket } from "@/hooks/use-socket";
import { cn, formatRelative } from "@/lib/utils";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  MessageSquare,
  Users,
  User,
  Bot,
  Megaphone,
  Search,
  Wifi,
  WifiOff,
  Loader2,
  Send,
  ArrowLeft,
  Reply,
  X,
  Image,
  FileText,
  Video,
  Mic,
  MapPin,
  Phone,
  BarChart3,
  Link2,
  Paperclip,
  ChevronUp,
  Archive,
  ArchiveRestore,
  Trash2,
  CheckSquare,
  Square,
  Check,
  Folder,
} from "lucide-react";

export default function ChatsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <ChatsContent />
    </Suspense>
  );
}

interface ChatItem {
  chat_id: number;
  title: string;
  username: string | null;
  chat_type: string;
  last_message: string | null;
  last_message_time: string | null;
  unread_count: number;
  folder_id?: number | null;
  is_archived?: boolean;
}

interface FolderItem {
  id: string;
  account_id: string;
  folder_id: number;
  title: string;
  emoji: string | null;
  color: number | null;
  included_chat_ids: number[];
}

interface MessageItem {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  text: string | null;
  date: string;
  is_outgoing: boolean;
  reply_to_msg_id: number | null;
  reply_preview: string | null;
  media_type: string | null;
  media_filename: string | null;
}

const MEDIA_ICONS: Record<string, any> = {
  photo: Image,
  video: Video,
  document: FileText,
  voice: Mic,
  audio: Mic,
  sticker: MessageSquare,
  animation: Video,
  location: MapPin,
  contact: Phone,
  poll: BarChart3,
  link: Link2,
  video_note: Video,
  other: Paperclip,
};

type FolderFilter = { type: "all" } | { type: "archived" } | { type: "folder"; folderId: number; label: string };

function ChatsContent() {
  const searchParams = useSearchParams();
  const { data: accounts } = useAccounts();
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<string>(
    searchParams.get("account") || ""
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const _ = useT();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initialChatParam = searchParams.get("chat");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(
    initialChatParam ? Number(initialChatParam) : null
  );
  const [selectedChatTitle, setSelectedChatTitle] = useState("");
  const [selectedChatType, setSelectedChatType] = useState("");

  // ── Folder filter state ──────────────────────────────────────────────────
  const [folderFilter, setFolderFilter] = useState<FolderFilter>({ type: "all" });

  // ── Selection mode state ─────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<number>>(new Set());

  // ── Confirm dialog states ─────────────────────────────────────────────────
  const [deleteChatOpen, setDeleteChatOpen] = useState(false);
  const [deleteChatTarget, setDeleteChatTarget] = useState<ChatItem | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);





  const getApiUrl = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
    if (typeof window !== "undefined" && apiUrl.includes("backend:8000")) {
      return "/api/v1";
    }
    return apiUrl;
  }, []);

  // Auto-select first account
  useEffect(() => {
    const activeAccs = Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : [];
    const isSelectedActive = activeAccs.some(acc => acc.id === selectedAccount);
    if (activeAccs.length > 0 && (!selectedAccount || !isSelectedActive)) {
      setSelectedAccount(activeAccs[0].id);
    }
  }, [accounts, selectedAccount]);

  // Reset selection mode when account changes
  useEffect(() => {
    setSelectionMode(false);
    setSelectedChatIds(new Set());
  }, [selectedAccount]);

  // ── REST fetch for chat list ────────────────────────────────────────────
  const {
    data: chatsData,
    isLoading,
    error,
    refetch,
  } = useQuery<{ chats: ChatItem[]; total: number }>({
    queryKey: ["chats", selectedAccount, page],
    queryFn: async () => {
      const { data } = await api.get(
        `/accounts/${selectedAccount}/chats?page=${page}&page_size=50`
      );
      return data;
    },
    enabled: !!selectedAccount,
  });

  const chats = Array.isArray(chatsData?.chats) ? chatsData.chats : [];

  // Auto-populate selectedChatTitle/type when coming from URL param (e.g. from contacts)
  useEffect(() => {
    if (selectedChatId && !selectedChatTitle) {
      const found = chats.find((c) => c.chat_id === selectedChatId);
      if (found) {
        setSelectedChatTitle(found.title || _("chats.unknown"));
        setSelectedChatType(found.chat_type);
        // Mark chat as read
        api
          .post(`/accounts/${selectedAccount}/chats/${selectedChatId}/read`)
          .catch(() => {});
      }
    }
  }, [selectedChatId, chats, selectedAccount, selectedChatTitle, _]);

  // ── Fetch folders ──────────────────────────────────────────────────────
  const { data: foldersData } = useQuery<{ folders: FolderItem[] }>({
    queryKey: ["folders", selectedAccount],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${selectedAccount}/folders`);
      return data;
    },
    enabled: !!selectedAccount,
  });

  const folders = Array.isArray(foldersData?.folders) ? foldersData.folders : [];

  // Build folder filter list
  const folderFilters = useMemo(() => {
    const filters: FolderFilter[] = [{ type: "all" }, { type: "archived" }];
    for (const f of folders) {
      filters.push({ type: "folder", folderId: f.folder_id, label: f.title });
    }
    return filters;
  }, [folders]);

  // ── Real-time WebSocket updates ─────────────────────────────────────────
  const { connected, setHandler } = useChatSocket(selectedAccount);

  const handleRealtimeEvent = useCallback(
    (data: any) => {
      if (!data || !data.type) return;
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
      queryClient.invalidateQueries({ queryKey: ["folders", selectedAccount] });
      if (selectedChatId) {
        queryClient.invalidateQueries({
          queryKey: ["messages", selectedAccount, selectedChatId],
        });
      }
    },
    [queryClient, selectedAccount, selectedChatId]
  );

  useEffect(() => {
    setHandler(handleRealtimeEvent);
  }, [setHandler, handleRealtimeEvent]);

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = chats;

    // Text search filter
    if (search) {
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(search.toLowerCase()) ||
          c.username?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Folder / archive filter
    if (folderFilter.type === "archived") {
      result = result.filter((c) => c.is_archived === true);
    } else if (folderFilter.type === "folder") {
      result = result.filter((c) => c.folder_id === folderFilter.folderId);
    } else {
      // "all" — show everything including archived
    }

    return result;
  }, [chats, search, folderFilter]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await api.post(`/accounts/${selectedAccount}/chats/${chatId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await api.post(`/accounts/${selectedAccount}/chats/${chatId}/unarchive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await api.delete(`/accounts/${selectedAccount}/chats/${chatId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
    },
  });

  const batchArchiveMutation = useMutation({
    mutationFn: async (chatIds: number[]) => {
      await api.post(`/accounts/${selectedAccount}/chats/batch/archive`, {
        chat_ids: chatIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
      setSelectedChatIds(new Set());
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (chatIds: number[]) => {
      await api.post(`/accounts/${selectedAccount}/chats/batch/delete`, {
        chat_ids: chatIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
      setSelectedChatIds(new Set());
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleSelectChat(chat: ChatItem) {
    if (selectionMode) {
      toggleChatSelection(chat.chat_id);
      return;
    }
    setSelectedChatId(chat.chat_id);
    setSelectedChatTitle(chat.title || _("chats.unknown"));
    setSelectedChatType(chat.chat_type);
    if (selectedAccount) {
      api
        .post(`/accounts/${selectedAccount}/chats/${chat.chat_id}/read`)
        .catch(() => {});
    }
  }

  function handleBackToList() {
    setSelectedChatId(null);
  }

  function toggleChatSelection(chatId: number) {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }

  function handleArchiveClick(e: React.MouseEvent, chat: ChatItem) {
    e.stopPropagation();
    if (chat.is_archived) {
      unarchiveMutation.mutate(chat.chat_id);
    } else {
      archiveMutation.mutate(chat.chat_id);
    }
  }

  function handleDeleteClick(e: React.MouseEvent, chat: ChatItem) {
    e.stopPropagation();
    setDeleteChatTarget(chat);
    setDeleteChatOpen(true);
  }

  function handleConfirmDeleteChat() {
    if (deleteChatTarget) {
      deleteMutation.mutate(deleteChatTarget.chat_id);
    }
    setDeleteChatOpen(false);
    setDeleteChatTarget(null);
  }

  function handleBatchArchive() {
    const ids = Array.from(selectedChatIds);
    if (ids.length === 0) return;
    batchArchiveMutation.mutate(ids);
  }

  function handleBatchDelete() {
    const ids = Array.from(selectedChatIds);
    if (ids.length === 0) return;
    setBatchDeleteOpen(true);
  }

  function handleConfirmBatchDelete() {
    const ids = Array.from(selectedChatIds);
    batchDeleteMutation.mutate(ids);
    setBatchDeleteOpen(false);
  }

  return (
    <>
    <div className="flex h-full w-full bg-white overflow-hidden">
      {/* ── Left Panel: Chat List ───────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col h-full border-r border-slate-200 bg-white transition-all duration-300 ease-in-out relative z-10 shrink-0",
          selectedChatId ? "hidden lg:flex w-[360px] xl:w-[380px]" : "flex-1 lg:w-[360px] lg:flex-shrink-0"
        )}
      >
        {/* List Header */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-slate-900">{_("chats.title")}</h1>
            <div className="flex items-center gap-2">
              {connected ? (
                <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {_("chats.live")}
                </span>
              ) : selectedAccount ? (
                <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
                  <WifiOff className="h-3 w-3" /> {_("chats.offline")}
                </span>
              ) : null}
              {selectedAccount && (
                <button
                  onClick={() => {
                    setSelectionMode((prev) => {
                      if (prev) setSelectedChatIds(new Set());
                      return !prev;
                    });
                  }}
                  className={cn(
                    "p-1.5 rounded-lg transition",
                    selectionMode
                      ? "bg-primary/10 text-primary"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  )}
                  title={selectionMode ? _("chats.exitSelection") : _("chats.selectChats")}
                >
                  <CheckSquare className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <select
            value={selectedAccount}
            onChange={(e) => {
              setSelectedAccount(e.target.value);
              setPage(1);
              setSelectedChatId(null);
              setFolderFilter({ type: "all" });
            }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out bg-slate-50 text-slate-700 font-medium cursor-pointer"
          >
            <option value="">{_("chats.selectAccount")}</option>
            {(Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : []).map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.first_name || acc.phone}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={_("chats.search")}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out"
            />
          </div>
        </div>

        {/* Folder Filter Tabs */}
        {selectedAccount && folderFilters.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 overflow-x-auto no-scrollbar">
            {folderFilters.map((ff) => {
              const isActive =
                (ff.type === "all" && folderFilter.type === "all") ||
                (ff.type === "archived" && folderFilter.type === "archived") ||
                (ff.type === "folder" &&
                  folderFilter.type === "folder" &&
                  folderFilter.folderId === ff.folderId);

              const label =
                ff.type === "all" ? _("chats.all") : ff.type === "archived" ? _("chats.archived") : ff.label;

              return (
                <button
                  key={ff.type === "folder" ? `folder-${ff.folderId}` : ff.type}
                  onClick={() => setFolderFilter(ff)}
                  className={cn(
                    "flex-shrink-0 px-3.5 py-1.5 text-xs font-semibold rounded-full transition whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {ff.type === "archived" && <Archive className="h-3 w-3 inline mr-1" />}
                  {ff.type === "folder" && <Folder className="h-3 w-3 inline mr-1" />}
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Chat list body */}
        <div className="flex-1 overflow-y-auto">
          {!selectedAccount ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 mb-4">
                <MessageSquare className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">
                {Array.isArray(accounts) && accounts.length > 0
                  ? _("chats.selectAccount")
                  : _("chats.noAccounts")}
              </p>
            </div>
          ) : isLoading ? (
            <div className="divide-y divide-slate-50">
              {Array.from({ length: 8 }).map((_, i) => (
                <ChatRowSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <p className="text-sm text-red-500 font-semibold mb-2">{_("chats.failedToLoad")}</p>
              <button onClick={() => refetch()} className="text-sm text-primary hover:underline font-semibold">
                {_("chats.retry")}
              </button>
            </div>
          ) : (
            <>
              {filtered.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400 font-medium py-12">
                  {folderFilter.type === "archived" ? _("chats.noArchived") : _("chats.noChats")}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map((chat) => {
                    const isSelected = selectedChatIds.has(chat.chat_id);
                    const isBusy =
                      archiveMutation.isPending ||
                      unarchiveMutation.isPending ||
                      deleteMutation.isPending;

                    return (
                      <button
                        key={chat.chat_id}
                        onClick={() => handleSelectChat(chat)}
                        className={cn(
                          "flex items-center gap-3.5 px-4 py-3.5 w-full text-left transition-all duration-200 group relative border-b border-slate-100",
                          selectedChatId === chat.chat_id && !selectionMode
                            ? "bg-slate-50 text-slate-900"
                            : "bg-white hover:bg-slate-50/50 text-slate-600 hover:text-slate-900",
                          chat.is_archived && "opacity-60"
                        )}
                      >
                        {/* Selection checkbox */}
                        {selectionMode && (
                          <div className="flex-shrink-0">
                            <div
                              className={cn(
                                "w-5 h-5 rounded border-2 flex items-center justify-center transition",
                                isSelected
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-slate-300"
                              )}
                            >
                              {isSelected && <Check className="h-3.5 w-3.5" />}
                            </div>
                          </div>
                        )}

                        {/* Avatar */}
                        <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 relative bg-slate-100 ring-2 ring-slate-100/50">
                          {isAuthenticated && selectedAccount && (
                            <img
                              src={`${getApiUrl()}/accounts/${selectedAccount}/chats/${chat.chat_id}/photo`}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const fb = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fb) fb.style.display = "flex";
                              }}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          )}
                          <div
                            className={cn(
                              "w-full h-full flex items-center justify-center text-white font-bold text-sm select-none",
                              chat.chat_type === "user" && "bg-gradient-to-br from-blue-500 to-indigo-600",
                              (chat.chat_type === "group" || chat.chat_type === "supergroup") && "bg-gradient-to-br from-emerald-500 to-teal-600",
                              chat.chat_type === "channel" && "bg-gradient-to-br from-violet-500 to-purple-600",
                              chat.chat_type === "bot" && "bg-gradient-to-br from-amber-500 to-orange-600"
                            )}
                            style={{ display: isAuthenticated && selectedAccount ? "none" : "flex" }}
                          >
                            {(chat.title || "?")[0]?.toUpperCase()}
                          </div>

                          {/* Archived badge on avatar */}
                          {chat.is_archived && !selectionMode && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-slate-100 rounded-full flex items-center justify-center shadow-sm border border-white">
                              <Archive className="h-2.5 w-2.5 text-slate-500" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3
                              className={cn(
                                "text-sm font-semibold truncate",
                                chat.is_archived ? "text-slate-400" : "text-slate-900"
                              )}
                            >
                              {chat.title || _("chats.unknown")}
                            </h3>
                            <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
                              {formatRelative(chat.last_message_time)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <p
                              className={cn(
                                "text-xs truncate pr-2 font-medium",
                                chat.unread_count > 0 ? "text-slate-900 font-semibold" : "text-slate-500"
                              )}
                            >
                              {chat.last_message || "—"}
                            </p>
                            {chat.unread_count > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex-shrink-0 shadow-sm">
                                {chat.unread_count > 99 ? "99+" : chat.unread_count}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Hover actions (only when not in selection mode) */}
                        {!selectionMode && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex lg:hidden lg:group-hover:flex items-center gap-1 bg-white pl-2">
                            <button
                              onClick={(e) => handleArchiveClick(e, chat)}
                              disabled={isBusy}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                              title={chat.is_archived ? _("chats.unarchive") : _("chats.archive")}
                            >
                              {chat.is_archived ? (
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              ) : (
                                <Archive className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(e, chat)}
                              disabled={isBusy}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
                              title={_("chats.delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {(page > 1 || (chatsData?.total || 0) > 50) && (
                <div className="flex items-center justify-center gap-2 py-3 border-t border-slate-100 bg-white">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                  >
                    {_("chats.prev")}
                  </button>
                  <span className="text-xs text-gray-400">{_("chats.page")} {page}</span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page * 50 >= (chatsData?.total || 0)}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                  >
                    {_("chats.next")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Batch action bar */}
        {selectionMode && selectedChatIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-700">
              {_("chats.selected", { n: selectedChatIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchArchive}
                disabled={batchArchiveMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                {_("chats.archiveAll")}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleteMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {_("chats.deleteAll")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel: Messages ───────────────────────────────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col h-full bg-slate-50/50 min-w-0 transition-all duration-300 ease-in-out",
          !selectedChatId && "hidden lg:flex"
        )}
      >
        {selectedChatId ? (
          <MessagePane
            key={`${selectedAccount}-${selectedChatId}`}
            accountId={selectedAccount}
            chatId={selectedChatId}
            chatTitle={selectedChatTitle}
            chatType={selectedChatType}
            getApiUrl={getApiUrl}
            onBack={handleBackToList}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/60 flex items-center justify-center mb-5">
              <MessageSquare className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <h2 className="text-base font-bold text-slate-800 mb-1">{_("chats.selectChat")}</h2>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              {_("chats.selectChatDesc")}
            </p>
          </div>
        )}
      </div>
    </div>

    <ConfirmDialog
      open={deleteChatOpen}
      onOpenChange={setDeleteChatOpen}
      onConfirm={handleConfirmDeleteChat}
      title={_("chats.delete")}
      message={_("chats.deleteConfirm", { name: deleteChatTarget?.title || _("chats.unknown") })}
      confirmText={_("chats.delete")}
      cancelText={_("navbar.cancel")}
      variant="danger"
    />

    <ConfirmDialog
      open={batchDeleteOpen}
      onOpenChange={setBatchDeleteOpen}
      onConfirm={handleConfirmBatchDelete}
      title={_("chats.batchDelete")}
      message={_("chats.batchDeleteConfirm", { count: selectedChatIds.size })}
      confirmText={_("chats.delete")}
      cancelText={_("navbar.cancel")}
      variant="danger"
    />
    </>
  );
}

// ── Message Pane Component ──────────────────────────────────────────────────

function MessagePane({
  accountId,
  chatId,
  chatTitle,
  chatType,
  getApiUrl,
  onBack,
}: {
  accountId: string;
  chatId: number;
  chatTitle: string;
  chatType: string;
  getApiUrl: () => string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const _ = useT();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [offsetId, setOffsetId] = useState(0);
  const [allMessages, setAllMessages] = useState<MessageItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch messages — staleTime:0 ensures fresh data on every mount
  const { data: messagesData, isLoading, isFetching } = useQuery<{
    messages: MessageItem[];
    chat_id: number;
    has_more: boolean;
  }>({
    queryKey: ["messages", accountId, chatId, offsetId],
    queryFn: async () => {
      const { data } = await api.get(
        `/accounts/${accountId}/chats/${chatId}/messages?limit=50&offset_id=${offsetId}`
      );
      return data;
    },
    enabled: !!accountId && !!chatId,
    staleTime: 0,
  });

  // Merge fetched messages with existing ones
  useEffect(() => {
    if (!messagesData?.messages) return;
    if (messagesData.chat_id && messagesData.chat_id !== chatId) return;

    const newMsgs = Array.isArray(messagesData.messages) ? messagesData.messages : [];
    setHasMore(messagesData.has_more);

    if (offsetId === 0) {
      setAllMessages(newMsgs);
      setIsInitialLoad(true);
    } else {
      setAllMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNew = newMsgs.filter((m) => !existingIds.has(m.id));
        return [...uniqueNew, ...prev];
      });
      setIsInitialLoad(false);
    }
  }, [messagesData, offsetId, chatId]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (isInitialLoad && allMessages.length > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      });
    }
  }, [allMessages, isInitialLoad]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (params: { text: string; reply_to?: number; file?: File }) => {
      if (params.file) {
        const formData = new FormData();
        formData.append("file", params.file);
        if (params.text) formData.append("caption", params.text);
        if (params.reply_to) formData.append("reply_to", String(params.reply_to));

        const { data } = await api.post(
          `/accounts/${accountId}/chats/${chatId}/media`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );
        return data;
      } else {
        const { data } = await api.post(
          `/accounts/${accountId}/chats/${chatId}/messages`,
          {
            text: params.text,
            reply_to: params.reply_to,
          }
        );
        return data;
      }
    },
    onSuccess: (data) => {
      setAllMessages((prev) => [
        ...prev,
        {
          id: data.id,
          sender_id: null,
          sender_name: "You",
          text: data.text,
          date: data.date,
          is_outgoing: true,
          reply_to_msg_id: replyTo?.id || null,
          reply_preview: null,
          media_type: data.media_type || null,
          media_filename: data.media_filename || null,
        },
      ]);
      setMessageText("");
      setReplyTo(null);
      setAttachedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
      queryClient.invalidateQueries({ queryKey: ["chats", accountId] });
    },
  });

  function handleSend() {
    const text = messageText.trim();
    if ((!text && !attachedFile) || sendMutation.isPending) return;
    sendMutation.mutate({ text, reply_to: replyTo?.id, file: attachedFile || undefined });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleLoadOlder() {
    if (allMessages.length > 0) {
      setOffsetId(allMessages[0].id);
    }
  }

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: MessageItem[] }[] = [];
    let currentDate = "";
    for (const msg of allMessages) {
      const d = new Date(msg.date);
      const dateStr = d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ date: dateStr, messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [allMessages]);

  function getReplyText(msgId: number | null): string | null {
    if (!msgId) return null;
    const target = allMessages.find((m) => m.id === msgId);
    if (target) return target.text || "[media]";
    return null;
  }

  return (
    <>
      {/* Chat header */}
      <div className="flex items-center gap-3.5 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={onBack}
          className="lg:hidden p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl transition duration-200 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-slate-100 relative ring-2 ring-slate-100/50">
          {isAuthenticated && accountId && (
            <img
              src={`${getApiUrl()}/accounts/${accountId}/chats/${chatId}/photo`}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fb = e.currentTarget.nextElementSibling as HTMLElement;
                if (fb) fb.style.display = "flex";
              }}
              className="w-full h-full object-cover"
              alt=""
            />
          )}
          <div
            className={cn(
              "w-full h-full flex items-center justify-center text-white font-bold text-sm select-none",
              chatType === "user" && "bg-gradient-to-br from-blue-500 to-indigo-600",
              (chatType === "group" || chatType === "supergroup") && "bg-gradient-to-br from-emerald-500 to-teal-600",
              chatType === "channel" && "bg-gradient-to-br from-violet-500 to-purple-600",
              chatType === "bot" && "bg-gradient-to-br from-amber-500 to-orange-600"
            )}
            style={{ display: isAuthenticated && accountId ? "none" : "flex" }}
          >
            {(chatTitle || "?")[0]?.toUpperCase()}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 truncate">{chatTitle}</h2>
          <p className="text-xs text-slate-400 font-semibold capitalize tracking-wide">{chatType}</p>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      >
        {isLoading && allMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center mb-4">
              <MessageSquare className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500">{_("chats.noMessages")}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-1">
            {/* Load older button */}
            {hasMore && (
              <div className="flex justify-center py-3">
                <button
                  onClick={handleLoadOlder}
                  disabled={isFetching}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:shadow-sm transition disabled:opacity-50"
                >
                  {isFetching ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                  {_("chats.loadOlder")}
                </button>
              </div>
            )}

            {groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex items-center justify-center py-4">
                  <span className="px-3.5 py-1 bg-slate-100/90 backdrop-blur-sm text-[10px] text-slate-500 rounded-full border border-slate-200/50 font-semibold select-none">
                    {group.date}
                  </span>
                </div>

                {group.messages.map((msg, idx) => {
                  const isOut = msg.is_outgoing;
                  const showName =
                    !isOut &&
                    (chatType === "group" || chatType === "supergroup") &&
                    (idx === 0 || group.messages[idx - 1]?.sender_id !== msg.sender_id);

                  const replyText = getReplyText(msg.reply_to_msg_id);
                  const MediaIcon = msg.media_type ? MEDIA_ICONS[msg.media_type] || Paperclip : null;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex mb-1",
                        isOut ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "group relative max-w-[75%] min-w-[80px] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed shadow-sm",
                          isOut
                            ? "bg-primary text-primary-foreground rounded-br-none"
                            : "bg-white text-slate-800 rounded-bl-none border border-slate-100/80"
                        )}
                      >
                        {/* Sender name in groups */}
                        {showName && msg.sender_name && (
                          <p className="text-[11px] font-bold text-primary mb-1 truncate">
                            {msg.sender_name}
                          </p>
                        )}

                        {/* Reply reference */}
                        {msg.reply_to_msg_id && (
                          <div
                            className={cn(
                              "flex items-center gap-1.5 mb-1 px-2.5 py-1.5 rounded-lg text-[10px] border-l-2 font-medium",
                              isOut
                                ? "bg-black/10 border-white/60 text-white/90"
                                : "bg-slate-50 border-primary/50 text-slate-500"
                            )}
                          >
                            <Reply className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{replyText || "..."}</span>
                          </div>
                        )}

                        {/* Media badge */}
                        {MediaIcon && (
                          <div
                            className={cn(
                              "inline-flex items-center gap-1.5 text-[11px] mb-1 font-semibold",
                              isOut ? "text-primary-100" : "text-slate-500"
                            )}
                          >
                            <MediaIcon className="h-3.5 w-3.5" />
                            {msg.media_filename || msg.media_type}
                          </div>
                        )}

                        {/* Message text */}
                        {msg.text && (
                          <p className="whitespace-pre-wrap break-words">
                            {msg.text}
                          </p>
                        )}

                        {/* Timestamp + reply button */}
                        <div
                          className={cn(
                            "flex items-center gap-2 mt-1",
                            isOut ? "justify-end" : "justify-between"
                          )}
                        >
                          <span
                            className={cn(
                              "text-[9px] font-medium tracking-wide select-none",
                              isOut ? "text-primary-100" : "text-slate-400"
                            )}
                          >
                            {new Date(msg.date).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </span>

                          <button
                            onClick={() => setReplyTo(msg)}
                            className={cn(
                              "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded",
                              isOut
                                ? "hover:bg-black/10 text-primary-100"
                                : "hover:bg-slate-100 text-slate-400"
                            )}
                            title={_("chats.reply")}
                          >
                            <Reply className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Reply preview bar ──────────────────────────────────────── */}
      {replyTo && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-t border-primary/10">
          <Reply className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-primary truncate">
              {replyTo.sender_name || "Message"}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {replyTo.text || "[media]"}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 hover:bg-primary/10 rounded-lg transition"
          >
            <X className="h-4 w-4 text-primary/60" />
          </button>
        </div>
      )}

      {/* ── Attached file preview bar ────────────────────────────────── */}
      {attachedFile && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-t border-slate-100">
          <Paperclip className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-700 truncate">
              {attachedFile.name}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {(attachedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={() => setAttachedFile(null)}
            className="p-1 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      )}

      {/* ── Message input bar ──────────────────────────────────────── */}
      <div className="flex items-end gap-2 px-4 py-3 bg-white border-t border-slate-100 flex-shrink-0">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition flex-shrink-0"
          title={_("chats.attachFile")}
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setAttachedFile(file);
            }
          }}
          className="hidden"
        />
        <textarea
          ref={inputRef}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={attachedFile ? _("chats.addCaption") : _("chats.typeMessage")}
          rows={1}
          className="flex-1 resize-none px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out max-h-32 leading-relaxed"
          style={{
            height: "auto",
            minHeight: "40px",
            overflow: messageText.split("\n").length > 3 ? "auto" : "hidden",
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 128) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={(!messageText.trim() && !attachedFile) || sendMutation.isPending}
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 flex-shrink-0 flex items-center justify-center",
            messageText.trim() || attachedFile
              ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-95 shadow-sm"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          )}
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Send error */}
      {sendMutation.isError && (
        <div className="px-4 py-1.5 bg-red-50 text-xs text-red-600 border-t border-red-100">
          {_("chats.sendFailed")}
        </div>
      )}
    </>
  );
}
