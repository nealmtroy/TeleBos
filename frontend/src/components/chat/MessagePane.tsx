import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { useChatSocket } from "@/hooks/use-socket";
import { useDraftStore } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Loader2,
  ArrowLeft,
  Reply,
  X,
  Paperclip,
  ChevronUp,
  Archive,
  ArchiveRestore,
  Trash2,
  Send,
  FileText,
  Check,
  Pin,
  Mic,
  BarChart,
  Search,
  Calendar,
  Clock,
  Smile,
} from "lucide-react";
import { MessageItem, ChatItem } from "./types";
import { getAvatarGradient, getAuthParam } from "./helpers";
import { ChatRightColumn } from "./ChatRightColumn";
import { MessageBubble } from "./MessageBubble";
import { EmojiPicker } from "./EmojiPicker";
import { PollDialog } from "./PollDialog";
import { ScheduleModal } from "./ScheduleModal";
import { ScheduledQueueModal } from "./ScheduledQueueModal";
import { ForwardModal } from "./ForwardModal";
import { LightboxModal } from "./LightboxModal";
import { EMOJI_SUGGESTIONS } from "./constants";

interface MessagePaneProps {
  accountId: string;
  chatId: number;
  chatTitle: string;
  chatType: string;
  getApiUrl: () => string;
  getAuthParam: () => string;
  onBack: () => void;
  isArchived?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function MessagePane({
  accountId,
  chatId,
  chatTitle,
  chatType,
  getApiUrl,
  getAuthParam,
  onBack,
  isArchived,
  onArchive,
  onDelete,
}: MessagePaneProps) {
  const queryClient = useQueryClient();
  const t = useT();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messageText, setMessageText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load draft when switching chats
  useEffect(() => {
    if (accountId && chatId) {
      const draft = useDraftStore.getState().getDraft(accountId, chatId);
      setMessageText(draft);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }
  }, [chatId, accountId]);

  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [offsetId, setOffsetId] = useState(0);
  const [allMessages, setAllMessages] = useState<MessageItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  
  const [typingStatus, setTypingStatus] = useState<string | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: "photo" | "video" } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimerRef = useRef<any>(null);

  // Modal Visibility States
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [showRightDrawer, setShowRightDrawer] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScheduledQueueModal, setShowScheduledQueueModal] = useState(false);

  const [sharedMediaTab, setSharedMediaTab] = useState<"media" | "docs">("media");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: MessageItem } | null>(null);

  const [msgSelectionMode, setMsgSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
  
  const [showSuggest, setShowSuggest] = useState<"members" | "commands" | "emoji" | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestIndex, setSuggestIndex] = useState(0);

  // Search States
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMediaType, setSearchMediaType] = useState<string | null>(null);
  const [searchDateFrom, setSearchDateFrom] = useState<string>("");
  const [searchDateTo, setSearchDateTo] = useState<string>("");

  // Search query
  const { data: searchResultsData } = useQuery<MessageItem[]>({
    queryKey: ["chat-search", accountId, chatId, searchQuery, searchMediaType, searchDateFrom, searchDateTo],
    queryFn: async () => {
      const params: any = {};
      if (searchQuery) params.q = searchQuery;
      if (searchMediaType) params.media_type = searchMediaType;
      if (searchDateFrom) params.date_from = Math.floor(new Date(searchDateFrom).getTime() / 1000);
      if (searchDateTo) params.date_to = Math.floor(new Date(searchDateTo).getTime() / 1000);
      
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/messages/search`, { params });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!accountId && !!chatId && showSearchPanel && (!!searchQuery || !!searchMediaType || !!searchDateFrom || !!searchDateTo),
  });

  // Scheduled messages query
  const { data: scheduledMessagesData, refetch: refetchScheduled } = useQuery<MessageItem[]>({
    queryKey: ["scheduled-messages", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/messages/scheduled`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!accountId && !!chatId,
  });

  const { data: autocompleteMembersData } = useQuery({
    queryKey: ["chat-members", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/members?limit=100`);
      return data?.members || [];
    },
    enabled: !!accountId && !!chatId && showSuggest === "members",
  });

  // Fetch pinned messages
  const { data: pinnedMsgsData } = useQuery<MessageItem[]>({
    queryKey: ["pinnedMessages", accountId, chatId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats/${chatId}/pinned`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!accountId && !!chatId,
  });

  const pinMessageMutation = useMutation({
    mutationFn: async (msgId: number) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/${msgId}/pin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pinnedMessages", accountId, chatId] });
    },
  });

  const unpinMessageMutation = useMutation({
    mutationFn: async (msgId: number) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/${msgId}/unpin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pinnedMessages", accountId, chatId] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (msgId: number) => {
      await api.delete(`/accounts/${accountId}/chats/${chatId}/messages/${msgId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
  });

  const batchDeleteMessagesMutation = useMutation({
    mutationFn: async (msgIds: number[]) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/batch-delete`, {
        message_ids: msgIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
      setSelectedMsgIds(new Set());
    },
  });

  const sendVoiceMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const formData = new FormData();
      formData.append("file", blob, "voice.ogg");
      const { data } = await api.post(`/accounts/${accountId}/chats/${chatId}/voice`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    },
    onError: (err: any) => {
      alert("Failed to send voice note: " + (err.response?.data?.detail || err.message));
    }
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/ogg; codecs=opus" });
          sendVoiceMutation.mutate(audioBlob);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied or not available.");
    }
  };

  const stopRecording = (shouldSend: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      if (!shouldSend) {
        audioChunksRef.current = [];
      }
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setRecordingDuration(0);
  };

  const voteMutation = useMutation({
    mutationFn: async (params: { messageId: number; options: string[] }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/${params.messageId}/votes`, {
        options: params.options,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
    onError: (err: any) => {
      alert("Failed to submit vote: " + (err.response?.data?.detail || err.message));
    }
  });

  const scrollToMessage = (msgId: number) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/20");
      setTimeout(() => {
        el.classList.remove("bg-primary/20");
      }, 1500);
    } else {
      (window as any).__pendingJumpMessageId = msgId;
      setOffsetId(Math.max(0, msgId - 5));
    }
  };

  // Fetch messages
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
      const container = scrollContainerRef.current;
      const prevScrollHeight = container ? container.scrollHeight : 0;
      const prevScrollTop = container ? container.scrollTop : 0;

      setAllMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNew = newMsgs.filter((m) => !existingIds.has(m.id));
        return [...uniqueNew, ...prev];
      });
      setIsInitialLoad(false);

      if (container && prevScrollHeight > 0) {
        requestAnimationFrame(() => {
          const newScrollHeight = container.scrollHeight;
          const diff = newScrollHeight - prevScrollHeight;
          container.scrollTop = prevScrollTop + diff;
        });
      }
    }

    const pendingJumpId = (window as any).__pendingJumpMessageId;
    if (pendingJumpId) {
      delete (window as any).__pendingJumpMessageId;
      setTimeout(() => {
        const el = document.getElementById(`msg-${pendingJumpId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("bg-primary/20");
          setTimeout(() => {
            el.classList.remove("bg-primary/20");
          }, 1500);
        }
      }, 350);
    }
  }, [messagesData, offsetId, chatId]);

  // Real-time WebSocket updates for open chat
  const { setHandler: setPaneHandler } = useChatSocket(accountId);

  const handleRealtimeEventInPane = useCallback(
    (data: any) => {
      if (!data || !data.type) return;

      if (data.type === "typing" && data.chat_id === chatId) {
        setTypingStatus(`${data.action || "typing"}...`.replace("_", " "));
        
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setTypingStatus(null);
        }, 4000);
      } else if (data.type === "user_update" && data.user_id === chatId) {
        setOnlineStatus(data.status);
      } else if ((data.type === "new_message" || data.type === "outgoing_message") && data.chat_id === chatId) {
        const newMsgItem: MessageItem = {
          id: data.message_id,
          sender_id: data.sender_id || null,
          sender_name: data.sender_name || (data.type === "outgoing_message" ? "You" : "Unknown"),
          text: data.text,
          date: data.date || new Date().toISOString(),
          is_outgoing: data.is_outgoing ?? (data.type === "outgoing_message"),
          reply_to_msg_id: data.reply_to_msg_id || null,
          reply_preview: null,
          media_type: data.media_type || null,
          media_filename: data.media_filename || null,
          stripped_thumb: data.stripped_thumb || null,
          waveform_levels: data.waveform_levels || [],
          file_size: data.file_size || null,
          mime_type: data.mime_type || null,
        };

        setAllMessages((prev) => {
          if (prev.some((m) => m.id === newMsgItem.id)) return prev;
          return [...prev, newMsgItem];
        });

        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        });

        api.post(`/accounts/${accountId}/chats/${chatId}/read`).catch(() => {});
      }
    },
    [accountId, chatId]
  );

  useEffect(() => {
    setPaneHandler(handleRealtimeEventInPane);
  }, [setPaneHandler, handleRealtimeEventInPane]);

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
      if (accountId && chatId) {
        useDraftStore.getState().setDraft(accountId, chatId, "");
      }
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

  const handleSelectSuggestion = (value: string) => {
    const words = messageText.split(/\s+/);
    words.pop();
    const newVal = [...words, value].join(" ") + " ";
    setMessageText(newVal);
    setShowSuggest(null);
    inputRef.current?.focus();
  };

  const handleInputChange = (val: string) => {
    setMessageText(val);
    if (accountId && chatId) {
      useDraftStore.getState().setDraft(accountId, chatId, val);
    }
    const lastWord = val.split(/\s+/).pop() || "";
    if (lastWord.startsWith("@") && lastWord.length > 1) {
      setShowSuggest("members");
      setSuggestQuery(lastWord.slice(1));
    } else if (lastWord.startsWith("/") && lastWord.length > 1) {
      setShowSuggest("commands");
      setSuggestQuery(lastWord.slice(1));
    } else if (lastWord.startsWith(":") && lastWord.length > 1) {
      setShowSuggest("emoji");
      setSuggestQuery(lastWord.slice(1));
    } else {
      setShowSuggest(null);
    }
  };

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

  // Media Viewer navigation
  const mediaList = useMemo(() => {
    return allMessages.filter((m) => m.media_type === "photo" || m.media_type === "video" || m.media_type === "animation");
  }, [allMessages]);

  const currentMediaIndex = useMemo(() => {
    if (!lightboxMedia) return -1;
    return mediaList.findIndex((m) => {
      const isPhoto = m.media_type === "photo";
      const mediaUrl = isPhoto
        ? `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${m.id}/media${getAuthParam()}`
        : `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${m.id}/media${getAuthParam()}`;
      return mediaUrl === lightboxMedia.url || (m.media_filename && lightboxMedia.url.includes(m.id.toString()));
    });
  }, [lightboxMedia, mediaList, accountId, chatId, getApiUrl, getAuthParam]);

  const navigateMedia = (dir: "prev" | "next") => {
    if (currentMediaIndex === -1) return;
    const targetIdx = dir === "prev" ? currentMediaIndex - 1 : currentMediaIndex + 1;
    if (targetIdx >= 0 && targetIdx < mediaList.length) {
      const targetMsg = mediaList[targetIdx];
      const isPhoto = targetMsg.media_type === "photo";
      const targetUrl = isPhoto
        ? `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${targetMsg.id}/media${getAuthParam()}`
        : `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${targetMsg.id}/media${getAuthParam()}`;
      setLightboxMedia({ url: targetUrl, type: isPhoto ? "photo" : "video" });
    }
  };

  function getReplyText(msgId: number | null): string | null {
    if (!msgId) return null;
    const target = allMessages.find((m) => m.id === msgId);
    if (target) return target.text || "[media]";
    return null;
  }

  // Handle document click to close pickers/menus
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest(".tg-emoji-picker") || target.closest(".tg-emoji-btn"))) {
        return;
      }
      setContextMenu(null);
      setShowEmojiPicker(false);
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 relative overflow-hidden" style={{ backgroundColor: "var(--tg-bg-chat)" }}>
      {/* Chat header */}
      <div
        onClick={() => setShowRightDrawer(!showRightDrawer)}
        className="flex items-center gap-3.5 px-4 py-3 flex-shrink-0 cursor-pointer select-none transition duration-150 z-10"
        style={{ backgroundColor: "var(--tg-bg-primary)", borderBottom: "1px solid var(--tg-border)" }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBack();
          }}
          className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 rounded-xl transition duration-200 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="w-10 h-10 rounded-full flex-shrink-0 bg-slate-100 relative ring-2 ring-slate-100/50">
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
              "w-full h-full flex items-center justify-center text-white font-bold text-sm select-none rounded-full",
              chatType === "user" && `bg-gradient-to-br ${getAvatarGradient(chatId)}`,
              (chatType === "group" || chatType === "supergroup") && "bg-gradient-to-br from-emerald-500 to-teal-600",
              chatType === "channel" && "bg-gradient-to-br from-violet-500 to-purple-600",
              chatType === "bot" && "bg-gradient-to-br from-amber-500 to-orange-600"
            )}
            style={{ display: isAuthenticated && accountId ? "none" : "flex" }}
          >
            {(chatTitle || "?")[0]?.toUpperCase()}
          </div>
        </div>

        <div className="flex-1 min-w-0 text-left">
          <h2 className="text-sm font-bold truncate" style={{ color: "var(--tg-text-primary)" }}>{chatTitle}</h2>
          <p className="text-xs font-medium truncate leading-tight mt-0.5">
            {typingStatus ? (
              <span className="text-primary dark:text-blue-400 font-semibold animate-pulse">{typingStatus}</span>
            ) : onlineStatus ? (
              <span className={cn(
                "capitalize",
                onlineStatus.includes("Online") || onlineStatus.includes("online")
                  ? "text-green-600 dark:text-green-400 font-bold"
                  : "text-slate-400 dark:text-slate-500"
              )}>
                {onlineStatus.replace("UserStatus", "").toLowerCase()}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 capitalize">{chatType}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSearchPanel(!showSearchPanel);
            }}
            className={cn(
              "p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95",
              showSearchPanel && "text-primary bg-primary/10 dark:bg-primary/20"
            )}
            title="Search Messages"
          >
            <Search className="h-4.5 w-4.5" />
          </button>
          {onArchive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-850 transition active:scale-95"
              title={isArchived ? t("chats.unarchive") : t("chats.archive")}
            >
              {isArchived ? (
                <ArchiveRestore className="h-4.5 w-4.5" />
              ) : (
                <Archive className="h-4.5 w-4.5" />
              )}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition active:scale-95"
              title={t("chats.delete")}
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>

      {showSearchPanel && (
        <div className="bg-slate-50 dark:bg-[#1a242f] border-b border-slate-200/60 dark:border-slate-800/80 px-4 py-3 flex flex-col gap-3 z-10 select-none animate-in slide-in-from-top-2 duration-200 flex-shrink-0 text-left">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-xs font-semibold text-slate-800 dark:text-white"
              />
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
            </div>
            <button
              onClick={() => {
                setShowSearchPanel(false);
                setSearchQuery("");
                setSearchMediaType(null);
                setSearchDateFrom("");
                setSearchDateTo("");
              }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 rounded-lg transition"
              title="Close Search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full sm:max-w-[50%] scrollbar-none">
              {([
                { type: null, label: "All" },
                { type: "photo", label: "Photos" },
                { type: "video", label: "Videos" },
                { type: "document", label: "Files" },
                { type: "voice", label: "Voice" },
                { type: "url", label: "Links" },
                { type: "gif", label: "GIFs" },
              ] as const).map((filter) => (
                <button
                  key={filter.label}
                  onClick={() => setSearchMediaType(filter.type)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-[10px] font-bold transition flex-shrink-0",
                    searchMediaType === filter.type
                      ? "bg-primary border-primary text-white"
                      : "bg-white dark:bg-[#202b36] border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                From:
              </span>
              <input
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202b36] rounded-lg text-slate-700 dark:text-slate-350 focus:outline-none"
              />
              <span className="flex items-center gap-1 ml-2">
                To:
              </span>
              <input
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202b36] rounded-lg text-slate-700 dark:text-slate-350 focus:outline-none"
              />
            </div>
          </div>

          {searchResultsData && searchResultsData.length > 0 ? (
            <div className="bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-slate-800/80 rounded-xl p-2 max-h-40 overflow-y-auto custom-scroll flex flex-col gap-1 shadow-sm mt-1">
              {searchResultsData.map((resMsg) => (
                <button
                  key={resMsg.id}
                  onClick={() => scrollToMessage(resMsg.id)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] rounded-lg flex items-center justify-between text-xs transition border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <div className="flex flex-col flex-1 min-w-0 pr-4">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px] truncate">
                      {resMsg.sender_name || "Unknown"}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 truncate text-[11px] mt-0.5 text-left">
                      {resMsg.text || `[${resMsg.media_type || "Media"}]`}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-600 font-medium">
                    {new Date(resMsg.date).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          ) : showSearchPanel && (searchQuery || searchMediaType || searchDateFrom || searchDateTo) ? (
            <div className="text-center py-2 text-[11px] text-slate-400 font-semibold bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-slate-800 rounded-xl">
              No results found
            </div>
          ) : null}
        </div>
      )}

      {/* Pinned Message Bar */}
      {pinnedMsgsData && pinnedMsgsData.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-[#17212b] border-b border-slate-200 dark:border-slate-800 z-10 select-none animate-in slide-in-from-top duration-200 flex-shrink-0">
          <div className="flex items-center gap-3 cursor-pointer truncate" onClick={() => scrollToMessage(pinnedMsgsData[0].id)}>
            <Pin className="h-4 w-4 text-primary rotate-45 flex-shrink-0" />
            <div className="flex flex-col truncate text-left">
              <span className="text-[10px] font-bold text-primary tracking-wide uppercase">Pinned Message</span>
              <span className="text-xs text-slate-600 dark:text-slate-350 truncate font-medium">
                {pinnedMsgsData[0].text || "Attachment"}
              </span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              unpinMessageMutation.mutate(pinnedMsgsData[0].id);
            }}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main middle body: Scroll Area + Right Drawer */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Messages list container */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4 py-3 tg-wallpaper tg-scroll"
          >
            {isLoading && allMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : allMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 dark:bg-[#17212b] dark:border-slate-800 flex items-center justify-center mb-4">
                  <MessageSquare className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-500">{t("chats.noMessages")}</p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-1">
                {hasMore && (
                  <div className="flex justify-center py-3">
                    <button
                      onClick={handleLoadOlder}
                      disabled={isFetching}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white dark:bg-[#17212b] dark:border-slate-800 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 hover:shadow-sm transition disabled:opacity-50"
                    >
                      {isFetching ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <ChevronUp className="h-3 w-3" />
                      )}
                      {t("chats.loadOlder")}
                    </button>
                  </div>
                )}

                {groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center justify-center py-4 sticky top-0 z-10">
                      <span className="px-3.5 py-1 date-header text-[11px] text-white rounded-full border border-white/5 font-semibold select-none shadow-sm">
                        {group.date}
                      </span>
                    </div>

                    {group.messages.map((msg, idx) => {
                      const isOut = msg.is_outgoing;
                      const isFirst =
                        idx === 0 ||
                        group.messages[idx - 1]?.sender_id !== msg.sender_id ||
                        (new Date(msg.date).getTime() - new Date(group.messages[idx - 1].date).getTime() > 5 * 60 * 1000);
                        
                      const isLast =
                        idx === group.messages.length - 1 ||
                        group.messages[idx + 1]?.sender_id !== msg.sender_id ||
                        (new Date(group.messages[idx + 1].date).getTime() - new Date(msg.date).getTime() > 5 * 60 * 1000);

                      const showName =
                        !isOut &&
                        (chatType === "group" || chatType === "supergroup") &&
                        isFirst;

                      const replyText = getReplyText(msg.reply_to_msg_id);
                      const isSelected = selectedMsgIds.has(msg.id);

                      return (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          chatType={chatType}
                          isFirst={isFirst}
                          isLast={isLast}
                          showName={showName}
                          replyText={replyText}
                          isSelected={isSelected}
                          msgSelectionMode={msgSelectionMode}
                          setSelectedMsgIds={setSelectedMsgIds}
                          setReplyTo={setReplyTo}
                          setContextMenu={setContextMenu}
                          setLightboxMedia={setLightboxMedia}
                          voteMutation={voteMutation}
                          accountId={accountId}
                          chatId={chatId}
                          getApiUrl={getApiUrl}
                          t={t}
                        />
                      );
                    })}
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right Drawer (Profile & Shared Media) */}
        <ChatRightColumn
          showRightDrawer={showRightDrawer}
          setShowRightDrawer={setShowRightDrawer}
          chatTitle={chatTitle}
          chatType={chatType}
          chatId={chatId}
          accountId={accountId}
          isAuthenticated={isAuthenticated}
          getApiUrl={getApiUrl}
          getAuthParam={getAuthParam}
          sharedMediaTab={sharedMediaTab}
          setSharedMediaTab={setSharedMediaTab}
          allMessages={allMessages}
          setLightboxMedia={setLightboxMedia}
        />
      </div>

      {/* Message input zone or Selection Bar */}
      {msgSelectionMode ? (
        <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-1 bg-transparent flex-shrink-0 z-20 relative animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between bg-white dark:bg-[#17212b] rounded-2xl shadow-[0_1.5px_4px_rgba(0,0,0,0.12)] border border-slate-200/30 dark:border-none p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setMsgSelectionMode(false);
                  setSelectedMsgIds(new Set());
                }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {selectedMsgIds.size} messages selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowForwardModal(true);
                }}
                disabled={selectedMsgIds.size === 0}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#202b36] dark:hover:bg-slate-700 rounded-xl text-primary font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Reply className="h-4 w-4 scale-x-[-1]" />
                Forward
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete the ${selectedMsgIds.size} selected messages?`)) {
                    batchDeleteMessagesMutation.mutate(Array.from(selectedMsgIds));
                  }
                }}
                disabled={selectedMsgIds.size === 0}
                className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/20 rounded-xl text-red-500 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-1 bg-transparent flex-shrink-0 z-20 relative animate-in fade-in-50">
          {showSuggest && (
            <div
              className="absolute bottom-16 left-4 bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-none rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.15)] p-2.5 z-30 w-64 max-h-48 overflow-y-auto custom-scroll animate-in slide-in-from-bottom-2 duration-150 flex flex-col gap-1 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {showSuggest === "commands" &&
                ["/start", "/help", "/settings", "/stats", "/broadcast"]
                  .filter((cmd) => cmd.toLowerCase().includes(suggestQuery.toLowerCase()))
                  .map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => handleSelectSuggestion(cmd)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                    >
                      {cmd}
                    </button>
                  ))}
              {showSuggest === "emoji" &&
                EMOJI_SUGGESTIONS
                  .filter((item) => item.key.toLowerCase().includes(suggestQuery.toLowerCase()))
                  .map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleSelectSuggestion(item.val)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition flex items-center justify-between"
                    >
                      <span>:{item.key}:</span>
                      <span>{item.val}</span>
                    </button>
                  ))}
              {showSuggest === "members" &&
                (autocompleteMembersData && autocompleteMembersData.length > 0 ? (
                  autocompleteMembersData
                    .filter((member: any) => {
                      const name = `${member.first_name || ""} ${member.last_name || ""}`.trim().toLowerCase();
                      const username = (member.username || "").toLowerCase();
                      return name.includes(suggestQuery.toLowerCase()) || username.includes(suggestQuery.toLowerCase());
                    })
                    .map((member: any) => {
                      const label = member.username ? `@${member.username}` : `${member.first_name || ""} ${member.last_name || ""}`.trim();
                      return (
                        <button
                          key={member.user_id}
                          onClick={() => handleSelectSuggestion(member.username ? `@${member.username}` : member.first_name || "")}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                        >
                          {label}
                        </button>
                      );
                    })
                ) : (
                  <div className="text-center py-2 text-xs text-slate-400">
                    No matching members
                  </div>
                ))}
            </div>
          )}

          <EmojiPicker
            accountId={accountId}
            chatId={chatId}
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            getApiUrl={getApiUrl}
            getAuthParam={getAuthParam}
            setMessageText={setMessageText}
            inputRef={inputRef}
          />

          <div className="flex flex-col rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: "var(--tg-bg-primary)", border: "1px solid var(--tg-border)" }}>
            {scheduledMessagesData && scheduledMessagesData.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-[#202b36] border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 font-semibold select-none text-left">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary animate-pulse" />
                  You have {scheduledMessagesData.length} scheduled messages
                </span>
                <button
                  onClick={() => setShowScheduledQueueModal(true)}
                  className="text-xs text-primary font-bold hover:underline"
                >
                  View Queue
                </button>
              </div>
            )}
            {replyTo && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 dark:bg-primary/10 border-b border-slate-100 dark:border-slate-800/80">
                <Reply className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold text-primary truncate">
                    {replyTo.sender_name || "Message"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
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

            {attachedFile && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-[#202b36] border-b border-slate-100 dark:border-slate-800/80">
                <Paperclip className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                    {attachedFile.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {(attachedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            )}

            {isRecording ? (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#1a242f] w-full animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-350">
                    Recording Voice Note... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => stopRecording(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => stopRecording(true)}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-xs font-bold text-white transition flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2 px-3 py-2 w-full">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                  className="tg-emoji-btn p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#202b36] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition flex-shrink-0 w-10 h-10 flex items-center justify-center"
                  title="Emojis"
                >
                  <Smile className="h-5 w-5" />
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#202b36] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition flex-shrink-0 w-10 h-10 flex items-center justify-center"
                  title={t("chats.attachFile")}
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

                <button
                  onClick={() => setShowPollDialog(true)}
                  className="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#202b36] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition flex-shrink-0 w-10 h-10 flex items-center justify-center"
                  title="Create Poll"
                >
                  <BarChart className="h-5 w-5" />
                </button>

                <textarea
                  ref={inputRef}
                  value={messageText}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={attachedFile ? t("chats.addCaption") : t("chats.typeMessage")}
                  rows={1}
                  className="flex-1 resize-none px-2 py-2 bg-transparent text-[14.5px] placeholder:text-slate-400 focus:outline-none max-h-32 leading-relaxed"
                  style={{
                    color: "var(--tg-text-primary)",
                    height: "auto",
                    minHeight: "40px",
                    overflow: messageText.split("\n").length > 3 ? "auto" : "hidden",
                  }}
                  onInput={(e) => {
                    const tr = e.currentTarget;
                    tr.style.height = "auto";
                    tr.style.height = Math.min(tr.scrollHeight, 128) + "px";
                  }}
                />

                {messageText.trim() || attachedFile ? (
                  <div className="flex items-center gap-1.5">
                    {messageText.trim() && (
                      <button
                        onClick={() => setShowScheduleModal(true)}
                        className="p-2.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex-shrink-0 w-10 h-10 flex items-center justify-center"
                        title="Schedule Message"
                      >
                        <Clock className="h-4.5 w-4.5" />
                      </button>
                    )}
                    <button
                      onClick={handleSend}
                      disabled={sendMutation.isPending}
                      className="p-2.5 rounded-full transition-all duration-200 flex-shrink-0 flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground hover:opacity-90 active:scale-95 shadow-sm"
                    >
                      {sendMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-4.5 w-4.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startRecording}
                    className="p-2.5 rounded-full transition-all duration-200 flex-shrink-0 flex items-center justify-center w-10 h-10 bg-slate-100 hover:bg-slate-200 dark:bg-[#202b36] text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 active:scale-95 shadow-sm"
                    title="Record Voice Note"
                  >
                    <Mic className="h-4.5 w-4.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {sendMutation.isError && (
        <div className="px-4 py-1.5 bg-red-50 text-xs text-red-600 border-t border-red-100">
          {t("chats.sendFailed")}
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-slate-800 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] py-1.5 z-40 w-44 text-[13px] font-semibold text-slate-700 dark:text-slate-200 animate-in fade-in-0 duration-100 text-left"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setReplyTo(contextMenu.msg);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] transition flex items-center gap-2"
          >
            <Reply className="h-3.5 w-3.5 text-slate-400" />
            {t("chats.reply")}
          </button>
          {contextMenu.msg.text && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.msg.text || "");
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] transition flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
            >
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              Copy Text
            </button>
          )}
          <button
            onClick={() => {
              pinMessageMutation.mutate(contextMenu.msg.id);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] transition flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
          >
            <Pin className="h-3.5 w-3.5 text-slate-400 rotate-45" />
            Pin Message
          </button>
          <button
            onClick={() => {
              setMsgSelectionMode(true);
              setSelectedMsgIds(new Set([contextMenu.msg.id]));
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] transition flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
          >
            <Check className="h-3.5 w-3.5 text-slate-400" />
            Select Message
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this message?")) {
                deleteMessageMutation.mutate(contextMenu.msg.id);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#202b36] text-red-500 transition flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            Delete Message
          </button>
        </div>
      )}

      {/* Lightbox Media Gallery Modal */}
      <LightboxModal
        lightboxMedia={lightboxMedia}
        onClose={() => setLightboxMedia(null)}
        currentMediaIndex={currentMediaIndex}
        mediaListLength={mediaList.length}
        onNavigate={navigateMedia}
      />

      {/* Forward Messages Modal */}
      <ForwardModal
        accountId={accountId}
        chatId={chatId}
        isOpen={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        selectedMsgIds={selectedMsgIds}
        onSuccess={() => {
          setMsgSelectionMode(false);
          setSelectedMsgIds(new Set());
          setShowForwardModal(false);
        }}
      />

      {/* Create Poll Dialog */}
      <PollDialog
        accountId={accountId}
        chatId={chatId}
        isOpen={showPollDialog}
        onClose={() => setShowPollDialog(false)}
      />

      {/* Schedule Message DatePicker Modal */}
      <ScheduleModal
        accountId={accountId}
        chatId={chatId}
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        messageText={messageText}
        onSuccess={() => {
          setShowScheduleModal(false);
          setMessageText("");
          if (accountId && chatId) {
            useDraftStore.getState().setDraft(accountId, chatId, "");
          }
          refetchScheduled();
        }}
      />

      {/* Scheduled Queue Modal */}
      <ScheduledQueueModal
        accountId={accountId}
        chatId={chatId}
        isOpen={showScheduledQueueModal}
        onClose={() => setShowScheduledQueueModal(false)}
        scheduledMessagesData={scheduledMessagesData}
        onSendNow={(text) => {
          sendMutation.mutate({ text });
        }}
      />
    </div>
  );
}
