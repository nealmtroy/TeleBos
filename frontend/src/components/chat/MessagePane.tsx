import { useState, useRef, useCallback, useMemo, useEffect, memo } from "react";
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
  ChevronLeft,
  ChevronRight,
  Archive,
  ArchiveRestore,
  Trash2,
  Play,
  Pause,
  Smile,
  Send,
  FileText,
  Image,
  Check,
  Pin,
  Mic,
  BarChart,
  Search,
  Calendar,
  Clock,
} from "lucide-react";
import { MessageItem, ChatItem } from "./types";
import { getAvatarGradient, MEDIA_ICONS, getAuthParam } from "./helpers";
import {
  MessagePhoto,
  MessageVideo,
  MessageVideoNote,
  MessageVoice,
  MessageSticker,
  MessageDocument,
} from "./MessageMedia";
import { ChatRightColumn } from "./ChatRightColumn";

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

const EMOJI_CATEGORIES = [
  { label: "Smileys", icon: "😀", list: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚"] },
  { label: "Animals", icon: "🐱", list: ["🐱","🐶","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆"] },
  { label: "Food", icon: "🍏", list: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦"] },
  { label: "Travel", icon: "🚗", list: ["🚗","🚕","🚙","🚌","🚎","🏎️","◀️","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛹","🛴"] },
  { label: "Activities", icon: "⚽", list: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🪃","🎯","🪁","🏹","🎣","🤿"] },
  { label: "Objects", icon: "💡", list: ["💡","🔦","🎈","🎉","🎊","🔌","💻","🖥️","⌨️","🖱️","🖨️","🪙","💵","💶","💷","💳","💎","⚖️","⛓️","🪛"] },
  { label: "Symbols", icon: "❤️", list: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣","💕","💞","💓","💗","💖","💘","💝","💟","☮"] },
  { label: "Flags", icon: "🏁", list: ["🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇦🇨","🇦🇩","🇦🇪","🇦🇫","🇦🇬","🇦🇮","🇦🇱","🇦🇲","🇦🇴","🇦🇶","🇦🇷","🇦🇸"] }
];

const MOCK_GIFS = [
  { url: "https://media.giphy.com/media/mCbUi0MdxsO9a/giphy.gif", tags: "laugh laugh laugh lol fun funny laughing" },
  { url: "https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif", tags: "cat type computer work coding typing write keyboard" },
  { url: "https://media.giphy.com/media/yFQ0ywscgobJK/giphy.gif", tags: "dance fun happy party dancing moves" },
  { url: "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif", tags: "cat clap clapping cheer bravo well done congratulations" },
  { url: "https://media.giphy.com/media/GeimqsH0TLDt4tScGw/giphy.gif", tags: "dance cat cute music rhythm" },
  { url: "https://media.giphy.com/media/V4NSRKmme5J4Y/giphy.gif", tags: "dance happy joy celebration excited" },
  { url: "https://media.giphy.com/media/HteV6g0LY0IFy/giphy.gif", tags: "popcorn movie watch eating eat film theater" },
  { url: "https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif", tags: "facepalm fail sigh omg face palm face-palm" }
];
const EMOJI_SUGGESTIONS = [
  { key: "smile", val: "😀" },
  { key: "cat", val: "🐱" },
  { key: "dog", val: "🐶" },
  { key: "heart", val: "❤️" },
  { key: "thumb", val: "👍" },
  { key: "ok", val: "👌" },
  { key: "star", val: "⭐" },
  { key: "fire", val: "🔥" },
  { key: "party", val: "🎉" }
];

const renderFormattedText = (text: string | null) => {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/_(.*?)_/g, "<em>$1</em>");
  html = html.replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded font-mono text-[12.5px] font-semibold">$1</code>');
  
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [typingStatus, setTypingStatus] = useState<string | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: "photo" | "video" } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimerRef = useRef<any>(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAnonymous, setPollAnonymous] = useState(true);
  const [pollIsQuiz, setPollIsQuiz] = useState(false);
  const [pollCorrectIdx, setPollCorrectIdx] = useState<number | null>(null);
  const [showRightDrawer, setShowRightDrawer] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sharedMediaTab, setSharedMediaTab] = useState<"media" | "docs">("media");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: MessageItem } | null>(null);

  const [msgSelectionMode, setMsgSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif" | "sticker">("emoji");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [gifSearch, setGifSearch] = useState("");
  const [stickerSearch, setStickerSearch] = useState("");
  const [selectedStickerSet, setSelectedStickerSet] = useState<string | null>(null);
  const [showSuggest, setShowSuggest] = useState<"members" | "commands" | "emoji" | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestIndex, setSuggestIndex] = useState(0);

  // Phase 5 States
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMediaType, setSearchMediaType] = useState<string | null>(null);
  const [searchDateFrom, setSearchDateFrom] = useState<string>("");
  const [searchDateTo, setSearchDateTo] = useState<string>("");

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [showScheduledQueueModal, setShowScheduledQueueModal] = useState(false);

  const [zoomLevel, setZoomLevel] = useState(1);

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

  // Send scheduled message mutation
  const sendScheduledMutation = useMutation({
    mutationFn: async (payload: { text: string; schedule_date: number }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/scheduled`, payload);
    },
    onSuccess: () => {
      setShowScheduleModal(false);
      setScheduleTime("");
      setMessageText("");
      if (accountId && chatId) {
        useDraftStore.getState().setDraft(accountId, chatId, "");
      }
      refetchScheduled();
    },
    onError: (err: any) => {
      alert("Failed to schedule message: " + (err.response?.data?.detail || err.message));
    }
  });

  // Delete scheduled message mutation
  const deleteScheduledMutation = useMutation({
    mutationFn: async (msgId: number) => {
      await api.delete(`/accounts/${accountId}/chats/${chatId}/messages/scheduled`, {
        params: { message_ids: [msgId] }
      });
    },
    onSuccess: () => {
      refetchScheduled();
    },
    onError: (err: any) => {
      alert("Failed to delete scheduled message: " + (err.response?.data?.detail || err.message));
    }
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

  const { data: stickerSetsData } = useQuery({
    queryKey: ["sticker-sets", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stickers`);
      return data?.packs || [];
    },
    enabled: !!accountId && showEmojiPicker && pickerTab === "sticker",
  });

  const { data: stickerSetDetails, isLoading: isLoadingStickers } = useQuery({
    queryKey: ["sticker-set-details", accountId, selectedStickerSet],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stickers/sets/${selectedStickerSet}`);
      return data?.stickers || [];
    },
    enabled: !!accountId && !!selectedStickerSet && showEmojiPicker && pickerTab === "sticker",
  });

  const { data: savedGifsData } = useQuery({
    queryKey: ["saved-gifs", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/gifs/saved`);
      return data?.gifs || [];
    },
    enabled: !!accountId && showEmojiPicker && pickerTab === "gif" && !gifSearch,
  });

  const { data: searchedGifsData, isLoading: isSearchingGifs } = useQuery({
    queryKey: ["searched-gifs", accountId, gifSearch],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/gifs/search?q=${gifSearch}`);
      return data?.gifs || [];
    },
    enabled: !!accountId && showEmojiPicker && pickerTab === "gif" && !!gifSearch,
  });

  const { data: searchedStickersData, isLoading: isSearchingStickers } = useQuery({
    queryKey: ["searched-stickers", accountId, stickerSearch],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stickers/search?q=${stickerSearch}`);
      return data || { stickers: [], sets: [] };
    },
    enabled: !!accountId && showEmojiPicker && pickerTab === "sticker" && !!stickerSearch,
  });

  const sendGifMutation = useMutation({
    mutationFn: async (payload: { document_id: string; access_hash: string; file_reference: string }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/gifs`, payload);
    },
    onSuccess: () => {
      setShowEmojiPicker(false);
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
  });

  const saveGifMutation = useMutation({
    mutationFn: async (payload: { document_id: string; access_hash: string; unsave: boolean }) => {
      await api.post(`/accounts/${accountId}/gifs/save`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-gifs", accountId] });
    },
  });

  useEffect(() => {
    if (pickerTab === "sticker" && stickerSetsData && stickerSetsData.length > 0 && !selectedStickerSet) {
      setSelectedStickerSet(stickerSetsData[0].short_name);
    }
  }, [pickerTab, stickerSetsData, selectedStickerSet]);

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

  const sendStickerMutation = useMutation({
    mutationFn: async (payload: { document_id: string; access_hash: string; file_reference?: string }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/stickers`, payload);
    },
    onSuccess: () => {
      setShowEmojiPicker(false);
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
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

  const sendPollMutation = useMutation({
    mutationFn: async (payload: {
      question: string;
      options: string[];
      is_anonymous: boolean;
      is_quiz: boolean;
      correct_option_idx: number | null;
    }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/polls`, payload);
    },
    onSuccess: () => {
      setShowPollDialog(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollAnonymous(true);
      setPollIsQuiz(false);
      setPollCorrectIdx(null);
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
    onError: (err: any) => {
      alert("Failed to send poll: " + (err.response?.data?.detail || err.message));
    }
  });

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

  const forwardMutation = useMutation({
    mutationFn: async (params: { messageIds: number[]; toChatIds: number[] }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/messages/forward`, {
        message_ids: params.messageIds,
        to_chat_ids: params.toChatIds,
      });
    },
    onSuccess: () => {
      setMsgSelectionMode(false);
      setSelectedMsgIds(new Set());
      setShowForwardModal(false);
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
  });

  const { data: forwardChatsData } = useQuery<{ chats: ChatItem[] }>({
    queryKey: ["forward-chats", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/chats?page=1&page_size=100`);
      return data;
    },
    enabled: !!accountId && showForwardModal,
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

  const handleSendGif = (gif: { id: string; access_hash: string; file_reference: string }) => {
    sendGifMutation.mutate({
      document_id: gif.id,
      access_hash: gif.access_hash,
      file_reference: gif.file_reference,
    });
    setShowEmojiPicker(false);
  };

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
      setSuggestQuery(suggestQuery);
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

  // Media Viewer navigation & zoom
  const mediaList = useMemo(() => {
    return allMessages.filter((m) => m.media_type === "photo" || m.media_type === "video");
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
  }, [lightboxMedia, mediaList, accountId, chatId]);

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
      setZoomLevel(1);
    }
  };

  function getReplyText(msgId: number | null): string | null {
    if (!msgId) return null;
    const target = allMessages.find((m) => m.id === msgId);
    if (target) return target.text || "[media]";
    return null;
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 relative bg-white dark:bg-[#0e1621] overflow-hidden">
      {/* Chat header */}
      <div
        onClick={() => setShowRightDrawer(!showRightDrawer)}
        className="flex items-center gap-3.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#17212b] flex-shrink-0 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/40 transition duration-150 z-10"
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

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{chatTitle}</h2>
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
                    <span className="text-slate-400 dark:text-slate-500 truncate text-[11px] mt-0.5">
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
            <div className="flex flex-col truncate">
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
            className="flex-1 overflow-y-auto px-4 py-3 telegram-wallpaper custom-scroll bg-chat-wallpaper"
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
              className="absolute bottom-16 left-4 bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-none rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.15)] p-2.5 z-30 w-64 max-h-48 overflow-y-auto custom-scroll animate-in slide-in-from-bottom-2 duration-150 flex flex-col gap-1"
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

          {showEmojiPicker && (
            <div
              className="absolute bottom-16 left-4 bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-none rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.15)] p-3.5 z-30 w-80 h-96 flex flex-col animate-in slide-in-from-bottom-2 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Tab Headers */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                {(["emoji", "sticker", "gif"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setPickerTab(tab)}
                    className={cn(
                      "flex-1 pb-2 text-center border-b-2 capitalize transition font-bold",
                      pickerTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent hover:text-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Picker Body */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {pickerTab === "emoji" && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <input
                      type="text"
                      placeholder="Search Emojis..."
                      value={emojiSearch}
                      onChange={(e) => setEmojiSearch(e.target.value)}
                      className="w-full px-3 py-1.5 mb-2 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white"
                    />
                    <div className="flex-1 overflow-y-auto custom-scroll pr-1">
                      {EMOJI_CATEGORIES.map((cat) => {
                        const filtered = cat.list.filter((em) =>
                          emojiSearch ? cat.label.toLowerCase().includes(emojiSearch.toLowerCase()) || em === emojiSearch : true
                        );
                        if (filtered.length === 0) return null;
                        return (
                          <div key={cat.label} className="mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              {cat.icon} {cat.label}
                            </span>
                            <div className="grid grid-cols-7 gap-2 text-center text-lg">
                              {filtered.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => {
                                    setMessageText((prev) => prev + emoji);
                                    inputRef.current?.focus();
                                  }}
                                  className="hover:scale-125 transition duration-100"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pickerTab === "sticker" && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-3.5 pt-2 pb-2.5 flex-shrink-0">
                      <input
                        type="text"
                        placeholder="Search stickers or emoticons..."
                        value={stickerSearch}
                        onChange={(e) => setStickerSearch(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white"
                      />
                    </div>
                    {stickerSearch ? (
                      <div className="flex-1 overflow-y-auto custom-scroll px-3.5 pb-3">
                        {isSearchingStickers ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          </div>
                        ) : (
                          <>
                            {searchedStickersData?.stickers && searchedStickersData.stickers.length > 0 && (
                              <div className="mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                                  Matching Stickers
                                </span>
                                <div className="grid grid-cols-4 gap-2.5">
                                  {searchedStickersData.stickers.map((sticker: any) => {
                                    const stickerUrl = `${getApiUrl()}/accounts/${accountId}/stickers/documents/${sticker.id}/${sticker.access_hash}/download${getAuthParam()}${sticker.file_reference ? `&file_reference=${sticker.file_reference}` : ""}`;
                                    return (
                                      <button
                                        key={sticker.id}
                                        onClick={() => {
                                          sendStickerMutation.mutate({
                                            document_id: sticker.id,
                                            access_hash: sticker.access_hash,
                                            file_reference: sticker.file_reference,
                                          });
                                        }}
                                        className="aspect-square bg-slate-50 dark:bg-[#202b36]/20 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition border border-slate-150 dark:border-none p-1 flex items-center justify-center cursor-pointer"
                                      >
                                        <img src={stickerUrl} className="w-full h-full object-contain" loading="lazy" alt="" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {searchedStickersData?.sets && searchedStickersData.sets.length > 0 && (
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                                  Matching Sticker Packs
                                </span>
                                <div className="flex flex-col gap-2">
                                  {searchedStickersData.sets.map((set: any) => (
                                    <button
                                      key={set.set_id}
                                      onClick={() => {
                                        setStickerSearch("");
                                        setSelectedStickerSet(set.short_name);
                                      }}
                                      className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-[#202b36]/40 hover:bg-slate-100 dark:hover:bg-[#202b36]/80 text-left border border-slate-100 dark:border-slate-800 transition cursor-pointer"
                                    >
                                      {set.stickers && set.stickers.length > 0 ? (
                                        <img
                                          src={`${getApiUrl()}/accounts/${accountId}/stickers/documents/${set.stickers[0].id}/${set.stickers[0].access_hash}/download${getAuthParam()}&file_reference=${set.stickers[0].file_reference}`}
                                          className="w-10 h-10 object-contain"
                                          alt=""
                                        />
                                      ) : (
                                        <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center text-xs">📦</div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold truncate text-slate-800 dark:text-slate-200">{set.title}</div>
                                        <div className="text-[10px] text-slate-400">@{set.short_name}</div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(!searchedStickersData?.stickers || searchedStickersData.stickers.length === 0) &&
                             (!searchedStickersData?.sets || searchedStickersData.sets.length === 0) && (
                              <div className="text-center py-8 text-xs text-slate-400">
                                No stickers or packs found
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col min-h-0">
                        {stickerSetsData && stickerSetsData.length > 0 ? (
                          <>
                            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-100 dark:border-slate-800/80 mb-2 scrollbar-none flex-shrink-0 px-3.5">
                              {stickerSetsData.map((pack: any) => (
                                <button
                                  key={pack.id}
                                  onClick={() => setSelectedStickerSet(pack.short_name)}
                                  className={cn(
                                    "px-2.5 py-1 text-[10px] font-bold rounded-lg border flex-shrink-0 transition",
                                    selectedStickerSet === pack.short_name
                                      ? "bg-primary border-primary text-white"
                                      : "bg-slate-50 dark:bg-[#202b36] border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                  )}
                                >
                                  {pack.title}
                                </button>
                              ))}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scroll px-3.5">
                              {isLoadingStickers ? (
                                <div className="flex justify-center py-8">
                                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                              ) : stickerSetDetails && stickerSetDetails.length > 0 ? (
                                <div className="grid grid-cols-4 gap-2.5">
                                  {stickerSetDetails.map((sticker: any) => {
                                    const stickerUrl = `${getApiUrl()}/accounts/${accountId}/stickers/documents/${sticker.id}/${sticker.access_hash}/download${getAuthParam()}${sticker.file_reference ? `&file_reference=${sticker.file_reference}` : ""}`;
                                    return (
                                      <button
                                        key={sticker.id}
                                        onClick={() => {
                                          sendStickerMutation.mutate({
                                            document_id: sticker.id,
                                            access_hash: sticker.access_hash,
                                            file_reference: sticker.file_reference,
                                          });
                                        }}
                                        className="aspect-square bg-slate-50 dark:bg-[#202b36]/20 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition border border-slate-150 dark:border-none p-1 flex items-center justify-center cursor-pointer"
                                      >
                                        <img
                                          src={stickerUrl}
                                          className="w-full h-full object-contain"
                                          loading="lazy"
                                          alt=""
                                        />
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-center py-8 text-xs text-slate-400">
                                  No stickers in this pack
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-8 text-xs text-slate-400">
                            No sticker packs installed
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {pickerTab === "gif" && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-3.5 pt-2 pb-2.5 flex-shrink-0">
                      <input
                        type="text"
                        placeholder="Search GIFs..."
                        value={gifSearch}
                        onChange={(e) => setGifSearch(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scroll px-3.5 pb-3">
                      {isSearchingGifs ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {(gifSearch ? searchedGifsData : savedGifsData)?.map((gif: any) => {
                            const gifUrl = `${getApiUrl()}/accounts/${accountId}/gifs/documents/${gif.id}/${gif.access_hash}/download${getAuthParam()}${gif.file_reference ? `&file_reference=${gif.file_reference}` : ""}`;
                            const isSaved = savedGifsData?.some((sg: any) => sg.id === gif.id);
                            return (
                              <div
                                key={gif.id}
                                className="aspect-[4/3] rounded-xl overflow-hidden hover:opacity-95 active:scale-95 transition relative bg-slate-100 dark:bg-slate-800 group"
                              >
                                <button
                                  onClick={() => handleSendGif(gif)}
                                  className="w-full h-full cursor-pointer absolute inset-0 z-0"
                                >
                                  <video
                                    src={gifUrl}
                                    className="w-full h-full object-cover"
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                  />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveGifMutation.mutate({
                                      document_id: gif.id,
                                      access_hash: gif.access_hash,
                                      unsave: isSaved,
                                    });
                                  }}
                                  className="absolute top-1.5 right-1.5 z-10 p-1 bg-black/40 hover:bg-black/60 rounded-lg transition"
                                  title={isSaved ? "Unsave GIF" : "Save GIF"}
                                >
                                  {isSaved ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-500">
                                      <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-white">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                          {(!(gifSearch ? searchedGifsData : savedGifsData) || (gifSearch ? searchedGifsData : savedGifsData).length === 0) && (
                            <div className="col-span-2 text-center py-8 text-xs text-slate-400">
                              {gifSearch ? "No GIFs found" : "No saved GIFs. Search and save some!"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col bg-white dark:bg-[#17212b] rounded-2xl shadow-[0_1.5px_4px_rgba(0,0,0,0.12)] border border-slate-200/30 dark:border-none overflow-hidden">
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
                <div className="flex-1 min-w-0">
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
                <div className="flex-1 min-w-0">
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
                  className="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#202b36] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition flex-shrink-0 w-10 h-10 flex items-center justify-center"
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
                  className="flex-1 resize-none px-2 py-2 bg-transparent text-slate-800 dark:text-slate-100 text-[14.5px] placeholder:text-slate-400 focus:outline-none max-h-32 leading-relaxed"
                  style={{
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
          className="fixed bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-slate-800 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] py-1.5 z-40 w-44 text-[13px] font-semibold text-slate-700 dark:text-slate-200 animate-in fade-in-0 duration-100"
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
      {lightboxMedia && (
        <div
          className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in-0 duration-200 select-none"
          onClick={() => {
            setLightboxMedia(null);
            setZoomLevel(1);
          }}
        >
          <button
            onClick={() => {
              setLightboxMedia(null);
              setZoomLevel(1);
            }}
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
          >
            <X className="h-6 w-6" />
          </button>
          
          <a
            href={lightboxMedia.url}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-55 shadow-md flex items-center justify-center"
            title="Download"
          >
            <FileText className="h-6 w-6" />
          </a>

          {currentMediaIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateMedia("prev");
              }}
              className="absolute left-4 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
              title="Previous"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}

          {currentMediaIndex !== -1 && currentMediaIndex < mediaList.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateMedia("next");
              }}
              className="absolute right-4 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
              title="Next"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}

          <div
            className="relative max-w-[85vw] max-h-[80vh] flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxMedia.type === "photo" ? (
              <img
                src={lightboxMedia.url}
                onWheel={(e) => {
                  e.stopPropagation();
                  if (e.deltaY < 0) {
                    setZoomLevel((prev) => Math.min(prev + 0.25, 4));
                  } else {
                    setZoomLevel((prev) => Math.max(prev - 0.25, 1));
                  }
                }}
                style={{
                  transform: `scale(${zoomLevel})`,
                  transition: "transform 0.1s ease-out",
                  cursor: zoomLevel > 1 ? "zoom-out" : "zoom-in",
                }}
                onClick={() => {
                  if (zoomLevel > 1) setZoomLevel(1);
                  else setZoomLevel(2);
                }}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                alt="Fullscreen View"
              />
            ) : (
              <video
                src={lightboxMedia.url}
                controls
                autoPlay
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
        </div>
      )}

      {/* Forward Messages Modal */}
      {showForwardModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
          onClick={() => setShowForwardModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Forward to...</h3>
              <button
                onClick={() => setShowForwardModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/50 custom-scroll">
              {forwardChatsData?.chats && forwardChatsData.chats.length > 0 ? (
                forwardChatsData.chats
                  .filter((c) => c.chat_id !== chatId)
                  .map((c) => (
                    <button
                      key={c.chat_id}
                      onClick={() => {
                        forwardMutation.mutate({
                          messageIds: Array.from(selectedMsgIds),
                          toChatIds: [c.chat_id],
                        });
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-[#202b36] transition flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                        {(c.title || "?")[0]}
                      </div>
                      <span className="truncate flex-1">{c.title || "Unknown Chat"}</span>
                    </button>
                  ))
              ) : (
                <div className="text-center py-8 text-sm text-slate-400">
                  {forwardChatsData ? "No other chats found" : "Loading chats..."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Create Poll Dialog */}
      {showPollDialog && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
          onClick={() => setShowPollDialog(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-display">Create Poll</h3>
              <button
                onClick={() => setShowPollDialog(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Question
                </label>
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white font-medium text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Poll Options
                </label>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Option ${idx + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const updated = [...pollOptions];
                          updated[idx] = e.target.value;
                          setPollOptions(updated);
                        }}
                        className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white text-xs font-medium"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => {
                            const updated = pollOptions.filter((_, i) => i !== idx);
                            setPollOptions(updated);
                            if (pollCorrectIdx === idx) setPollCorrectIdx(null);
                            else if (pollCorrectIdx !== null && pollCorrectIdx > idx) {
                              setPollCorrectIdx(pollCorrectIdx - 1);
                            }
                          }}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition"
                          title="Remove choice"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 10 && (
                  <button
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    className="text-xs text-primary font-bold hover:underline mt-2 inline-block"
                  >
                    + Add an Option
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Anonymous Voting
                  </label>
                  <input
                    type="checkbox"
                    checked={pollAnonymous}
                    onChange={(e) => setPollAnonymous(e.target.checked)}
                    className="h-4 w-4 text-primary rounded border-slate-350 focus:ring-primary focus:outline-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Quiz Mode
                  </label>
                  <input
                    type="checkbox"
                    checked={pollIsQuiz}
                    onChange={(e) => {
                      setPollIsQuiz(e.target.checked);
                      if (!e.target.checked) setPollCorrectIdx(null);
                    }}
                    className="h-4 w-4 text-primary rounded border-slate-350 focus:ring-primary focus:outline-none cursor-pointer"
                  />
                </div>

                {pollIsQuiz && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Correct Choice
                    </label>
                    <select
                      value={pollCorrectIdx ?? ""}
                      onChange={(e) => setPollCorrectIdx(e.target.value === "" ? null : Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white text-xs font-medium"
                    >
                      <option value="">Select correct option...</option>
                      {pollOptions.map((opt, idx) => (
                        <option key={idx} value={idx}>
                          Option {idx + 1}: {opt || "(Empty)"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setShowPollDialog(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cleanedOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
                  if (!pollQuestion.trim()) {
                    alert("Please specify a question.");
                    return;
                  }
                  if (cleanedOptions.length < 2) {
                    alert("Please provide at least 2 choices.");
                    return;
                  }
                  if (pollIsQuiz && pollCorrectIdx === null) {
                    alert("Please select the correct choice for Quiz mode.");
                    return;
                  }
                  sendPollMutation.mutate({
                    question: pollQuestion,
                    options: cleanedOptions,
                    is_anonymous: pollAnonymous,
                    is_quiz: pollIsQuiz,
                    correct_option_idx: pollCorrectIdx,
                  });
                }}
                disabled={sendPollMutation.isPending}
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-90 active:scale-95 shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {sendPollMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Message DatePicker Modal */}
      {showScheduleModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col p-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-150 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Clock className="h-4.5 w-4.5 text-primary" />
                Schedule Message
              </h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="py-4 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Choose date and time to send this message:
              </p>
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-xs font-semibold text-slate-800 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-150 dark:border-slate-800">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-150 dark:hover:bg-slate-850 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!scheduleTime) {
                    alert("Please select a date and time.");
                    return;
                  }
                  const timestamp = Math.floor(new Date(scheduleTime).getTime() / 1000);
                  if (timestamp <= Math.floor(Date.now() / 1000)) {
                    alert("Scheduled time must be in the future.");
                    return;
                  }
                  sendScheduledMutation.mutate({
                    text: messageText,
                    schedule_date: timestamp,
                  });
                }}
                disabled={sendScheduledMutation.isPending}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 shadow-sm transition disabled:opacity-50 flex items-center gap-1"
              >
                {sendScheduledMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Queue Modal */}
      {showScheduledQueueModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
          onClick={() => setShowScheduledQueueModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh] text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Clock className="h-4.5 w-4.5 text-primary" />
                Scheduled Queue ({scheduledMessagesData?.length || 0})
              </h3>
              <button
                onClick={() => setShowScheduledQueueModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-3">
              {scheduledMessagesData && scheduledMessagesData.length > 0 ? (
                scheduledMessagesData.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 bg-slate-50 dark:bg-[#202b36]/40 border border-slate-150 dark:border-slate-800/80 rounded-xl flex flex-col gap-2 relative group/item"
                  >
                    <div className="flex justify-between items-start pr-12 text-left">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">
                        {msg.text}
                      </p>
                      <button
                        onClick={() => deleteScheduledMutation.mutate(msg.id)}
                        className="absolute top-2 right-2 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition"
                        title="Delete Scheduled Message"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-155/50 dark:border-slate-800/50 text-[10px] font-bold text-slate-450">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Send time: {new Date(msg.date).toLocaleString()}
                      </span>
                      <button
                        onClick={() => {
                          sendMutation.mutate({ text: msg.text || "" });
                          deleteScheduledMutation.mutate(msg.id);
                        }}
                        className="text-primary hover:underline hover:opacity-90 transition"
                      >
                        Send Now
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold">
                  No scheduled messages in this chat.
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end flex-shrink-0">
              <button
                onClick={() => setShowScheduledQueueModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  msg: MessageItem;
  chatType: string;
  isFirst: boolean;
  isLast: boolean;
  showName: boolean;
  replyText: string | null;
  isSelected: boolean;
  msgSelectionMode: boolean;
  setSelectedMsgIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setReplyTo: (msg: MessageItem | null) => void;
  setContextMenu: (menu: { x: number; y: number; msg: MessageItem } | null) => void;
  setLightboxMedia: (media: { url: string; type: "photo" | "video" } | null) => void;
  voteMutation: any;
  accountId: string;
  chatId: number;
  getApiUrl: () => string;
  t: any;
}

const MessageBubble = memo(({
  msg,
  chatType,
  isFirst,
  isLast,
  showName,
  replyText,
  isSelected,
  msgSelectionMode,
  setSelectedMsgIds,
  setReplyTo,
  setContextMenu,
  setLightboxMedia,
  voteMutation,
  accountId,
  chatId,
  getApiUrl,
  t,
}: MessageBubbleProps) => {
  if (msg.is_service) {
    return (
      <div id={`msg-${msg.id}`} className="flex justify-center my-2 select-none w-full animate-in fade-in-50 duration-150">
        <span className="px-3.5 py-1 text-[11px] bg-black/20 dark:bg-black/40 text-white/90 rounded-full font-semibold max-w-[80%] text-center break-words shadow-sm">
          {msg.service_text || msg.text}
        </span>
      </div>
    );
  }

  const isOut = msg.is_outgoing;

  return (
    <div
      id={`msg-${msg.id}`}
      className={cn(
        "flex items-center gap-2.5 w-full transition duration-150 rounded-lg",
        isFirst ? "mt-2.5" : "mt-[3px]",
        isOut ? "justify-end flex-row-reverse" : "justify-start flex-row",
        msgSelectionMode && "hover:bg-slate-100/10 cursor-pointer"
      )}
      onClick={() => {
        if (msgSelectionMode) {
          setSelectedMsgIds((prev) => {
            const next = new Set(prev);
            if (next.has(msg.id)) {
              next.delete(msg.id);
            } else {
              next.add(msg.id);
            }
            return next;
          });
        }
      }}
    >
      {msgSelectionMode && (
        <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 cursor-pointer select-none">
          <div
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition",
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-slate-350 dark:border-slate-600"
            )}
          >
            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
          </div>
        </div>
      )}
      <div
        className={cn(
          "group relative max-w-[75%] min-w-[90px] px-3.5 py-2 text-[13px] leading-relaxed shadow-[0_1px_1.5px_rgba(0,0,0,0.12)] transition-all duration-150 cursor-pointer select-none",
          isOut ? "bubble-out" : "bubble-in border border-slate-200/40 dark:border-none",
          isSelected && "ring-2 ring-primary/40",
          !isOut
            ? (isFirst && isLast ? "rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-none" :
               isFirst ? "rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-md" :
               isLast ? "rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-none" :
               "rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-md")
            : (isFirst && isLast ? "rounded-tl-2xl rounded-tr-2xl rounded-br-none rounded-bl-2xl" :
               isFirst ? "rounded-tl-2xl rounded-tr-2xl rounded-br-md rounded-bl-2xl" :
               isLast ? "rounded-tl-2xl rounded-tr-md rounded-br-none rounded-bl-2xl" :
               "rounded-tl-2xl rounded-tr-md rounded-br-md rounded-bl-2xl")
        )}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (msgSelectionMode) return;
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            msg,
          });
        }}
      >
        {isLast && !isOut && (
          <svg
            className="absolute bottom-0 -left-[5px] tail-in"
            width="9"
            height="12"
            viewBox="0 0 9 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 12C4.5 12 0 8.5 0 0V12H9Z"
              fill="currentColor"
            />
          </svg>
        )}
        {isLast && isOut && (
          <svg
            className="absolute bottom-0 -right-[5px] tail-out"
            width="9"
            height="12"
            viewBox="0 0 9 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 12C4.5 12 9 8.5 9 0V12H0Z"
              fill="currentColor"
            />
          </svg>
        )}
        {showName && msg.sender_name && (
          <p className="text-[11px] font-bold text-primary mb-1 truncate select-none">
            {msg.sender_name}
          </p>
        )}

        {msg.reply_to_msg_id && (
          <div
            className={cn(
              "flex items-center gap-1.5 mb-1.5 px-2.5 py-1 rounded-lg text-[10px] border-l-2 font-medium cursor-pointer",
              isOut
                ? "bg-black/10 border-white/60 text-white/90"
                : "bg-slate-50 border-primary/50 text-slate-500"
            )}
          >
            <Reply className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{replyText || "..."}</span>
          </div>
        )}

        {msg.media_type && (
          <div className="mb-1.5 max-w-full">
            {msg.media_type === "photo" && (
              <MessagePhoto
                messageId={msg.id}
                accountId={accountId}
                chatId={chatId}
                placeholder={msg.stripped_thumb}
                getApiUrl={getApiUrl}
                onOpenLightbox={(url) => setLightboxMedia({ url, type: "photo" })}
              />
            )}
            {msg.media_type === "video" && (
              <MessageVideo
                messageId={msg.id}
                accountId={accountId}
                chatId={chatId}
                poster={msg.stripped_thumb}
                getApiUrl={getApiUrl}
              />
            )}
            {msg.media_type === "video_note" && (
              <MessageVideoNote
                messageId={msg.id}
                accountId={accountId}
                chatId={chatId}
                getApiUrl={getApiUrl}
              />
            )}
            {msg.media_type === "voice" && (
              <MessageVoice
                messageId={msg.id}
                accountId={accountId}
                chatId={chatId}
                waveform={msg.waveform_levels || []}
                getApiUrl={getApiUrl}
                isOut={isOut}
              />
            )}
            {msg.media_type === "sticker" && (
              <MessageSticker
                messageId={msg.id}
                accountId={accountId}
                chatId={chatId}
                getApiUrl={getApiUrl}
              />
            )}
            {msg.media_type === "document" && msg.media_filename && (
              <MessageDocument
                messageId={msg.id}
                accountId={accountId}
                chatId={chatId}
                filename={msg.media_filename}
                fileSize={msg.file_size}
                getApiUrl={getApiUrl}
                isOut={isOut}
              />
            )}
            {msg.media_type === "poll" && msg.poll && (
              <div className="w-64 sm:w-72 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200/50 dark:border-none select-none text-left">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {msg.poll.is_quiz ? "Quiz" : "Anonymous Poll"}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 break-words">
                  {msg.poll.question}
                </p>
                <div className="space-y-2.5">
                  {msg.poll.options.map((opt: any, idx: number) => {
                    const percent =
                      msg.poll!.total_voters > 0
                        ? Math.round((opt.voters / msg.poll!.total_voters) * 100)
                        : 0;
                    return (
                      <button
                        key={idx}
                        disabled={msg.poll!.closed}
                        onClick={() => {
                          voteMutation.mutate({
                            messageId: msg.id,
                            options: [opt.text]
                          });
                        }}
                        className={cn(
                          "w-full relative text-left rounded-xl p-2.5 border transition text-xs font-semibold overflow-hidden group/opt flex items-center justify-between",
                          opt.chosen
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-white dark:bg-[#202b36] border-slate-250 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                        )}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/5 dark:bg-primary/10 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                        <span className="relative z-10 flex-1 truncate pr-2">
                          {opt.text}
                        </span>
                        <span className="relative z-10 text-[10px] font-bold text-slate-400 dark:text-slate-500 flex-shrink-0">
                          {percent}% ({opt.voters})
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-[10px] text-slate-400 font-bold">
                  {msg.poll.total_voters} votes
                </div>
              </div>
            )}
          </div>
        )}

        {msg.text && (
          <p className="whitespace-pre-wrap break-words text-[14px]">
            {renderFormattedText(msg.text)}
          </p>
        )}

        <div
          className={cn(
            "flex items-center gap-1.5 mt-1 select-none",
            isOut ? "justify-end" : "justify-between"
          )}
        >
          {!isOut && (
            <button
              onClick={() => setReplyTo(msg)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              title={t("chats.reply")}
            >
              <Reply className="h-3 w-3" />
            </button>
          )}

          <div className="flex items-center gap-1">
            <span
              className={cn(
                "text-[9px] font-medium tracking-wide",
                isOut ? "text-primary-100/90" : "text-slate-400"
              )}
            >
              {new Date(msg.date).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>

            {isOut && (
              <svg
                className="h-3.5 w-3.5 text-primary-100/90"
                viewBox="0 0 16 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1.5 7.5L5.5 11.5L14.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.5 7.5L9.5 11.5L14.5 6.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
