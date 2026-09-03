export { getChatPhotoUrl, getTelegramAvatarColor } from "@/lib/avatar";
import { getTelegramAvatarColor } from "@/lib/avatar";

import {
  Image,
  Video,
  FileText,
  Mic,
  MessageSquare,
  Paperclip,
  BarChart3,
  Link2,
  MapPin,
  Phone,
} from "lucide-react";

export function getAvatarGradient(peerId: number, colorId?: number | null): string {
  return getTelegramAvatarColor(peerId, colorId);
}

export const MEDIA_ICONS: Record<string, any> = {
  photo: Image,
  video: Video,
  document: FileText,
  voice: Mic,
  audio: Mic,
  sticker: MessageSquare,
  animation: Video,
  location: MapPin,
  contact: Phone,
  poll: BarChart3,
  link: Link2,
  video_note: Video,
  other: Paperclip,
};

import React from "react";
import Icons from "./Icons";
import { cn } from "@/lib/utils";
import { getSessionToken } from "@/lib/api";

export function TgIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const hex = (Icons as Record<string, string>)[name];
  if (!hex) return null;
  const char = String.fromCharCode(parseInt(hex, 16));
  return React.createElement("span", { className: cn("tgico select-none", className), style }, char);
}

/**
 * Returns a query string `?token=xxx` with the current session token,
 * so that `<img src>` / `<video src>` / `<audio src>` can authenticate
 * against backend endpoints that require auth.
 */
export function getAuthParam(): string {
  const t = getSessionToken();
  return t ? `?token=${encodeURIComponent(t)}` : "";
}
