"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getTelegramAvatarColor } from "@/lib/avatar";

export interface UserAvatarProps {
  user?: {
    id?: string | null;
    full_name?: string | null;
    email?: string | null;
    image?: string | null;
    avatar_url?: string | null;
  } | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}

const SIZE_MAP: Record<"xs" | "sm" | "md" | "lg" | "xl", { box: string; text: string; px: number }> = {
  xs: { box: "h-6 w-6", text: "text-[10px]", px: 24 },
  sm: { box: "h-8 w-8", text: "text-[11px]", px: 32 },
  md: { box: "h-9 w-9", text: "text-xs", px: 36 },
  lg: { box: "h-11 w-11", text: "text-sm", px: 44 },
  xl: { box: "h-14 w-14", text: "text-base", px: 56 },
};

/**
 * Generate 1 or 2 uppercase initials from full name or email.
 */
export function getUserInitials(name?: string | null, email?: string | null): string {
  const cleanName = (name ?? "").trim();
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }
  const cleanEmail = (email ?? "").trim();
  if (cleanEmail) {
    return cleanEmail.slice(0, 2).toUpperCase();
  }
  return "U";
}

/**
 * Unified UserAvatar component used across Navbar, Sidebar, Settings, and Account menus.
 * Renders avatar image if available, otherwise deterministic Telegram-styled initials.
 */
export function UserAvatar({
  user,
  size = "md",
  className,
  fallbackClassName,
  alt,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const sizeConfig = typeof size === "string" ? SIZE_MAP[size] ?? SIZE_MAP.md : null;
  const customStyle = typeof size === "number" ? { width: size, height: size } : undefined;

  const imageUrl = !imageError ? (user?.image || user?.avatar_url || null) : null;
  const initials = getUserInitials(user?.full_name, user?.email);
  const stableKey = user?.email || user?.id || user?.full_name || "user";
  const avatarBg = getTelegramAvatarColor(stableKey);
  const displayName = user?.full_name || user?.email || "User Avatar";

  return (
    <div
      style={customStyle}
      className={cn(
        "relative shrink-0 rounded-full select-none overflow-hidden flex items-center justify-center font-semibold tracking-wider transition-all duration-200",
        sizeConfig?.box,
        className
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={alt || displayName}
          className="h-full w-full object-cover rounded-[inherit]"
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          style={{ backgroundColor: avatarBg }}
          className={cn(
            "h-full w-full rounded-[inherit] flex items-center justify-center text-white font-semibold shadow-inner",
            sizeConfig?.text,
            fallbackClassName
          )}
        >
          <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">{initials}</span>
        </div>
      )}
    </div>
  );
}
