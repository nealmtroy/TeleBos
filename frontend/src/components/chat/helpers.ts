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

export function getAvatarGradient(peerId: number) {
  const colors = [
    "from-red-400 to-red-600",
    "from-orange-400 to-orange-600",
    "from-amber-400 to-amber-600",
    "from-green-400 to-green-600",
    "from-teal-400 to-teal-600",
    "from-blue-400 to-blue-600",
    "from-violet-400 to-violet-600",
    "from-pink-400 to-pink-600",
  ];
  const idx = Math.abs(peerId) % colors.length;
  return colors[idx];
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
