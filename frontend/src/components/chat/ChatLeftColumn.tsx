import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import { useDraftStore } from "@/lib/drafts";
import { ChatRowSkeleton } from "@/components/ui/skeleton-cards";
import {
  MessageSquare,
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
  Globe,
  Languages,
} from "lucide-react";
import { ChatItem, FolderFilter } from "./types";
import { getAvatarGradient, TgIcon } from "./helpers";

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
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  chatsData: { chats: ChatItem[]; total: number } | undefined;
  t: (key: string, variables?: Record<string, any>) => string;
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
  page,
  setPage,
  chatsData,
  t,
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

  const [settingsTab, setSettingsTab] = useState<"main" | "profile" | "theme" | "notifications" | "sessions">("main");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chat: ChatItem } | null>(null);
  const [profileName, setProfileName] = useState("TeleBos Client User");
  const [profileBio, setProfileBio] = useState("Manage your accounts efficiently");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("telebos-theme") as "light" | "dark") || "light";
    }
    return "light";
  });
  const [accentColor, setAccentColor] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("telebos-accent") || "blue";
    }
    return "blue";
  });
  const [wallpaper, setWallpaper] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("telebos-wallpaper") || "none";
    }
    return "none";
  });
  const [rtlEnabled, setRtlEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("telebos-rtl") === "true";
    }
    return false;
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["active-sessions", selectedAccount],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${selectedAccount}/devices`);
      return Array.isArray(data?.devices) ? data.devices : [];
    },
    enabled: !!selectedAccount && settingsTab === "sessions",
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
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("telebos-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    const accentColors: Record<string, string> = {
      blue: "#3390ec",
      green: "#29b327",
      purple: "#9472ee",
      red: "#d33213",
      orange: "#f08200",
    };
    root.style.setProperty("--primary-color", accentColors[accentColor] || "#3390ec");
    localStorage.setItem("telebos-accent", accentColor);
  }, [accentColor]);

  useEffect(() => {
    const root = document.documentElement;
    if (rtlEnabled) {
      root.setAttribute("dir", "rtl");
    } else {
      root.removeAttribute("dir");
    }
    localStorage.setItem("telebos-rtl", String(rtlEnabled));
  }, [rtlEnabled]);

  useEffect(() => {
    localStorage.setItem("telebos-wallpaper", wallpaper);
    const styleId = "telebos-custom-wallpaper-style";
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    if (wallpaper === "stars") {
      styleEl.innerHTML = `.bg-chat-wallpaper { background-image: radial-gradient(circle at 50% 50%, #1a2230 0%, #0e1621 100%) !important; }`;
    } else if (wallpaper === "clouds") {
      styleEl.innerHTML = `.bg-chat-wallpaper { background-color: #f1f5f9 !important; background-image: radial-gradient(#cbd5e1 1px, transparent 1px) !important; background-size: 16px 16px !important; }`;
    } else if (wallpaper === "slate") {
      styleEl.innerHTML = `.bg-chat-wallpaper { background-color: #334155 !important; background-image: none !important; }`;
    } else {
      styleEl.innerHTML = "";
    }
  }, [wallpaper]);

  return (
    <div
      className={cn(
        "flex flex-col h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#17212b] transition-all duration-300 ease-in-out relative z-10 col-left-slide",
        selectedChatId
          ? "hidden lg:flex w-[360px] xl:w-[380px] lg:shrink-0 hidden-mobile"
          : "flex flex-1 min-w-0 lg:w-[360px] lg:shrink-0"
      )}
    >
      {/* Left Settings Menu Overlay */}
      {showLeftMenu && (
        <div className="absolute inset-0 bg-white dark:bg-[#17212b] z-20 flex flex-col animate-in slide-in-from-left duration-200">
          {/* Settings Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <button
              onClick={() => {
                if (settingsTab !== "main") {
                  setSettingsTab("main");
                } else {
                  setShowLeftMenu(false);
                }
              }}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {settingsTab === "main" && "Settings"}
              {settingsTab === "profile" && "Profile Settings"}
              {settingsTab === "theme" && "Theme Settings"}
              {settingsTab === "notifications" && "Notification Settings"}
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {settingsTab === "main" && (
              <>
                {/* Profile Block */}
                <div className="flex flex-col items-center py-4 bg-slate-50 dark:bg-black/10 rounded-2xl p-4 border border-slate-100 dark:border-none">
                  <div className="w-16 h-16 rounded-full bg-primary text-white font-bold text-xl flex items-center justify-center mb-3">
                    {profileName[0]?.toUpperCase()}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{profileName}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{profileBio}</p>
                </div>

                {/* Settings Links */}
                <div className="space-y-1">
                  <button
                    onClick={() => setSettingsTab("profile")}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span>Edit Profile</span>
                    <TgIcon name="user" className="h-4 w-4 text-slate-400" />
                  </button>
                  <button
                    onClick={() => setSettingsTab("theme")}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span>Appearance (Theme)</span>
                    <TgIcon name="brush" className="h-4 w-4 text-slate-400" />
                  </button>
                  <button
                    onClick={() => setSettingsTab("notifications")}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span>Notifications & Sounds</span>
                    <TgIcon name="volume_up" className="h-4 w-4 text-slate-400" />
                  </button>
                  <button
                    onClick={() => setSettingsTab("sessions")}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span>Active Sessions</span>
                    <Laptop className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              </>
            )}

            {settingsTab === "profile" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Display Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-transparent text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Bio</label>
                  <textarea
                    rows={3}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-transparent text-slate-800 dark:text-slate-100 resize-none"
                  />
                </div>
                <button
                  onClick={() => setSettingsTab("main")}
                  className="w-full py-2.5 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 active:scale-95 transition"
                >
                  Save Changes
                </button>
              </div>
            )}

            {settingsTab === "theme" && (
              <div className="space-y-6">
                {/* Theme Mode Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Dark Mode</span>
                    <span className="text-[10px] text-slate-400">Day / Night color scheme</span>
                  </div>
                  <button
                    onClick={() => {
                      setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
                    }}
                    className={cn(
                      "w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition duration-200 active:scale-95 shadow-inner",
                      themeMode === "dark" ? "bg-primary" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 bg-white rounded-full shadow-md transition duration-200",
                        themeMode === "dark" ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* Accent Color Grid */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-left">
                  <label className="text-xs font-bold text-slate-500">Accent Colors</label>
                  <div className="flex items-center gap-3">
                    {["blue", "green", "purple", "red", "orange"].map((color) => {
                      const bgClasses: Record<string, string> = {
                        blue: "bg-[#3390ec]",
                        green: "bg-[#29b327]",
                        purple: "bg-[#9472ee]",
                        red: "bg-[#d33213]",
                        orange: "bg-[#f08200]",
                      };
                      return (
                        <button
                          key={color}
                          onClick={() => setAccentColor(color)}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition active:scale-90 flex items-center justify-center",
                            accentColor === color ? "border-slate-800 dark:border-slate-200" : "border-transparent",
                            bgClasses[color]
                          )}
                        >
                          {accentColor === color && <Check className="h-4 w-4 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800 text-left">
                  <label className="text-xs font-bold text-slate-500">Chat Wallpaper</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: "none", label: "None" },
                      { id: "stars", label: "Dark Stars" },
                      { id: "clouds", label: "Light Clouds" },
                      { id: "slate", label: "Solid Slate" },
                    ] as const).map((wp) => (
                      <button
                        key={wp.id}
                        onClick={() => setWallpaper(wp.id)}
                        className={cn(
                          "px-3 py-2 rounded-xl border text-xs font-semibold transition text-center",
                          wallpaper === wp.id
                            ? "bg-primary border-primary text-white"
                            : "bg-slate-50 dark:bg-[#202b36] border-slate-200 dark:border-slate-800 text-slate-650 hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        {wp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">RTL Layout</span>
                    <span className="text-[10px] text-slate-400">Right-to-Left text direction</span>
                  </div>
                  <button
                    onClick={() => setRtlEnabled((prev) => !prev)}
                    className={cn(
                      "w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition duration-200 active:scale-95 shadow-inner",
                      rtlEnabled ? "bg-primary" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 bg-white rounded-full shadow-md transition duration-200",
                        rtlEnabled ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            )}

            {settingsTab === "notifications" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Alert Sounds</span>
                    <span className="text-[10px] text-slate-400">Play sound for new messages</span>
                  </div>
                  <button
                    onClick={() => setNotificationsEnabled((prev) => !prev)}
                    className={cn(
                      "w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition duration-200 active:scale-95 shadow-inner",
                      notificationsEnabled ? "bg-primary" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 bg-white rounded-full shadow-md transition duration-200",
                        notificationsEnabled ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            )}

            {settingsTab === "sessions" && (
              <div className="space-y-4 text-left">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Sessions</span>
                  <button
                    onClick={() => {
                      if (confirm("Terminate all other active sessions?")) {
                        terminateOtherSessionsMutation.mutate();
                      }
                    }}
                    disabled={terminateOtherSessionsMutation.isPending}
                    className="text-[11px] font-bold text-red-500 hover:underline disabled:opacity-50"
                  >
                    Terminate Others
                  </button>
                </div>

                <div className="space-y-3">
                  {sessionsData && sessionsData.length > 0 ? (
                    sessionsData.map((sess: any) => (
                      <div
                        key={sess.hash}
                        className="p-3 bg-slate-50 dark:bg-[#202b36]/40 border border-slate-150 dark:border-slate-800 rounded-xl flex items-start gap-3 relative group/item"
                      >
                        <Laptop className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0 pr-10 text-xs">
                          <h4 className="font-bold text-slate-850 dark:text-slate-250 truncate">
                            {sess.device_model || "Unknown Device"} ({sess.platform || "Web"})
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            App: {sess.app_name} {sess.app_version}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                            IP: {sess.ip} • {sess.country || "Unknown Location"}
                          </p>
                          {sess.current ? (
                            <span className="inline-block mt-1.5 px-2 py-0.5 bg-green-500/10 text-green-550 rounded text-[9px] font-bold uppercase tracking-wider">
                              Current Session
                            </span>
                          ) : (
                            <span className="inline-block mt-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded text-[9px] font-bold uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>
                        {!sess.current && (
                          <button
                            onClick={() => {
                              if (confirm(`Terminate session on ${sess.device_model || "this device"}?`)) {
                                terminateSessionMutation.mutate(sess.hash);
                              }
                            }}
                            className="absolute top-2 right-2 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition opacity-0 group-hover/item:opacity-100"
                            title="Terminate session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-xs text-slate-400 font-semibold">
                      {sessionsData ? "No other active sessions" : "Loading active sessions..."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-400 font-semibold select-none">
            TeleBos Web K Replica v1.0.0
          </div>
        </div>
      )}

      {/* List Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#17212b] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLeftMenu(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("chats.title")}</h1>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                {t("chats.live")}
              </span>
            ) : selectedAccount ? (
              <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
                <WifiOff className="h-3 w-3" /> {t("chats.offline")}
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
                title={selectionMode ? t("chats.exitSelection") : t("chats.selectChats")}
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
          }}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out bg-slate-50 text-slate-700 font-medium cursor-pointer"
        >
          <option value="">{t("chats.selectAccount")}</option>
          {activeAccs.map((acc) => (
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
            placeholder={t("chats.search")}
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
              ff.type === "all"
                ? t("chats.all")
                : ff.type === "archived"
                ? t("chats.archived")
                : ff.label;

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
      <div className="flex-1 overflow-y-auto custom-scroll">
        {!selectedAccount ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 mb-4">
              <MessageSquare className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {activeAccs.length > 0 ? t("chats.selectAccount") : t("chats.noAccounts")}
            </p>
          </div>
        ) : isLoading && page === 1 ? (
          <div className="divide-y divide-slate-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <ChatRowSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <p className="text-sm text-red-500 font-semibold mb-2">{t("chats.failedToLoad")}</p>
            <button onClick={() => refetch()} className="text-sm text-primary hover:underline font-semibold">
              {t("chats.retry")}
            </button>
          </div>
        ) : (
          <>
            {filteredChats.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-slate-400 font-medium py-12">
                {folderFilter.type === "archived" ? t("chats.noArchived") : t("chats.noChats")}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredChats.map((chat) => {
                  const isSelected = selectedChatIds.has(chat.chat_id);
                  const isTyping = !!typingChats[chat.chat_id];
                  const typingText = typingChats[chat.chat_id] || "";
                  const draftText = drafts[`${selectedAccount}:${chat.chat_id}`] || "";

                  return (
                    <button
                      key={chat.chat_id}
                      onClick={() => handleSelectChat(chat)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (selectionMode) return;
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          chat,
                        });
                      }}
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
                      <div className="w-11 h-11 rounded-full flex-shrink-0 relative bg-slate-100 ring-2 ring-slate-100/50">
                        {isAuthenticated && selectedAccount && (
                          <img
                            src={`${getApiUrl()}/accounts/${selectedAccount}/chats/${chat.chat_id}/photo`}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const fb = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fb) fb.style.display = "flex";
                            }}
                            className="w-full h-full object-cover rounded-full"
                            alt=""
                          />
                        )}
                        <div
                          className={cn(
                            "w-full h-full flex items-center justify-center text-white font-bold text-sm select-none rounded-full",
                            chat.chat_type === "user" && `bg-gradient-to-br ${getAvatarGradient(chat.chat_id)}`,
                            (chat.chat_type === "group" || chat.chat_type === "supergroup") && "bg-gradient-to-br from-emerald-500 to-teal-600",
                            chat.chat_type === "channel" && "bg-gradient-to-br from-violet-500 to-purple-600",
                            chat.chat_type === "bot" && "bg-gradient-to-br from-amber-500 to-orange-600"
                          )}
                          style={{ display: isAuthenticated && selectedAccount ? "none" : "flex" }}
                        >
                          {(chat.title || "?")[0]?.toUpperCase()}
                        </div>

                        {/* Online status green dot */}
                        {onlineUsers[chat.chat_id] && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10 shadow-sm animate-pulse" />
                        )}

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
                            {chat.title || t("chats.unknown")}
                          </h3>
                          <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2 group-hover:lg:opacity-0 transition-opacity duration-150">
                            {formatRelative(chat.last_message_time)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p
                            className={cn(
                              "text-xs truncate pr-2 font-medium",
                              isTyping ? "text-primary dark:text-blue-400 font-bold" :
                              draftText ? "text-slate-700 dark:text-slate-350" :
                              chat.unread_count > 0 ? "text-slate-900 font-semibold" : "text-slate-500"
                            )}
                          >
                            {isTyping ? (
                              `${typingText.replace("_", " ")}...`
                            ) : draftText ? (
                              <>
                                <span className="text-red-500 font-bold mr-1">Draft:</span>
                                <span>{draftText}</span>
                              </>
                            ) : (
                              chat.last_message || "—"
                            )}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {chat.is_muted && (
                              <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                            )}
                            {chat.is_pinned && (
                              <Pin className="h-3.5 w-3.5 text-slate-400 rotate-45" />
                            )}
                            {chat.unread_count > 0 && (
                              <span className={cn(
                                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full shadow-sm group-hover:lg:opacity-0 transition-opacity duration-150",
                                chat.is_muted
                                  ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                  : "bg-primary text-primary-foreground"
                              )}>
                                {chat.unread_count > 99 ? "99+" : chat.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Hover actions (only when not in selection mode) */}
                      {!selectionMode && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:group-hover:flex items-center gap-1 bg-white dark:bg-[#182533] pl-2 rounded-lg">
                          <button
                            onClick={(e) => handleArchiveClick(e, chat)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition"
                            title={chat.is_archived ? t("chats.unarchive") : t("chats.archive")}
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
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 transition"
                            title={t("chats.delete")}
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

            {/* Infinite Scroll Sentinel */}
            {chatsData && filteredChats.length < chatsData.total && (
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
                className="flex items-center justify-center py-4 bg-white dark:bg-[#17212b]"
              >
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Batch action bar */}
      {selectionMode && selectedChatIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-[#101921] border-t border-gray-200 dark:border-slate-800">
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
            {t("chats.selected", { n: selectedChatIds.size })}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchArchive}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#1c2a38] dark:border-slate-800 border border-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition disabled:opacity-50 text-slate-700 dark:text-slate-200"
            >
              {folderFilter.type === "archived" ? (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  {t("chats.unarchiveAll")}
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" />
                  {t("chats.archiveAll")}
                </>
              )}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#1c2a38] border border-red-200 dark:border-red-900/50 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("chats.deleteAll")}
            </button>
          </div>
        </div>
      )}

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-[#182533] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1.5 min-w-[170px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handlePinClick(contextMenu.chat);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-2.5"
          >
            <Pin className="h-4 w-4 text-slate-400" />
            <span>{contextMenu.chat.is_pinned ? "Unpin" : "Pin"}</span>
          </button>
          <button
            onClick={() => {
              handleMuteClick(contextMenu.chat);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-2.5"
          >
            {contextMenu.chat.is_muted ? (
              <Volume2 className="h-4 w-4 text-slate-400" />
            ) : (
              <VolumeX className="h-4 w-4 text-slate-400" />
            )}
            <span>{contextMenu.chat.is_muted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            onClick={() => {
              handleArchiveClick(null, contextMenu.chat);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-2.5"
          >
            {contextMenu.chat.is_archived ? (
              <ArchiveRestore className="h-4 w-4 text-slate-400" />
            ) : (
              <Archive className="h-4 w-4 text-slate-400" />
            )}
            <span>{contextMenu.chat.is_archived ? "Unarchive" : "Archive"}</span>
          </button>
          <hr className="my-1 border-slate-100 dark:border-slate-800" />
          <button
            onClick={() => {
              handleDeleteClick(null, contextMenu.chat);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-semibold text-red-600 transition flex items-center gap-2.5"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
            <span>Delete Chat</span>
          </button>
        </div>
      )}
    </div>
  );
}
