import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import api, { getSessionToken } from "@/lib/api";
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

  // Returns "?token=xxx" for use in <img src> / <video src> URLs
  const getAuthParam = useCallback(() => {
    const t = getSessionToken();
    return t ? `?token=${encodeURIComponent(t)}` : "";
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
  }, [chatsData, page, selectedAccount]);

  useEffect(() => {
    setPage(1);
    setSelectedChatId(null);
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

  // Filter & Sort chats (Telegram sorting rules: Pinned first, then newest last_message_time)
  const filteredChats = useMemo(() => {
    let result = [...chats];

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

    // Telegram sorting rules:
    // 1. Pinned chats ALWAYS on top (is_pinned === true)
    // 2. Unpinned chats below
    // 3. Within each group, sort by last_message_time DESC (newest first)
    result.sort((a, b) => {
      const aPinned = a.is_pinned ? 1 : 0;
      const bPinned = b.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned; // Pinned chats stay at top
      }
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return bTime - aTime; // Newest message first
    });

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

  // Independent chat theme (separate from global TeleBos theme)
  const [tgTheme, setTgTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("tg-chat-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  useEffect(() => {
    localStorage.setItem("tg-chat-theme", tgTheme);
  }, [tgTheme]);

  return (
    <div className={`tg-chat-root${tgTheme === "dark" ? " tg-dark" : ""}`} style={{ display: "flex", height: "100%", width: "100%", overflow: "hidden" }}>
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
          getAuthParam={getAuthParam}
          page={page}
          setPage={setPage}
          chatsData={chatsData}
          t={t}
          tgTheme={tgTheme}
          setTgTheme={setTgTheme}
        />

        <div
          className={cn(
            "col-center-slide",
            selectedChatId ? "active-mobile" : ""
          )}
          style={{
            display: selectedChatId ? "flex" : "none",
            flexDirection: "column",
            height: "100%",
            backgroundColor: "var(--tg-bg-chat)",
            minWidth: 0,
            flex: selectedChatId ? 1 : undefined,
          }}
        >
          {selectedChatId ? (
            <MessagePane
              key={`${selectedAccount}-${selectedChatId}`}
              accountId={selectedAccount}
              chatId={selectedChatId}
              chatTitle={selectedChatTitle}
              chatType={selectedChatType}
              getApiUrl={getApiUrl}
              getAuthParam={getAuthParam}
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
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              textAlign: "center",
              padding: "32px",
              backgroundColor: "var(--tg-bg-chat)",
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: "var(--tg-bg-primary)",
                border: "1px solid var(--tg-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
                boxShadow: "var(--tg-shadow-sm)",
              }}>
                <MessageSquare style={{ width: 24, height: 24, color: "var(--tg-accent)" }} />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--tg-text-primary)", marginBottom: 4 }}>
                {t("chats.selectChat")}
              </h2>
              <p style={{ fontSize: 13, color: "var(--tg-text-secondary)", maxWidth: 320, lineHeight: 1.5 }}>
                {t("chats.selectChatDesc")}
              </p>
            </div>
          )}
        </div>

        {/* Desktop: show center column when no chat selected */}
        <style>{`
          @media (min-width: 1024px) {
            .tg-chat-root > .col-center-slide {
              display: flex !important;
              flex: 1 !important;
            }
          }
        `}</style>

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
    </div>
  );
}
export default ChatsContent;
