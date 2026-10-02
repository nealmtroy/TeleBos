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

export function TgIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const hex = (Icons as Record<string, string>)[name];
  if (!hex) return null;
  const char = String.fromCharCode(parseInt(hex, 16));
  return React.createElement("span", { className: cn("tgico select-none", className), style }, char);
}

/**
 * Media URLs for <img>/<video>/<audio> need their credential in the query string,
 * because those tags cannot send an Authorization header.
 *
 * This used to be the full Better Auth session token as `?token=...`, which
 * leaks it into access logs, browser history and Referer headers. It is now a
 * short-lived HMAC media token scoped to one account, minted by the backend and
 * cached client-side. See `@/lib/media-token`.
 *
 * `prefetchMediaTokens` should be called while rendering a list so the tokens
 * are cached by the time the URLs are built; `getAuthParam` is a synchronous
 * cache read.
 */
export { getAuthParam, prefetchMediaTokens } from "@/lib/media-token";
