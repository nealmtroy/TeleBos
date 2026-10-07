"use client";

import { cn } from "@/lib/utils";
import {
  getAccountPhotoUrl,
  getChatPhotoUrl,
  getAvatarInitial,
  getTelegramAvatarColor,
} from "@/lib/avatar";
import { Bookmark, ShieldCheck, Bot } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

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
  /** Own-account avatars: mirrors AccountAvatar's expired-account 404 guard. */
  isActive?: boolean;
  profilePhotoPath?: string | null;
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
  isActive,
  profilePhotoPath,
  fallbackTextClassName,
  children,
}: ChatAvatarProps) {
  const isAccount = chatId === undefined || chatId === null;

  // Determine photo URL
  const photoUrl = isAccount
    ? getAccountPhotoUrl(accountId, photoVersion)
    : getChatPhotoUrl(accountId, chatId, photoVersion);

  // An inactive/expired account with no cached photo can't be fetched
  // on demand, so skip the request rather than take a 404 in the console.
  const isPhotoCached = !!profilePhotoPath;
  const isImageLoadable = !isAccount || isActive !== false || isPhotoCached;

  const shouldRenderImage =
    (isAccount ? (hasProfilePhoto ?? (photoVersion ?? 0) > 0) : photoVersion != null) &&
    isImageLoadable;

  // Determine fallback initials
  const initial = getAvatarInitial(chatTitle, "?");

  const isBot = chatType === "bot" || (chatTitle?.toLowerCase().endsWith("bot") ?? false);
  const isGroup = chatType === "group" || chatType === "supergroup";
  const isChannel = chatType === "channel";

  // Shared flat palette from lib/avatar — the same colors AccountAvatar uses.
  let backgroundColor = getTelegramAvatarColor(chatId ?? accountId, colorId);
  if (isSavedMessages || isTelegram) {
    backgroundColor = "#408ACF"; // Blue
  } else if (isBot) {
    backgroundColor = "#F68136"; // Orange
  } else if (isGroup) {
    backgroundColor = "#46BA43"; // Green
  } else if (isChannel) {
    backgroundColor = "#6C61DF"; // Violet
  }

  return (
    <Avatar
      className={cn(
        "rounded-full flex-shrink-0 relative overflow-hidden flex items-center justify-center font-bold text-white select-none",
        sizeClassName,
        className
      )}
      style={{ backgroundColor }}
    >
      {shouldRenderImage && (
        <AvatarImage
          src={photoUrl}
          className="w-full h-full object-cover rounded-full absolute inset-0"
          alt={chatTitle || ""}
        />
      )}
      <AvatarFallback
        className={cn(
          "flex items-center justify-center w-full h-full text-sm font-bold text-white",
          fallbackTextClassName
        )}
        style={{ backgroundColor: "transparent" }}
      >
        {isSavedMessages ? (
          <Bookmark className="w-1/2 h-1/2 text-white" />
        ) : isTelegram ? (
          <ShieldCheck className="w-1/2 h-1/2 text-white" />
        ) : isBot ? (
          <Bot className="w-1/2 h-1/2 text-white" />
        ) : (
          initial
        )}
      </AvatarFallback>
      {children}
    </Avatar>
  );
}
