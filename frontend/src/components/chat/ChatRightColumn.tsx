import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Image,
  FileText,
  UserPlus,
  Shield,
  Key,
  Lock,
  Trash2,
  Plus,
  Check,
  Loader2,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { MessageItem } from "./types";
import { getAvatarGradient, getAuthParam } from "./helpers";

interface ChatRightColumnProps {
  showRightDrawer: boolean;
  setShowRightDrawer: (show: boolean) => void;
  chatTitle: string;
  chatType: string;
  chatId: number;
  accountId: string;
  isAuthenticated: boolean;
  getApiUrl: () => string;
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
  sharedMediaTab,
  setSharedMediaTab,
  allMessages,
  setLightboxMedia,
}: ChatRightColumnProps) {
  const queryClient = useQueryClient();
  const isGroupish = ["group", "supergroup", "channel"].includes(chatType);
  const [activeTab, setActiveTab] = useState<"info" | "members" | "admins" | "permissions" | "links">(
    isGroupish ? "info" : "info"
  );

  // 1. Fetch Members
  const { data: membersData, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["chat-members", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/members?limit=100`);
      return data;
    },
    enabled: showRightDrawer && isGroupish && (activeTab === "members" || activeTab === "admins"),
  });

  const members = membersData?.members || [];

  // 2. Fetch Default Permissions
  const { data: permissionsData, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ["chat-permissions", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/permissions`);
      return data;
    },
    enabled: showRightDrawer && isGroupish && activeTab === "permissions",
  });

  // 3. Fetch Invite Links
  const { data: linksData, isLoading: isLoadingLinks } = useQuery({
    queryKey: ["chat-invite-links", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/invite-links`);
      return data;
    },
    enabled: showRightDrawer && isGroupish && activeTab === "links",
  });

  const inviteLinks = linksData?.links || [];

  // Mutations
  const kickMutation = useMutation({
    mutationFn: async (userId: number) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/members/${userId}/kick`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-members", accountId, chatId] });
      alert("Member kicked successfully!");
    },
    onError: (err: any) => {
      alert("Failed to kick: " + (err.response?.data?.detail || err.message));
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (userId: number) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/members/${userId}/promote`, {
        change_info: true,
        delete_messages: true,
        ban_users: true,
        invite_users: true,
        pin_messages: true,
        add_admins: false,
        rank: "Admin",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-members", accountId, chatId] });
      alert("Member promoted to Administrator!");
    },
    onError: (err: any) => {
      alert("Failed to promote: " + (err.response?.data?.detail || err.message));
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async (updated: Record<string, boolean>) => {
      await api.put(`/accounts/${accountId}/chats/${chatId}/permissions`, updated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-permissions", accountId, chatId] });
      alert("Default permissions updated!");
    },
    onError: (err: any) => {
      alert("Failed to update permissions: " + (err.response?.data?.detail || err.message));
    },
  });

  const createLinkMutation = useMutation({
    mutationFn: async (payload: { title?: string; usage_limit?: number; expire_date?: number }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/invite-links`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-invite-links", accountId, chatId] });
      alert("Invite link created!");
    },
    onError: (err: any) => {
      alert("Failed to create link: " + (err.response?.data?.detail || err.message));
    },
  });

  if (!showRightDrawer) return null;

  return (
    <div className="w-80 h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#17212b] flex flex-col flex-shrink-0 z-30 animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {isGroupish ? "Group Info" : "User Info"}
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowRightDrawer(false);
          }}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Profile Detail */}
      <div className="p-4 flex flex-col items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-black/10">
        <div className="w-20 h-20 rounded-full flex-shrink-0 mb-3 relative bg-slate-100 ring-2 ring-slate-100/50">
          {isAuthenticated && accountId && (
            <img
              src={`${getApiUrl()}/accounts/${accountId}/chats/${chatId}/photo`}
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
              "w-full h-full flex items-center justify-center text-white font-bold text-2xl select-none rounded-full",
              getAvatarGradient(chatId)
            )}
            style={{ display: isAuthenticated && accountId ? "none" : "flex" }}
          >
            {(chatTitle || "?")[0]?.toUpperCase()}
          </div>
        </div>
        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 text-center">{chatTitle}</h4>
        <p className="text-xs text-slate-400 capitalize mt-0.5">{chatType}</p>
      </div>

      {/* Navigation Tabs */}
      {isGroupish && (
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 scrollbar-none">
          {(["info", "members", "admins", "permissions", "links"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3.5 py-3 border-b-2 capitalize transition flex-shrink-0",
                activeTab === tab
                  ? "border-primary text-primary font-extrabold"
                  : "border-transparent hover:text-slate-850 dark:hover:text-slate-200"
              )}
            >
              {tab === "links" ? "Invite Links" : tab}
            </button>
          ))}
        </div>
      )}

      {/* Main Drawer Body Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scroll">
        {activeTab === "info" && (
          <div className="flex flex-col h-full">
            {/* Shared Media Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSharedMediaTab("media");
                }}
                className={cn(
                  "flex-1 py-3 text-center border-b-2 transition",
                  sharedMediaTab === "media"
                    ? "border-primary text-primary font-bold"
                    : "border-transparent hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                Media
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSharedMediaTab("docs");
                }}
                className={cn(
                  "flex-1 py-3 text-center border-b-2 transition",
                  sharedMediaTab === "docs"
                    ? "border-primary text-primary font-bold"
                    : "border-transparent hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                Docs
              </button>
            </div>

            <div className="p-4 flex-1">
              {sharedMediaTab === "media" ? (
                <div className="grid grid-cols-3 gap-2">
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
                          className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 active:scale-95 transition border border-slate-200/40 dark:border-none relative"
                        >
                          {msg.stripped_thumb ? (
                            <img src={msg.stripped_thumb} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                              <Image className="h-4 w-4 text-slate-400" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {allMessages.filter((m) => m.media_type === "photo" || m.media_type === "video").length === 0 && (
                    <div className="col-span-3 text-center py-8 text-xs text-slate-450 font-medium">
                      No media found
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {allMessages
                    .filter((m) => m.media_type === "document")
                    .map((msg) => {
                      const downloadUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${msg.id}/media${getAuthParam()}`;
                      return (
                        <a
                          key={msg.id}
                          href={downloadUrl}
                          download={msg.media_filename || "file"}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800/65 transition text-left cursor-pointer truncate"
                        >
                          <FileText className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                          <span className="text-xs font-semibold truncate text-slate-700 dark:text-slate-250">
                            {msg.media_filename || "file"}
                          </span>
                        </a>
                      );
                    })}
                  {allMessages.filter((m) => m.media_type === "document").length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-450 font-medium">No files found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "members" && (
          <div className="p-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Group Members</h4>
            {isLoadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/55">
                {members.map((member: any) => (
                  <div key={member.user_id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                        {member.first_name?.[0] || "?"}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {member.first_name} {member.last_name || ""}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {member.username ? `@${member.username}` : "No username"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {member.is_creator && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/20 text-amber-600 rounded font-bold uppercase">
                          Owner
                        </span>
                      )}
                      {member.is_admin && !member.is_creator && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 rounded font-bold uppercase">
                          Admin
                        </span>
                      )}
                      {!member.is_admin && !member.is_creator && (
                        <>
                          <button
                            onClick={() => {
                              if (confirm(`Promote ${member.first_name} to Admin?`)) {
                                promoteMutation.mutate(member.user_id);
                              }
                            }}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary rounded"
                            title="Promote to Admin"
                          >
                            <Shield className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Kick ${member.first_name} from the group?`)) {
                                kickMutation.mutate(member.user_id);
                              }
                            }}
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-550 rounded"
                            title="Kick Member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "admins" && (
          <div className="p-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Administrators</h4>
            {isLoadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3">
                {members
                  .filter((m: any) => m.is_admin || m.is_creator)
                  .map((admin: any) => (
                    <div key={admin.user_id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold uppercase text-slate-650 dark:text-slate-300">
                          {admin.first_name?.[0] || "?"}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-850 dark:text-slate-205 truncate">
                            {admin.first_name} {admin.last_name || ""}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {admin.rank || (admin.is_creator ? "Owner" : "Admin")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="p-4 space-y-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Group Permissions</h4>
            {isLoadingPermissions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3.5">
                {[
                  { key: "send_messages", label: "Send Messages" },
                  { key: "send_media", label: "Send Media" },
                  { key: "send_stickers", label: "Send Stickers & GIFs" },
                  { key: "embed_links", label: "Embed Links" },
                  { key: "send_polls", label: "Send Polls" },
                  { key: "change_info", label: "Change Info" },
                  { key: "invite_users", label: "Invite Users" },
                  { key: "pin_messages", label: "Pin Messages" },
                ].map((perm) => {
                  const allowed = permissionsData?.[perm.key] !== false;
                  return (
                    <div key={perm.key} className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-305">{perm.label}</span>
                      <button
                        onClick={() => {
                          const updated = {
                            ...permissionsData,
                            [perm.key]: !allowed,
                          };
                          updatePermissionsMutation.mutate(updated);
                        }}
                        className={cn(
                          "w-9 h-5 rounded-full relative flex items-center px-0.5 transition cursor-pointer duration-200 active:scale-95",
                          allowed ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 bg-white rounded-full shadow transition-all duration-200",
                            allowed ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "links" && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Invite Links</h4>
              <button
                onClick={() => {
                  const title = prompt("Enter a title for this invite link:");
                  if (title !== null) {
                    createLinkMutation.mutate({ title });
                  }
                }}
                className="inline-flex items-center gap-1 text-[10px] bg-primary text-white font-bold px-2 py-1 rounded hover:opacity-90 active:scale-95 transition"
              >
                <Plus className="h-3 w-3" />
                Create Link
              </button>
            </div>

            {isLoadingLinks ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3">
                {inviteLinks.map((link: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-50 dark:bg-[#1c2732] rounded-xl border border-slate-100 dark:border-none flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex-1">
                        {link.title || "Invite Link"}
                      </span>
                      {link.permanent && (
                        <span className="text-[8px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 px-1 py-0.5 rounded font-extrabold uppercase">
                          Permanent
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-[10px] text-primary select-all truncate font-semibold">
                        {link.link}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(link.link);
                          alert("Link copied!");
                        }}
                        className="text-[9px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                      >
                        Copy
                      </button>
                    </div>
                    {link.usage !== null && (
                      <span className="text-[9px] text-slate-400 font-bold">
                        Used: {link.usage} {link.usage_limit ? `/ ${link.usage_limit}` : ""}
                      </span>
                    )}
                  </div>
                ))}
                {inviteLinks.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">No invite links found</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
