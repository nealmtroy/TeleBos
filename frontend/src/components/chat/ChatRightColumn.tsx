import React, { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Image,
  FileText,
  Shield,
  Trash2,
  Loader2,
  Link2,
  Copy,
  QrCode,
  Bell,
  Pencil,
  Check,
  ExternalLink,
  Bookmark,
  ShieldCheck,
  MoreVertical,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { MessageItem } from "./types";
import { getAvatarGradient } from "./helpers";

interface ChatRightColumnProps {
  showRightDrawer: boolean;
  setShowRightDrawer: (show: boolean) => void;
  chatTitle: string;
  chatType: string;
  chatId: number;
  accountId: string;
  isAuthenticated: boolean;
  getApiUrl: () => string;
  getAuthParam: () => string;
  sharedMediaTab: "media" | "docs";
  setSharedMediaTab: (tab: "media" | "docs") => void;
  allMessages: MessageItem[];
  setLightboxMedia: (media: { url: string; type: "photo" | "video" } | null) => void;
}

export function ChatRightColumn({
  showRightDrawer,
  setShowRightDrawer,
  chatTitle,
  chatType,
  chatId,
  accountId,
  isAuthenticated,
  getApiUrl,
  getAuthParam,
  sharedMediaTab,
  setSharedMediaTab,
  allMessages,
  setLightboxMedia,
}: ChatRightColumnProps) {
  const queryClient = useQueryClient();
  const isGroupish = ["group", "supergroup", "channel"].includes(chatType);
  const isChannel = chatType === "channel";
  const [activeTab, setActiveTab] = useState<"info" | "members" | "admins" | "permissions" | "links">("info");
  const [mediaFilterTab, setMediaFilterTab] = useState<"media" | "docs" | "links">("media");
  const [copied, setCopied] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Handle scroll to transform cover photo header
  const handleScroll = () => {
    if (scrollRef.current) {
      setIsScrolled(scrollRef.current.scrollTop > 40);
    }
  };

  // Fetch Full Chat Info / Username / Invite Link
  const { data: fullChatData } = useQuery({
    queryKey: ["chat-full", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/full`);
      return data;
    },
    enabled: showRightDrawer && !!accountId && !!chatId,
  });

  // Fetch Members
  const { data: membersData, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["chat-members", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/members?limit=100`);
      return data;
    },
    enabled: showRightDrawer && isGroupish && (activeTab === "members" || activeTab === "admins"),
  });

  const members = membersData?.members || [];

  // Fetch Permissions
  const { data: permissionsData, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ["chat-permissions", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/permissions`);
      return data;
    },
    enabled: showRightDrawer && isGroupish && activeTab === "permissions",
  });

  // Extract shared links from allMessages
  const extractedLinks = useMemo(() => {
    const links: { url: string; msgId: number; date: string }[] = [];
    const urlRegex = /(https?:\/\/[^\s<]+|t\.me\/[^\s<]+)/g;
    for (const msg of allMessages) {
      if (msg.text) {
        const matches = msg.text.match(urlRegex);
        if (matches) {
          for (const u of matches) {
            links.push({ url: u.startsWith("t.me") ? `https://${u}` : u, msgId: msg.id, date: msg.date });
          }
        }
      }
    }
    return links;
  }, [allMessages]);

  const username = fullChatData?.username || fullChatData?.about_username;
  const inviteLink = fullChatData?.invite_link || (username ? `https://t.me/${username}` : null);
  const subscriberCount = fullChatData?.participants_count || fullChatData?.subscribers_count || members.length || 0;

  const handleCopyLink = (linkStr: string) => {
    navigator.clipboard.writeText(linkStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!showRightDrawer) return null;

  return (
    <div
      className="w-80 h-full flex flex-col flex-shrink-0 z-30 animate-in slide-in-from-right duration-200 relative overflow-hidden"
      style={{ backgroundColor: "var(--tg-bg-primary)", borderLeft: "1px solid var(--tg-border)" }}
    >
      {/* Sticky Header */}
      <div
        className="flex items-center justify-between px-4 py-3 z-20 flex-shrink-0 transition-all duration-200"
        style={{
          backgroundColor: isScrolled ? "var(--tg-bg-primary)" : "transparent",
          borderBottom: isScrolled ? "1px solid var(--tg-border)" : "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowRightDrawer(false);
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center transition"
          style={{
            backgroundColor: isScrolled ? "transparent" : "rgba(0, 0, 0, 0.4)",
            color: isScrolled ? "var(--tg-text-primary)" : "#ffffff",
            backdropFilter: isScrolled ? "none" : "blur(4px)",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        <h3
          className="text-sm font-bold truncate px-2 transition-opacity duration-200"
          style={{
            color: isScrolled ? "var(--tg-text-primary)" : "#ffffff",
            opacity: isScrolled ? 1 : 0,
          }}
        >
          {isChannel ? "Channel Info" : isGroupish ? "Group Info" : "User Info"}
        </h3>

        <button
          className="w-8 h-8 rounded-full flex items-center justify-center transition"
          style={{
            backgroundColor: isScrolled ? "transparent" : "rgba(0, 0, 0, 0.4)",
            color: isScrolled ? "var(--tg-text-primary)" : "#ffffff",
            backdropFilter: isScrolled ? "none" : "blur(4px)",
          }}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Drawer Body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto tg-scroll"
        style={{ paddingTop: 0 }}
      >
        {/* Cover Photo & Avatar Zoom Container */}
        <div className="relative w-full overflow-hidden flex flex-col items-center justify-end" style={{ minHeight: 240 }}>
          {/* Full Cover Image Background */}
          {isAuthenticated && accountId ? (
            <img
              src={`${getApiUrl()}/accounts/${accountId}/chats/${chatId}/photo${getAuthParam()}`}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 w-full h-full object-cover"
              alt=""
            />
          ) : null}

          {/* Gradient overlay at bottom of cover photo */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0.4) 100%)",
            }}
          />

          {/* Title & Subtitle overlaid over photo cover */}
          <div className="relative z-10 w-full p-4 flex flex-col items-start text-left">
            <h2 className="text-lg font-bold text-white leading-snug drop-shadow-sm truncate w-full">
              {chatTitle}
            </h2>
            <p className="text-xs font-medium text-white/80 mt-0.5">
              {isChannel
                ? `${subscriberCount} subscribers`
                : isGroupish
                ? `${subscriberCount} members`
                : `@${username || "user"}`}
            </p>
          </div>
        </div>

        {/* Groupish Navigation Tabs */}
        {isGroupish && (
          <div className="flex overflow-x-auto border-b text-[11px] font-bold scrollbar-none" style={{ borderColor: "var(--tg-border)", backgroundColor: "var(--tg-bg-primary)" }}>
            {(["info", "members", "admins", "permissions", "links"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3.5 py-3 border-b-2 capitalize transition flex-shrink-0",
                  activeTab === tab
                    ? "border-primary text-primary font-extrabold"
                    : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                )}
              >
                {tab === "links" ? "Invite Links" : tab}
              </button>
            ))}
          </div>
        )}

        {/* Main Info Tab */}
        {activeTab === "info" && (
          <div className="p-3 space-y-3">
            {/* Username / Invite Link Info Card (Matching Telegram Web K) */}
            {(inviteLink || username) && (
              <div
                className="p-3 rounded-2xl flex items-center gap-3 shadow-sm"
                style={{ backgroundColor: "var(--tg-bg-secondary)", border: "1px solid var(--tg-border-light)" }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--tg-accent-light)", color: "var(--tg-accent)" }}>
                  <Link2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <a
                    href={inviteLink || `https://t.me/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold truncate block hover:underline"
                    style={{ color: "var(--tg-accent)" }}
                  >
                    {inviteLink || `https://t.me/${username}`}
                  </a>
                  <span className="text-[11px] font-medium block mt-0.5" style={{ color: "var(--tg-text-tertiary)" }}>
                    {username ? "Link" : "Invite Link"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopyLink(inviteLink || `https://t.me/${username}`)}
                    className="p-1.5 rounded-lg transition"
                    style={{ color: "var(--tg-text-secondary)" }}
                    title="Copy Link"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Notifications Toggle Card */}
            <div
              className="p-3 rounded-2xl flex items-center justify-between shadow-sm"
              style={{ backgroundColor: "var(--tg-bg-secondary)", border: "1px solid var(--tg-border-light)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--tg-accent-light)", color: "var(--tg-accent)" }}>
                  <Bell className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-bold block" style={{ color: "var(--tg-text-primary)" }}>
                    Notifications
                  </span>
                  <span className="text-[11px] font-medium block" style={{ color: "var(--tg-text-tertiary)" }}>
                    {notificationsOn ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
              <button
                className={`tg-toggle${notificationsOn ? " is-on" : ""}`}
                onClick={() => setNotificationsOn(!notificationsOn)}
              />
            </div>

            {/* Segmented Pill Tabs for Shared Content (Media | Docs | Links) */}
            <div className="pt-2">
              <div
                className="flex p-1 rounded-xl gap-1 mb-3"
                style={{ backgroundColor: "var(--tg-bg-secondary)" }}
              >
                {[
                  { key: "media", label: "Media" },
                  { key: "docs", label: "Docs" },
                  { key: "links", label: `Links (${extractedLinks.length})` },
                ].map((pill) => (
                  <button
                    key={pill.key}
                    onClick={() => setMediaFilterTab(pill.key as any)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold transition text-center"
                    style={{
                      backgroundColor: mediaFilterTab === pill.key ? "var(--tg-bg-primary)" : "transparent",
                      color: mediaFilterTab === pill.key ? "var(--tg-accent)" : "var(--tg-text-secondary)",
                      boxShadow: mediaFilterTab === pill.key ? "var(--tg-shadow-sm)" : "none",
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Shared Content View */}
              {mediaFilterTab === "media" && (
                <div className="grid grid-cols-3 gap-1.5">
                  {allMessages
                    .filter((m) => m.media_type === "photo" || m.media_type === "video")
                    .map((msg) => {
                      const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${msg.id}/media${getAuthParam()}`;
                      return (
                        <div
                          key={msg.id}
                          onClick={() =>
                            setLightboxMedia({
                              url: mediaUrl,
                              type: msg.media_type === "photo" ? "photo" : "video",
                            })
                          }
                          className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-90 active:scale-95 transition relative shadow-sm"
                          style={{ backgroundColor: "var(--tg-bg-secondary)", border: "1px solid var(--tg-border-light)" }}
                        >
                          {msg.stripped_thumb ? (
                            <img src={msg.stripped_thumb} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--tg-text-tertiary)" }}>
                              <Image className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {allMessages.filter((m) => m.media_type === "photo" || m.media_type === "video").length === 0 && (
                    <div className="col-span-3 text-center py-8 text-xs font-medium" style={{ color: "var(--tg-text-tertiary)" }}>
                      No media found
                    </div>
                  )}
                </div>
              )}

              {mediaFilterTab === "docs" && (
                <div className="space-y-2">
                  {allMessages
                    .filter((m) => m.media_type === "document")
                    .map((msg) => {
                      const downloadUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${msg.id}/media${getAuthParam()}`;
                      return (
                        <a
                          key={msg.id}
                          href={downloadUrl}
                          download={msg.media_filename || "file"}
                          className="flex items-center gap-3 p-2.5 rounded-xl transition text-left cursor-pointer truncate"
                          style={{ backgroundColor: "var(--tg-bg-secondary)", border: "1px solid var(--tg-border-light)" }}
                        >
                          <FileText className="h-5 w-5 flex-shrink-0" style={{ color: "var(--tg-accent)" }} />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold truncate" style={{ color: "var(--tg-text-primary)" }}>
                              {msg.media_filename || "file"}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--tg-text-tertiary)" }}>
                              Document
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  {allMessages.filter((m) => m.media_type === "document").length === 0 && (
                    <div className="text-center py-8 text-xs font-medium" style={{ color: "var(--tg-text-tertiary)" }}>
                      No files found
                    </div>
                  )}
                </div>
              )}

              {mediaFilterTab === "links" && (
                <div className="space-y-2">
                  {extractedLinks.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-xl transition text-left cursor-pointer truncate"
                      style={{ backgroundColor: "var(--tg-bg-secondary)", border: "1px solid var(--tg-border-light)" }}
                    >
                      <Link2 className="h-5 w-5 flex-shrink-0" style={{ color: "var(--tg-accent)" }} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-bold truncate hover:underline" style={{ color: "var(--tg-accent)" }}>
                          {item.url}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--tg-text-tertiary)" }}>
                          {new Date(item.date).toLocaleDateString()}
                        </span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-60" style={{ color: "var(--tg-text-tertiary)" }} />
                    </a>
                  ))}
                  {extractedLinks.length === 0 && (
                    <div className="text-center py-8 text-xs font-medium" style={{ color: "var(--tg-text-tertiary)" }}>
                      No shared links found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === "members" && (
          <div className="p-3 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider px-1" style={{ color: "var(--tg-text-tertiary)" }}>
              Group Members ({members.length})
            </h4>
            {isLoadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--tg-accent)" }} />
              </div>
            ) : (
              <div className="space-y-1">
                {members.map((member: any) => (
                  <div key={member.user_id} className="flex items-center justify-between p-2 rounded-xl transition" style={{ backgroundColor: "transparent" }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase text-white" style={{ backgroundColor: "var(--tg-accent)" }}>
                        {member.first_name?.[0] || "?"}
                      </div>
                      <div className="flex flex-col min-w-0 text-left">
                        <span className="text-xs font-bold truncate" style={{ color: "var(--tg-text-primary)" }}>
                          {member.first_name} {member.last_name || ""}
                        </span>
                        <span className="text-[10px] truncate" style={{ color: "var(--tg-text-tertiary)" }}>
                          {member.username ? `@${member.username}` : "User"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {member.is_creator && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{ backgroundColor: "var(--tg-accent-light)", color: "var(--tg-accent)" }}>
                          Owner
                        </span>
                      )}
                      {member.is_admin && !member.is_creator && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{ backgroundColor: "var(--tg-accent-light)", color: "var(--tg-accent)" }}>
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatRightColumn;
