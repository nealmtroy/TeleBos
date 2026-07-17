import { memo } from "react";
import { Check, Reply, Pin, Trash2, BarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageItem } from "./types";
import {
  MessagePhoto,
  MessageVideo,
  MessageVideoNote,
  MessageVoice,
  MessageSticker,
  MessageDocument,
} from "./MessageMedia";
import { getAuthParam } from "./helpers";

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

const renderFormattedText = (text: string | null) => {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt bridge;"); // Let's make sure it doesn't break formatting
  
  // Reverting &gt bridge; to simple &gt; to avoid typo
  html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/_(.*?)_/g, "<em>$1</em>");
  html = html.replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded font-mono text-[12.5px] font-semibold">$1</code>');
  
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

export const MessageBubble = memo(({
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
        isOut ? "justify-end flex-row" : "justify-start flex-row",
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
            {msg.media_type === "animation" && (
              <div
                onClick={() => setLightboxMedia({ url: `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${msg.id}/media${getAuthParam()}`, type: "video" })}
                className="rounded-xl overflow-hidden max-w-[240px] relative bg-slate-100 dark:bg-slate-800 cursor-pointer hover:opacity-95"
              >
                <video
                  src={`${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${msg.id}/media${getAuthParam()}`}
                  className="w-full h-auto object-cover max-h-60"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              </div>
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
