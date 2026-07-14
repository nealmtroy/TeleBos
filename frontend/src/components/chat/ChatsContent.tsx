import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";
import { useChatSocket } from "@/hooks/use-socket";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChatItem, FolderFilter, FolderItem } from "./types";
import { ChatLeftColumn } from "./ChatLeftColumn";
import { MessagePane } from "./MessagePane";
import "./chat.css";

export function ChatsContent() {
  const searchParams = useSearchParams();
  const { data: accounts } = useAccounts();
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<string>(
    searchParams.get("account") || ""
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const t = useT();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initialChatParam = searchParams.get("chat");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(
    initialChatParam ? Number(initialChatParam) : null
  );
  const [selectedChatTitle, setSelectedChatTitle] = useState("");
  const [selectedChatType, setSelectedChatType] = useState("");

  const [folderFilter, setFolderFilter] = useState<FolderFilter>({ type: "all" });
  const [typingChats, setTypingChats] = useState<Record<number, string>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<number, boolean>>({});
  const [showLeftMenu, setShowLeftMenu] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<number>>(new Set());

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
    const activeAccs = Array.isArray(accounts)
      ? accounts.filter((acc) => acc.is_active && !acc.for_sale)
      : [];
    const isSelectedActive = activeAccs.some((acc) => acc.id === selectedAccount);
    if (activeAccs.length > 0 && (!selectedAccount || !isSelectedActive)) {
      setSelectedAccount(activeAccs[0].id);
    }
  }, [accounts, selectedAccount]);

  // Reset selection mode when account changes
  useEffect(() => {
    setSelectionMode(false);
    setSelectedChatIds(new Set());
  }, [selectedAccount]);

  // REST fetch for chat list
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

  const [loadedChats, setLoadedChats] = useState<ChatItem[]>([]);

  useEffect(() => {
    if (!chatsData?.chats) return;
    if (page === 1) {
      setLoadedChats(chatsData.chats);
    } else {
      setLoadedChats((prev) => {
        const existingIds = new Set(prev.map((c) => c.chat_id));
        const uniqueNew = chatsData.chats.filter((c) => !existingIds.has(c.chat_id));
        return [...prev, ...uniqueNew];
      });
    }
  }, [chatsData, page]);

  useEffect(() => {
    setPage(1);
    setLoadedChats([]);
  }, [selectedAccount]);

  const chats = loadedChats;

  // Auto-populate selectedChatTitle/type when coming from URL param (e.g. from contacts)
  useEffect(() => {
    if (selectedChatId && !selectedChatTitle) {
      const found = chats.find((c) => c.chat_id === selectedChatId);
      if (found) {
        setSelectedChatTitle(found.title || t("chats.unknown"));
        setSelectedChatType(found.chat_type);
        api
          .post(`/accounts/${selectedAccount}/chats/${selectedChatId}/read`)
          .catch(() => {});
      }
    }
  }, [selectedChatId, chats, selectedAccount, selectedChatTitle, t]);

  // Fetch folders
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

  // Real-time WebSocket updates
  const { connected, setHandler } = useChatSocket(selectedAccount);

  const handleRealtimeEvent = useCallback(
    (data: any) => {
      if (!data || !data.type) return;

      if (data.type === "typing") {
        setTypingChats((prev) => ({
          ...prev,
          [data.chat_id]: data.action || "typing",
        }));

        setTimeout(() => {
          setTypingChats((prev) => {
            const next = { ...prev };
            delete next[data.chat_id];
            return next;
          });
        }, 4000);
      } else if (data.type === "user_update") {
        setOnlineUsers((prev) => ({
          ...prev,
          [data.user_id]: data.status.includes("Online") || data.status.includes("online"),
        }));
      } else if (data.type === "new_message" || data.type === "outgoing_message") {
        const isMsgFromActiveChat = data.chat_id === selectedChatId;
        
        setLoadedChats((prev) =>
          prev.map((c) =>
            c.chat_id === data.chat_id
              ? {
                  ...c,
                  last_message: data.text || (data.media_type ? `[${data.media_type}]` : ""),
                  last_message_time: data.date || new Date().toISOString(),
                  unread_count: isMsgFromActiveChat ? 0 : c.unread_count + (data.is_outgoing ? 0 : 1),
                }
              : c
          )
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
        queryClient.invalidateQueries({ queryKey: ["folders", selectedAccount] });
      }
    },
    [queryClient, selectedAccount, selectedChatId]
  );

  useEffect(() => {
    setHandler(handleRealtimeEvent);
  }, [setHandler, handleRealtimeEvent]);

  // Filter chats
  const filteredChats = useMemo(() => {
    let result = chats;

    if (search) {
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(search.toLowerCase()) ||
          c.username?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (folderFilter.type === "archived") {
      result = result.filter((c) => c.is_archived === true);
    } else if (folderFilter.type === "folder") {
      const targetFolder = folders.find((f) => f.folder_id === folderFilter.folderId);
      if (targetFolder) {
        result = result.filter((c) => targetFolder.included_chat_ids.includes(c.chat_id));
      } else {
        result = [];
      }
    } else {
      result = result.filter((c) => c.is_archived !== true);
    }

    return result;
  }, [chats, search, folderFilter, folders]);

  // Mutations
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

  const pinMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await api.post(`/accounts/${selectedAccount}/chats/${chatId}/pin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await api.post(`/accounts/${selectedAccount}/chats/${chatId}/unpin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
    },
  });

  const muteMutation = useMutation({
    mutationFn: async (params: { chatId: number; duration?: number }) => {
      await api.post(`/accounts/${selectedAccount}/chats/${params.chatId}/mute`, {
        duration: params.duration,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
    },
  });

  const unmuteMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await api.post(`/accounts/${selectedAccount}/chats/${chatId}/unmute`);
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

  const batchUnarchiveMutation = useMutation({
    mutationFn: async (chatIds: number[]) => {
      await api.post(`/accounts/${selectedAccount}/chats/batch/unarchive`, {
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

  // Handlers
  function handleSelectChat(chat: ChatItem) {
    if (selectionMode) {
      setSelectedChatIds((prev) => {
        const next = new Set(prev);
        if (next.has(chat.chat_id)) {
          next.delete(chat.chat_id);
        } else {
          next.add(chat.chat_id);
        }
        return next;
      });
      return;
    }
    setSelectedChatId(chat.chat_id);
    setSelectedChatTitle(chat.title || t("chats.unknown"));
    setSelectedChatType(chat.chat_type);
    if (selectedAccount) {
      queryClient.setQueryData<{ chats: ChatItem[]; total: number }>(
        ["chats", selectedAccount, page],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            chats: old.chats.map((c) =>
              c.chat_id === chat.chat_id ? { ...c, unread_count: 0 } : c
            ),
          };
        }
      );

      api
        .post(`/accounts/${selectedAccount}/chats/${chat.chat_id}/read`)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["chats", selectedAccount] });
        })
        .catch(() => {});
    }
  }

  function handleBackToList() {
    setSelectedChatId(null);
  }

  function handleArchiveClick(e: React.MouseEvent | null, chat: ChatItem) {
    if (e) e.stopPropagation();
    if (chat.is_archived) {
      unarchiveMutation.mutate(chat.chat_id);
    } else {
      archiveMutation.mutate(chat.chat_id);
    }
  }

  function handleDeleteClick(e: React.MouseEvent | null, chat: ChatItem) {
    if (e) e.stopPropagation();
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
    if (folderFilter.type === "archived") {
      batchUnarchiveMutation.mutate(ids);
    } else {
      batchArchiveMutation.mutate(ids);
    }
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
      <style>{`
        .telegram-wallpaper {
          background-color: #e7ebf0;
          background-image: radial-gradient(rgba(0,0,0,0.06) 1.2px, transparent 0), radial-gradient(rgba(0,0,0,0.06) 1.2px, transparent 0);
          background-size: 24px 24px;
          background-position: 0 0, 12px 12px;
        }
        .dark .telegram-wallpaper {
          background-color: #0e1621;
          background-image: radial-gradient(rgba(255,255,255,0.04) 1.2px, transparent 0), radial-gradient(rgba(255,255,255,0.04) 1.2px, transparent 0);
          background-size: 24px 24px;
          background-position: 0 0, 12px 12px;
        }
        .bubble-out {
          background-color: #eeffde !important;
          color: #000000 !important;
        }
        .dark .bubble-out {
          background-color: #2b5278 !important;
          color: #f5f5f5 !important;
        }
        .bubble-in {
          background-color: #ffffff !important;
          color: #000000 !important;
        }
        .dark .bubble-in {
          background-color: #182533 !important;
          color: #f5f5f5 !important;
        }
        .tail-out {
          color: #eeffde !important;
        }
        .dark .tail-out {
          color: #2b5278 !important;
        }
        .tail-in {
          color: #ffffff !important;
        }
        .dark .tail-in {
          color: #182533 !important;
        }
        .date-header {
          background-color: rgba(120, 130, 140, 0.4) !important;
          backdrop-filter: blur(4px);
        }
        .dark .date-header {
          background-color: rgba(16, 25, 33, 0.6) !important;
          backdrop-filter: blur(4px);
        }
        .custom-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.15);
          border-radius: 9999px;
        }
        .dark .custom-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.12);
        }
      `}</style>
      <div className="flex h-full w-full bg-white dark:bg-[#0e1621] overflow-hidden">
        <ChatLeftColumn
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          accounts={accounts}
          connected={connected}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          selectedChatIds={selectedChatIds}
          setSelectedChatIds={setSelectedChatIds}
          search={search}
          setSearch={setSearch}
          folderFilter={folderFilter}
          setFolderFilter={setFolderFilter}
          folderFilters={folderFilters}
          isLoading={isLoading}
          error={error}
          refetch={refetch}
          filteredChats={filteredChats}
          selectedChatId={selectedChatId}
          handleSelectChat={handleSelectChat}
          onlineUsers={onlineUsers}
          typingChats={typingChats}
          archiveMutationPending={archiveMutation.isPending}
          unarchiveMutationPending={unarchiveMutation.isPending}
          deleteMutationPending={deleteMutation.isPending}
          pinMutationPending={pinMutation.isPending}
          unpinMutationPending={unpinMutation.isPending}
          muteMutationPending={muteMutation.isPending}
          unmuteMutationPending={unmuteMutation.isPending}
          handlePinClick={(chat) => {
            if (chat.is_pinned) {
              unpinMutation.mutate(chat.chat_id);
            } else {
              pinMutation.mutate(chat.chat_id);
            }
          }}
          handleMuteClick={(chat, duration) => {
            if (chat.is_muted) {
              unmuteMutation.mutate(chat.chat_id);
            } else {
              muteMutation.mutate({ chatId: chat.chat_id, duration });
            }
          }}
          handleArchiveClick={handleArchiveClick}
          handleDeleteClick={handleDeleteClick}
          handleBatchArchive={handleBatchArchive}
          handleBatchDelete={handleBatchDelete}
          showLeftMenu={showLeftMenu}
          setShowLeftMenu={setShowLeftMenu}
          isAuthenticated={isAuthenticated}
          getApiUrl={getApiUrl}
          page={page}
          setPage={setPage}
          chatsData={chatsData}
          t={t}
        />

        <div
          className={cn(
            "flex-col h-full bg-[#e7ebf0] dark:bg-[#0e1621] min-w-0 transition-all duration-300 ease-in-out col-center-slide",
            selectedChatId ? "flex flex-1 active-mobile" : "hidden lg:flex lg:flex-1"
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
              isArchived={chats.find((c) => c.chat_id === selectedChatId)?.is_archived || false}
              onArchive={() => {
                const found = chats.find((c) => c.chat_id === selectedChatId);
                if (found) handleArchiveClick(null, found);
              }}
              onDelete={() => {
                const found = chats.find((c) => c.chat_id === selectedChatId);
                if (found) handleDeleteClick(null, found);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12 bg-white dark:bg-[#0e1621]">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-[#17212b] border border-slate-200/60 dark:border-slate-800 flex items-center justify-center mb-5 shadow-sm">
                <MessageSquare className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">{t("chats.selectChat")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                {t("chats.selectChatDesc")}
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteChatOpen}
        onOpenChange={setDeleteChatOpen}
        onConfirm={handleConfirmDeleteChat}
        title={t("chats.delete")}
        message={t("chats.deleteConfirm", { name: deleteChatTarget?.title || t("chats.unknown") })}
        confirmText={t("chats.delete")}
        cancelText={t("navbar.cancel")}
        variant="danger"
      />

      <ConfirmDialog
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        onConfirm={handleConfirmBatchDelete}
        title={t("chats.batchDelete")}
        message={t("chats.batchDeleteConfirm", { count: selectedChatIds.size })}
        confirmText={t("chats.delete")}
        cancelText={t("navbar.cancel")}
        variant="danger"
      />
    </>
  );
}
export default ChatsContent;
