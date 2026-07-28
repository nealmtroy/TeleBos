"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getAccountPhotoUrl,
  getAvatarInitial,
  getTelegramAvatarColor,
} from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface AccountAvatarProps {
  accountId: string;
  telegramId?: number | null;
  firstName?: string | null;
  phone?: string | null;
  colorId?: number | null;
  hasProfilePhoto?: boolean;
  photoVersion?: number | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-12 text-sm",
};

const fallbackSizeMap = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

export function AccountAvatar({
  accountId,
  telegramId,
  firstName,
  phone,
  colorId,
  hasProfilePhoto,
  photoVersion,
  size = "md",
  className,
}: AccountAvatarProps) {
  const photoUrl = getAccountPhotoUrl(accountId, photoVersion);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const shouldRenderImage = hasProfilePhoto ?? (photoVersion ?? 0) > 0;
  const showFallback = !shouldRenderImage || failedUrl === photoUrl;
  const initial = getAvatarInitial(firstName, phone);
  const backgroundColor = getTelegramAvatarColor(telegramId ?? accountId, colorId);

  useEffect(() => {
    setFailedUrl(null);
  }, [photoUrl]);

  return (
    <Avatar
      size={size === "sm" ? "sm" : size === "lg" || size === "xl" ? "lg" : "default"}
      className={cn("shrink-0 overflow-hidden font-bold text-white", sizeMap[size], className)}
      style={{ backgroundColor }}
    >
      {!showFallback && (
        <AvatarImage
          src={photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(photoUrl)}
        />
      )}
      <AvatarFallback
        className={cn("bg-transparent font-bold text-white", fallbackSizeMap[size])}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
