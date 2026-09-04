"use client";

import React, { memo, useState, useEffect, useRef } from "react";
import { connectChatSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

export interface ChatHeaderSubtitleProps {
  accountId: string | null;
  chatId: number;
  chatType?: string;
  onlineStatus?: string | null;
}

/**
 * Isolated subtitle component for chat header (REN-02).
 * Listens for typing WebSocket events independently to prevent
 * triggering full-tree re-renders of the MessagePane and message bubbles.
 */
export const ChatHeaderSubtitle = memo(function ChatHeaderSubtitle({
  accountId,
  chatId,
  chatType,
  onlineStatus,
}: ChatHeaderSubtitleProps) {
  const [typingStatus, setTypingStatus] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    setTypingStatus(null);
    if (!accountId) return;

    const ws = connectChatSocket(accountId);
    const handleTyping = (data: any) => {
      if (data && data.chat_id === chatId) {
        setTypingStatus(`${data.action || "typing"}...`.replace("_", " "));
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setTypingStatus(null);
        }, 4000);
      }
    };

    ws.on("typing", handleTyping);
    return () => {
      ws.off("typing", handleTyping);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [accountId, chatId]);

  return (
    <p className="text-xs font-medium truncate leading-tight mt-0.5">
      {typingStatus ? (
        <span className="text-primary dark:text-blue-400 font-semibold animate-pulse">
          {typingStatus}
        </span>
      ) : chatType === "bot" ? (
        <span className="text-slate-400 dark:text-slate-500 font-semibold">bot</span>
      ) : chatType === "group" || chatType === "supergroup" ? (
        <span className="text-slate-400 dark:text-slate-500 capitalize">{chatType}</span>
      ) : chatType === "channel" ? (
        <span className="text-slate-400 dark:text-slate-500 capitalize">channel</span>
      ) : onlineStatus ? (
        <span
          className={cn(
            "capitalize",
            onlineStatus.includes("Online") || onlineStatus.includes("online")
              ? "text-green-600 dark:text-green-400 font-bold"
              : "text-slate-400 dark:text-slate-500"
          )}
        >
          {onlineStatus.replace("UserStatus", "").toLowerCase()}
        </span>
      ) : (
        <span className="text-slate-400 dark:text-slate-500 capitalize">
          {chatType || "user"}
        </span>
      )}
    </p>
  );
});
