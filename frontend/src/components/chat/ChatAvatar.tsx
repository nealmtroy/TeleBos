"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getAccountPhotoUrl, getChatPhotoUrl, getAvatarInitial } from "@/lib/avatar";
import { Bookmark, ShieldCheck, Bot } from "lucide-react";

// Telegram-style avatar color palette (matching tweb)
const AVATAR_COLORS = [
  { top: "#FF845E", bottom: "#D45246" }, // red
  { top: "#FEBB5B", bottom: "#F68136" }, // orange
  { top: "#B694F9", bottom: "#6C61DF" }, // violet
  { top: "#9AD164", bottom: "#46BA43" }, // green
  { top: "#53EDD6", bottom: "#28C9B7" }, // cyan
  { top: "#5CAFFA", bottom: "#408ACF" }, // blue
  { top: "#FF8AAC", bottom: "#D95574" }, // pink
];

interface ChatAvatarProps {
  accountId: string;
  chatId?: number | null; // If absent, renders the account's own avatar
  chatTitle?: string | null;
  chatType?: string | null;
  colorId?: number | null;
  photoVersion?: number | null;
  hasProfilePhoto?: boolean;
  sizeClassName?: string; // e.g. "w-10 h-10" or "w-11 h-11"
  className?: string;
  isSavedMessages?: boolean;
  isTelegram?: boolean;
  fallbackTextClassName?: string;
  children?: React.ReactNode;
}

export function ChatAvatar({
  accountId,
  chatId,
  chatTitle,
  chatType,
  colorId,
  photoVersion,
  hasProfilePhoto,
  sizeClassName = "w-10 h-10",
  className,
  isSavedMessages,
  isTelegram,
  fallbackTextClassName,
  children,
}: ChatAvatarProps) {
  const isAccount = chatId === undefined || chatId === null;

  // Determine photo URL
  const photoUrl = isAccount
    ? getAccountPhotoUrl(accountId, photoVersion)
    : getChatPhotoUrl(accountId, chatId, photoVersion);

  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Check if image should be loaded
  const shouldRenderImage = isAccount
    ? (hasProfilePhoto ?? (photoVersion ?? 0) > 0)
    : (photoVersion != null);

  const showFallback = !shouldRenderImage || failedUrl === photoUrl;

  useEffect(() => {
    setFailedUrl(null);
  }, [photoUrl]);

  // Determine fallback initials
  const initial = getAvatarInitial(chatTitle, "?");

  // Determine gradient color based on chatId or colorId
  const isBot = chatType === "bot" || (chatTitle?.toLowerCase().endsWith("bot") ?? false);
  const isGroup = chatType === "group" || chatType === "supergroup";
  const isChannel = chatType === "channel";

  let gradient = AVATAR_COLORS[Math.abs(colorId ?? (chatId ?? 0)) % AVATAR_COLORS.length];
  if (isSavedMessages || isTelegram) {
    gradient = AVATAR_COLORS[5]; // Blue
  } else if (isBot) {
    gradient = AVATAR_COLORS[1]; // Orange
  } else if (isGroup) {
    gradient = AVATAR_COLORS[3]; // Green
  } else if (isChannel) {
    gradient = AVATAR_COLORS[2]; // Violet
  }

  return (
    <div
      className={cn(
        "rounded-full flex-shrink-0 relative overflow-hidden flex items-center justify-center font-bold text-white select-none",
        sizeClassName,
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${gradient.top}, ${gradient.bottom})`,
      }}
    >
      {!showFallback && (
        <img
          src={photoUrl}
          onError={() => setFailedUrl(photoUrl)}
          className="w-full h-full object-cover rounded-full absolute inset-0"
          alt=""
        />
      )}
      {showFallback && (
        <span className={cn("flex items-center justify-center w-full h-full text-sm", fallbackTextClassName)}>
          {isSavedMessages ? (
            <Bookmark className="w-1/2 h-1/2 text-white" />
          ) : isTelegram ? (
            <ShieldCheck className="w-1/2 h-1/2 text-white" />
          ) : isBot ? (
            <Bot className="w-1/2 h-1/2 text-white" />
          ) : (
            initial
          )}
        </span>
      )}
      {children}
    </div>
  );
}
