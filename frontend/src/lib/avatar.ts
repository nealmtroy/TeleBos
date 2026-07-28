const TELEGRAM_AVATAR_COLORS = [
  "#D45246",
  "#F68136",
  "#6C61DF",
  "#46BA43",
  "#28C9B7",
  "#408ACF",
  "#D95574",
] as const;

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export function getAccountPhotoUrl(accountId: string, version?: number | null) {
  return `${baseUrl}/accounts/${accountId}/photo?v=${version ?? 0}`;
}

export function getChatPhotoUrl(
  accountId: string,
  chatId: number,
  version?: number | null,
) {
  return `${baseUrl}/accounts/${accountId}/chats/${chatId}/photo?v=${version ?? 0}`;
}

export function getTelegramAvatarColor(
  stableId: string | number,
  colorId?: number | null,
) {
  const value = colorId ?? stableHash(String(stableId));
  return TELEGRAM_AVATAR_COLORS[Math.abs(value) % TELEGRAM_AVATAR_COLORS.length];
}

export function getAvatarInitial(
  firstName?: string | null,
  fallback?: string | null,
) {
  return (firstName || fallback || "T").trim().charAt(0).toUpperCase() || "T";
}

function stableHash(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return hash;
}
