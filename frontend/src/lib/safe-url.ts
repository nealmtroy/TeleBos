/**
 * Return `url` only when it is a plain http(s) URL, otherwise `undefined`.
 *
 * Guards `href` attributes against `javascript:`, `data:` and other executable
 * schemes when the value originates from untrusted content (chat messages,
 * Telegram metadata, etc.). React escapes attribute values but does not block
 * dangerous schemes.
 */
export function safeHttpUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}
