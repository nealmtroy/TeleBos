"use client";

import { useState, useCallback } from "react";
import { getPhotoUrl } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";

interface AccountAvatarProps {
  accountId: string;
  firstName?: string | null;
  phone?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-sm",
};

const fallbackSizeMap = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

function getInitial(firstName?: string | null, phone?: string | null): string {
  if (firstName) return firstName[0].toUpperCase();
  if (phone) return phone.slice(-1).toUpperCase();
  return "T";
}

export function AccountAvatar({
  accountId,
  firstName,
  phone,
  size = "md",
  className,
}: AccountAvatarProps) {
  const [error, setError] = useState(false);
  const photoUrl = getPhotoUrl(accountId);
  const initial = getInitial(firstName, phone);

  return (
    <div
      className={cn(
        "rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700 flex-shrink-0 overflow-hidden",
        sizeMap[size],
        className
      )}
    >
      {error ? (
        <span className={fallbackSizeMap[size]}>{initial}</span>
      ) : (
        <img
          src={photoUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}
