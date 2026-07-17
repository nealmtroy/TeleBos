import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { useDraftStore } from "@/lib/drafts";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";
import {
  Search,
  WifiOff,
  Loader2,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Trash2,
  CheckSquare,
  Check,
  Folder,
  Pin,
  Volume2,
  VolumeX,
  Laptop,
  Home,
  LayoutDashboard,
  Bookmark,
  Bot,
  ShieldCheck,
  Users,
  Radio,
} from "lucide-react";
import { ChatItem, FolderFilter } from "./types";
import { TgIcon } from "./helpers";
import { AccountSwitcher } from "./AccountSwitcher";

// Telegram-style avatar colors (matching tweb)
const AVATAR_COLORS = [
  { top: "#FF845E", bottom: "#D45246" },
  { top: "#FEBB5B", bottom: "#F68136" },
  { top: "#B694F9", bottom: "#6C61DF" },
  { top: "#9AD164", bottom: "#46BA43" },
  { top: "#53EDD6", bottom: "#28C9B7" },
  { top: "#5CAFFA", bottom: "#408ACF" },
  { top: "#FF8AAC", bottom: "#D95574" },
];

function getChatAvatarColor(chatId: number) {
  return AVATAR_COLORS[Math.abs(chatId) % AVATAR_COLORS.length];
}

const CHAT_TYPE_COLORS: Record<string, { top: string; bottom: string }> = {
  group: { top: "#9AD164", bottom: "#46BA43" },
  supergroup: { top: "#9AD164", bottom: "#46BA43" },
  channel: { top: "#B694F9", bottom: "#6C61DF" },
  bot: { top: "#FEBB5B", bottom: "#F68136" },
};

interface ChatLeftColumnProps {
  selectedAccount: string;
  setSelectedAccount: (id: string) => void;
  accounts: any[] | undefined;
  connected: boolean;
  selectionMode: boolean;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectedChatIds: Set<number>;
  setSelectedChatIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  search: string;
  setSearch: (val: string) => void;
  folderFilter: FolderFilter;
  setFolderFilter: (f: FolderFilter) => void;
  folderFilters: FolderFilter[];
  isLoading: boolean;
  error: any;
  refetch: () => void;
  filteredChats: ChatItem[];
  selectedChatId: number | null;
  handleSelectChat: (chat: ChatItem) => void;
  onlineUsers: Record<number, boolean>;
  typingChats: Record<number, string>;
  archiveMutationPending: boolean;
  unarchiveMutationPending: boolean;
  deleteMutationPending: boolean;
  pinMutationPending: boolean;
  unpinMutationPending: boolean;
  muteMutationPending: boolean;
  unmuteMutationPending: boolean;
  handleArchiveClick: (e: React.MouseEvent | null, chat: ChatItem) => void;
  handleDeleteClick: (e: React.MouseEvent | null, chat: ChatItem) => void;
  handlePinClick: (chat: ChatItem) => void;
  handleMuteClick: (chat: ChatItem, duration?: number) => void;
  handleBatchArchive: () => void;
  handleBatchDelete: () => void;
  showLeftMenu: boolean;
  setShowLeftMenu: (show: boolean) => void;
  isAuthenticated: boolean;
  getApiUrl: () => string;
  getAuthParam: () => string;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  chatsData: { chats: ChatItem[]; total: number } | undefined;
  t: (key: string, variables?: Record<string, any>) => string;
  tgTheme: "light" | "dark";
  setTgTheme: (theme: "light" | "dark") => void;
}

export function ChatLeftColumn({
  selectedAccount,
  setSelectedAccount,
  accounts,
  connected,
  selectionMode,
  setSelectionMode,
  selectedChatIds,
  setSelectedChatIds,
  search,
  setSearch,
  folderFilter,
  setFolderFilter,
  folderFilters,
  isLoading,
  error,
  refetch,
  filteredChats,
  selectedChatId,
  handleSelectChat,
  onlineUsers,
  typingChats,
  archiveMutationPending,
  unarchiveMutationPending,
  deleteMutationPending,
  pinMutationPending,
  unpinMutationPending,
  muteMutationPending,
  unmuteMutationPending,
  handleArchiveClick,
  handleDeleteClick,
  handlePinClick,
  handleMuteClick,
  handleBatchArchive,
  handleBatchDelete,
  showLeftMenu,
  setShowLeftMenu,
  isAuthenticated,
  getApiUrl,
  getAuthParam,
  page,
  setPage,
  chatsData,
  t,
  tgTheme,
  setTgTheme,
}: ChatLeftColumnProps) {
  const activeAccs = Array.isArray(accounts)
    ? accounts.filter((acc) => acc.is_active && !acc.for_sale)
    : [];

  const drafts = useDraftStore((s) => s.drafts);

  const isBusy =
    archiveMutationPending ||
    unarchiveMutationPending ||
    deleteMutationPending ||
    pinMutationPending ||
    unpinMutationPending ||
    muteMutationPending ||
    unmuteMutationPending;

  const [settingsTab, setSettingsTab] = useState<"main" | "theme" | "sessions">("main");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chat: ChatItem } | null>(null);

  const [accentColor, setAccentColor] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tg-chat-accent") || "blue";
    }
    return "blue";
  });

  // Active sessions query
  const { data: sessionsData, refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["active-sessions", selectedAccount],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${selectedAccount}/devices`);
      return Array.isArray(data?.devices) ? data.devices : [];
    },
    enabled: !!selectedAccount && settingsTab === "sessions" && showLeftMenu,
  });

  const terminateOtherSessionsMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/accounts/${selectedAccount}/devices`);
    },
    onSuccess: () => {
      alert("Successfully terminated other sessions.");
      refetchSessions();
    },
    onError: (err: any) => {
      alert("Failed to terminate other sessions: " + (err.response?.data?.detail || err.message));
    }
  });

  const terminateSessionMutation = useMutation({
    mutationFn: async (deviceHash: string) => {
      await api.delete(`/accounts/${selectedAccount}/devices/${deviceHash}`);
    },
    onSuccess: () => {
      refetchSessions();
    },
    onError: (err: any) => {
      alert("Failed to terminate session: " + (err.response?.data?.detail || err.message));
    }
  });

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, []);

  useEffect(() => {
    const accentColors: Record<string, string> = {
      blue: "#3390ec",
      green: "#29b327",
      purple: "#9472ee",
      red: "#d33213",
      orange: "#f08200",
    };
    const root = document.querySelector(".tg-chat-root") as HTMLElement | null;
    if (root) {
      root.style.setProperty("--tg-accent", accentColors[accentColor] || "#3390ec");
    }
    localStorage.setItem("tg-chat-accent", accentColor);
  }, [accentColor]);

  // Determine left column visibility and sizing
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
  const columnStyle: React.CSSProperties = {
    flexDirection: "column",
    height: "100%",
    backgroundColor: "var(--tg-bg-primary)",
    borderRight: "1px solid var(--tg-border)",
    position: "relative",
    zIndex: 10,
    flexShrink: 0,
    transition: "width var(--tg-transition-slow)",
    ...(selectedChatId
      ? { display: isDesktop ? "flex" : "none", width: "var(--tg-sidebar-width)" }
      : { display: "flex", flex: 1, minWidth: 0 }),
  };

  return (
    <div className="col-left-slide" style={columnStyle}>

      {/* ======== SETTINGS/MENU OVERLAY ======== */}
      {showLeftMenu && (
        <div className="tg-settings-panel">
          {/* Settings Header */}
          <div className="tg-header" style={{ gap: 8 }}>
            <button
              className="tg-header-btn"
              onClick={() => {
                if (settingsTab !== "main") {
                  setSettingsTab("main");
                } else {
                  setShowLeftMenu(false);
                }
              }}
            >
              <ArrowLeft style={{ width: 20, height: 20 }} />
            </button>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--tg-text-primary)" }}>
              {settingsTab === "main" && "Settings"}
              {settingsTab === "theme" && "Appearance"}
              {settingsTab === "sessions" && "Active Sessions"}
            </div>
          </div>

          <div className="tg-scroll" style={{ flex: 1, overflowY: "auto" }}>
            {settingsTab === "main" && (
              <div>
                {/* Back to Dashboard */}
                <a href="/dashboard" className="tg-back-link" style={{ borderBottom: "1px solid var(--tg-divider)" }}>
                  <LayoutDashboard style={{ width: 18, height: 18 }} />
                  Back to Dashboard
                </a>

                {/* Settings options */}
                <button className="tg-settings-row" onClick={() => setSettingsTab("theme")}>
                  <span>Appearance (Theme)</span>
                  <TgIcon name="brush" className="tg-text-tertiary" style={{ width: 18, height: 18 }} />
                </button>
                <button className="tg-settings-row" onClick={() => setSettingsTab("sessions")}>
                  <span>Active Sessions</span>
                  <Laptop style={{ width: 18, height: 18, color: "var(--tg-text-tertiary)" }} />
                </button>
              </div>
            )}

            {settingsTab === "theme" && (
              <div style={{ padding: 16 }}>
                {/* Theme Mode */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tg-text-primary)" }}>Dark Mode</div>
                    <div style={{ fontSize: 12, color: "var(--tg-text-tertiary)", marginTop: 2 }}>Day / Night color scheme</div>
                  </div>
                  <button
                    className={`tg-toggle${tgTheme === "dark" ? " is-on" : ""}`}
                    onClick={() => setTgTheme(tgTheme === "dark" ? "light" : "dark")}
                  />
                </div>

                {/* Accent Colors */}
                <div style={{ borderTop: "1px solid var(--tg-divider)", paddingTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tg-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Accent Color</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    {[
                      { id: "blue", color: "#3390ec" },
                      { id: "green", color: "#29b327" },
                      { id: "purple", color: "#9472ee" },
                      { id: "red", color: "#d33213" },
                      { id: "orange", color: "#f08200" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setAccentColor(c.id)}
                        className={`tg-color-swatch${accentColor === c.id ? " is-active" : ""}`}
                        style={{ backgroundColor: c.color }}
                      >
                        {accentColor === c.id && <Check style={{ width: 16, height: 16, color: "#fff" }} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {settingsTab === "sessions" && (
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tg-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Active Sessions</span>
                  <button
                    onClick={() => {
                      if (confirm("Terminate all other active sessions?")) {
                        terminateOtherSessionsMutation.mutate();
                      }
                    }}
                    disabled={terminateOtherSessionsMutation.isPending}
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--tg-red)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Terminate Others
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sessionsData && sessionsData.length > 0 ? (
                    sessionsData.map((sess: any) => (
                      <div
                        key={sess.hash}
                        style={{
                          padding: 12,
                          backgroundColor: "var(--tg-bg-secondary)",
                          border: "1px solid var(--tg-border-light)",
                          borderRadius: "var(--tg-border-radius)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          position: "relative",
                        }}
                      >
                        <Laptop style={{ width: 18, height: 18, color: "var(--tg-text-tertiary)", marginTop: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                          <div style={{ fontWeight: 600, color: "var(--tg-text-primary)" }}>
                            {sess.device_model || "Unknown Device"} ({sess.platform || "Web"})
                          </div>
                          <div style={{ fontSize: 12, color: "var(--tg-text-secondary)", marginTop: 4 }}>
                            App: {sess.app_name} {sess.app_version}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--tg-text-tertiary)", marginTop: 2 }}>
                            IP: {sess.ip} • {sess.country || "Unknown"}
                          </div>
                          {sess.current ? (
                            <span style={{
                              display: "inline-block", marginTop: 6, padding: "2px 8px",
                              backgroundColor: "var(--tg-green-light)", color: "var(--tg-green)",
                              borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px"
                            }}>Current Session</span>
                          ) : (
                            <button
                              onClick={() => {
                                if (confirm(`Terminate session on ${sess.device_model || "this device"}?`)) {
                                  terminateSessionMutation.mutate(sess.hash);
                                }
                              }}
                              style={{
                                display: "inline-block", marginTop: 6, padding: "2px 8px",
                                backgroundColor: "var(--tg-red-light)", color: "var(--tg-red)",
                                borderRadius: 4, fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer"
                              }}
                            >
                              Terminate
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "var(--tg-text-tertiary)" }}>
                      {sessionsData ? "No other active sessions" : "Loading..."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Version footer */}
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--tg-border)", textAlign: "center", fontSize: 11, color: "var(--tg-text-tertiary)", fontWeight: 500 }}>
            TeleBos Chat v2.0
          </div>
        </div>
      )}

      {/* ======== MAIN HEADER ======== */}
      <div className="tg-header" style={{ gap: 4 }}>
        {/* Hamburger */}
        <button
          className="tg-header-btn"
          onClick={() => setShowLeftMenu(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Account Switcher */}
        <AccountSwitcher
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={(id) => {
            setSelectedAccount(id);
            setPage(1);
          }}
          getApiUrl={getApiUrl}
          connected={connected}
        />

        {/* Selection Mode Toggle */}
        {selectedAccount && (
          <button
            className="tg-header-btn"
            onClick={() => {
              setSelectionMode((prev) => {
                if (prev) setSelectedChatIds(new Set());
                return !prev;
              });
            }}
            title={selectionMode ? t("chats.exitSelection") : t("chats.selectChats")}
            style={selectionMode ? { color: "var(--tg-accent)", backgroundColor: "var(--tg-accent-light)" } : {}}
          >
            <CheckSquare style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>

      {/* ======== SEARCH BAR ======== */}
      {selectedAccount && (
        <div className="tg-search">
          <Search className="tg-search-icon" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chats.search")}
          />
        </div>
      )}

      {/* ======== FOLDER TABS (underline style) ======== */}
      {selectedAccount && folderFilters.length > 0 && (
        <div className="tg-folder-tabs">
          {folderFilters.map((ff) => {
            const isActive =
              (ff.type === "all" && folderFilter.type === "all") ||
              (ff.type === "archived" && folderFilter.type === "archived") ||
              (ff.type === "folder" &&
                folderFilter.type === "folder" &&
                folderFilter.folderId === ff.folderId);

            const label =
              ff.type === "all"
                ? t("chats.all")
                : ff.type === "archived"
                ? t("chats.archived")
                : ff.label;

            return (
              <button
                key={ff.type === "folder" ? `folder-${ff.folderId}` : ff.type}
                onClick={() => setFolderFilter(ff)}
                className={`tg-folder-tab${isActive ? " is-active" : ""}`}
              >
                {ff.type === "archived" && <Archive style={{ width: 14, height: 14 }} />}
                {ff.type === "folder" && <Folder style={{ width: 14, height: 14 }} />}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ======== CHAT LIST ======== */}
      <div className="tg-scroll" style={{ flex: 1, overflowY: "auto" }}>
        {!selectedAccount ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", textAlign: "center", padding: "32px 16px",
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              backgroundColor: "var(--tg-bg-secondary)", display: "flex",
              alignItems: "center", justifyContent: "center", marginBottom: 16,
              border: "1px solid var(--tg-border-light)"
            }}>
              <Search style={{ width: 20, height: 20, color: "var(--tg-text-tertiary)" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tg-text-secondary)" }}>
              {activeAccs.length > 0 ? t("chats.selectAccount") : t("chats.noAccounts")}
            </div>
          </div>
        ) : isLoading && page === 1 ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="tg-chat-row" style={{ gap: 12 }}>
                <div className="tg-skeleton" style={{ width: 54, height: 54, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="tg-skeleton" style={{ width: "60%", height: 14 }} />
                  <div className="tg-skeleton" style={{ width: "80%", height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", textAlign: "center", padding: 24,
          }}>
            <div style={{ fontSize: 14, color: "var(--tg-red)", fontWeight: 500, marginBottom: 8 }}>
              {t("chats.failedToLoad")}
            </div>
            <button onClick={() => refetch()} style={{
              fontSize: 14, color: "var(--tg-accent)", fontWeight: 500,
              background: "none", border: "none", cursor: "pointer",
            }}>
              {t("chats.retry")}
            </button>
          </div>
        ) : (
          <>
            {filteredChats.length === 0 ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: "100%", fontSize: 14, color: "var(--tg-text-tertiary)", fontWeight: 500, padding: 48,
              }}>
                {folderFilter.type === "archived" ? t("chats.noArchived") : t("chats.noChats")}
              </div>
            ) : (
              <div>
                {filteredChats.map((chat) => {
                  const isSelected = selectedChatIds.has(chat.chat_id);
                  const isTyping = !!typingChats[chat.chat_id];
                  const typingText = typingChats[chat.chat_id] || "";
                  const draftText = drafts[`${selectedAccount}:${chat.chat_id}`] || "";

                  const isSavedMessages = chat.chat_type === "saved" || chat.title === "Saved Messages" || chat.chat_type === "self";
                  const isTelegram = chat.chat_id === 777000 || chat.username?.toLowerCase() === "telegram" || chat.title === "Telegram";
                  const isBot = chat.chat_type === "bot" || (!!chat.username && chat.username.toLowerCase().endsWith("bot"));
                  const isGroup = chat.chat_type === "group" || chat.chat_type === "supergroup";
                  const isChannel = chat.chat_type === "channel";

                  const avatarColor = isSavedMessages || isTelegram
                    ? { top: "#5CAFFA", bottom: "#408ACF" }
                    : isBot
                    ? { top: "#FEBB5B", bottom: "#F68136" }
                    : isGroup
                    ? { top: "#9AD164", bottom: "#46BA43" }
                    : isChannel
                    ? { top: "#B694F9", bottom: "#6C61DF" }
                    : getChatAvatarColor(chat.chat_id);

                  return (
                    <div
                      key={chat.chat_id}
                      className={`tg-chat-row tg-ripple${selectedChatId === chat.chat_id && !selectionMode ? " is-active" : ""}${chat.is_archived ? " opacity-60" : ""}`}
                      onClick={() => handleSelectChat(chat)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (selectionMode) return;
                        setContextMenu({ x: e.clientX, y: e.clientY, chat });
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {/* Selection checkbox */}
                      {selectionMode && (
                        <div className={`tg-checkbox${isSelected ? " is-checked" : ""}`}>
                          {isSelected && <Check style={{ width: 14, height: 14 }} />}
                        </div>
                      )}

                      {/* Avatar */}
                      <div
                        className="tg-avatar"
                        style={{
                          "--avatar-top": avatarColor.top,
                          "--avatar-bottom": avatarColor.bottom,
                        } as React.CSSProperties}
                      >
                        {isSavedMessages ? (
                          <Bookmark style={{ width: 22, height: 22, color: "#fff" }} />
                        ) : isTelegram ? (
                          <ShieldCheck style={{ width: 22, height: 22, color: "#fff" }} />
                        ) : (
                          <>
                            {isAuthenticated && selectedAccount && (
                              <img
                                src={`${getApiUrl()}/accounts/${selectedAccount}/chats/${chat.chat_id}/photo`}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const fb = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (fb) fb.style.display = "flex";
                                }}
                                alt=""
                              />
                            )}
                            <span
                              style={{
                                display: isAuthenticated && selectedAccount ? "none" : "flex",
                                width: "100%",
                                height: "100%",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {isBot ? <Bot style={{ width: 22, height: 22, color: "#fff" }} /> : (chat.title || "?")[0]?.toUpperCase()}
                            </span>
                          </>
                        )}

                        {/* Online dot */}
                        {onlineUsers[chat.chat_id] && <div className="tg-online-badge" />}

                        {/* Archive badge */}
                        {chat.is_archived && !selectionMode && (
                          <div style={{
                            position: "absolute", bottom: -2, right: -2,
                            width: 18, height: 18, borderRadius: "50%",
                            backgroundColor: "var(--tg-bg-primary)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: "2px solid var(--tg-bg-primary)",
                          }}>
                            <Archive style={{ width: 10, height: 10, color: "var(--tg-text-tertiary)" }} />
                          </div>
                        )}
                      </div>

                      {/* Chat Info */}
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div
                            className="tg-truncate"
                            style={{
                              fontSize: 15,
                              fontWeight: chat.unread_count > 0 ? 600 : 500,
                              color: chat.is_archived ? "var(--tg-text-tertiary)" : "var(--tg-text-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span className="tg-truncate">{chat.title || t("chats.unknown")}</span>
                            {isTelegram && <ShieldCheck style={{ width: 14, height: 14, color: "var(--tg-accent)", flexShrink: 0 }} />}
                            {isBot && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 4,
                                backgroundColor: "var(--tg-accent-light)", color: "var(--tg-accent)",
                                textTransform: "uppercase", letterSpacing: "0.4px", flexShrink: 0,
                              }}>bot</span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              color: chat.unread_count > 0 ? "var(--tg-accent)" : "var(--tg-text-tertiary)",
                              flexShrink: 0,
                              marginLeft: 8,
                              fontWeight: chat.unread_count > 0 ? 500 : 400,
                            }}
                          >
                            {formatRelative(chat.last_message_time)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                          <div
                            className="tg-truncate"
                            style={{
                              fontSize: 14,
                              fontWeight: isTyping ? 500 : 400,
                              color: isTyping
                                ? "var(--tg-accent)"
                                : draftText
                                ? "var(--tg-text-primary)"
                                : chat.unread_count > 0
                                ? "var(--tg-text-primary)"
                                : "var(--tg-text-secondary)",
                              flex: 1,
                              paddingRight: 8,
                            }}
                          >
                            {isTyping ? (
                              `${typingText.replace("_", " ")}...`
                            ) : draftText ? (
                              <>
                                <span style={{ color: "var(--tg-red)", fontWeight: 500 }}>Draft: </span>
                                {draftText}
                              </>
                            ) : (
                              chat.last_message || "—"
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {chat.is_muted && <VolumeX style={{ width: 14, height: 14, color: "var(--tg-text-tertiary)" }} />}
                            {chat.is_pinned && <Pin style={{ width: 14, height: 14, color: "var(--tg-text-tertiary)", transform: "rotate(45deg)" }} />}
                            {chat.unread_count > 0 && (
                              <span className={`tg-badge${chat.is_muted ? " is-muted" : ""}`}>
                                {chat.unread_count > 99 ? "99+" : chat.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Hover actions */}
                      {!selectionMode && (
                        <div style={{
                          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                          display: "none", alignItems: "center", gap: 2,
                          backgroundColor: "var(--tg-bg-primary)", paddingLeft: 8, borderRadius: 8,
                        }}
                        className="tg-hover-actions"
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handleArchiveClick(e, chat); }}
                            disabled={isBusy}
                            className="tg-header-btn"
                            style={{ width: 32, height: 32 }}
                            title={chat.is_archived ? t("chats.unarchive") : t("chats.archive")}
                          >
                            {chat.is_archived ? <ArchiveRestore style={{ width: 15, height: 15 }} /> : <Archive style={{ width: 15, height: 15 }} />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(e, chat); }}
                            disabled={isBusy}
                            className="tg-header-btn"
                            style={{ width: 32, height: 32, color: "var(--tg-red)" }}
                            title={t("chats.delete")}
                          >
                            <Trash2 style={{ width: 15, height: 15 }} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Infinite Scroll Sentinel */}
            {chatsData && chatsData.chats && chatsData.chats.length === 50 && filteredChats.length < chatsData.total && (
              <div
                ref={(el) => {
                  if (!el) return;
                  const observer = new IntersectionObserver(
                    (entries) => {
                      if (entries[0].isIntersecting && !isLoading) {
                        setPage((p) => p + 1);
                      }
                    },
                    { threshold: 0.1 }
                  );
                  observer.observe(el);
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 16, backgroundColor: "var(--tg-bg-primary)",
                }}
              >
                <Loader2 style={{ width: 20, height: 20, color: "var(--tg-accent)", animation: "spin 1s linear infinite" }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ======== BATCH ACTION BAR ======== */}
      {selectionMode && selectedChatIds.size > 0 && (
        <div className="tg-batch-bar">
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--tg-text-primary)" }}>
            {t("chats.selected", { n: selectedChatIds.size })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={handleBatchArchive} disabled={isBusy} className="tg-btn">
              {folderFilter.type === "archived" ? (
                <><ArchiveRestore style={{ width: 14, height: 14 }} /> {t("chats.unarchiveAll")}</>
              ) : (
                <><Archive style={{ width: 14, height: 14 }} /> {t("chats.archiveAll")}</>
              )}
            </button>
            <button onClick={handleBatchDelete} disabled={isBusy} className="tg-btn is-danger">
              <Trash2 style={{ width: 14, height: 14 }} /> {t("chats.deleteAll")}
            </button>
          </div>
        </div>
      )}

      {/* ======== CONTEXT MENU ======== */}
      {contextMenu && (
        <div
          className="tg-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="tg-context-menu-item" onClick={() => { handlePinClick(contextMenu.chat); setContextMenu(null); }}>
            <Pin style={{ width: 16, height: 16, color: "var(--tg-text-secondary)" }} />
            {contextMenu.chat.is_pinned ? "Unpin" : "Pin"}
          </button>
          <button className="tg-context-menu-item" onClick={() => { handleMuteClick(contextMenu.chat); setContextMenu(null); }}>
            {contextMenu.chat.is_muted
              ? <Volume2 style={{ width: 16, height: 16, color: "var(--tg-text-secondary)" }} />
              : <VolumeX style={{ width: 16, height: 16, color: "var(--tg-text-secondary)" }} />}
            {contextMenu.chat.is_muted ? "Unmute" : "Mute"}
          </button>
          <button className="tg-context-menu-item" onClick={() => { handleArchiveClick(null, contextMenu.chat); setContextMenu(null); }}>
            {contextMenu.chat.is_archived
              ? <ArchiveRestore style={{ width: 16, height: 16, color: "var(--tg-text-secondary)" }} />
              : <Archive style={{ width: 16, height: 16, color: "var(--tg-text-secondary)" }} />}
            {contextMenu.chat.is_archived ? "Unarchive" : "Archive"}
          </button>
          <div className="tg-context-menu-divider" />
          <button className="tg-context-menu-item is-danger" onClick={() => { handleDeleteClick(null, contextMenu.chat); setContextMenu(null); }}>
            <Trash2 style={{ width: 16, height: 16 }} />
            Delete Chat
          </button>
        </div>
      )}

      {/* Hover action visibility CSS */}
      <style>{`
        .tg-chat-row:hover .tg-hover-actions {
          display: flex !important;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
