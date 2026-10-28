/**
 * Short-lived media tokens for <img>/<video>/<audio>/<source> URLs.
 *
 * Browsers cannot attach an Authorization header to those tags, so the
 * credential has to travel in the URL. Passing the full Better Auth session
 * there leaks it into access logs, browser history and Referer headers — a
 * single log line would hand over a full account takeover. So instead the
 * backend mints a 5-minute HMAC token scoped to one account, and that is what
 * goes into the URL as `?t=`.
 *
 * Tokens are cached per account for slightly less than their TTL so a URL
 * built at the edge of its life is not used after it expires. Views call
 * `prefetchMediaTokens(accountIds)` while rendering a list; the synchronous
 * `getAuthParam(accountId)` then reads from that cache. Before a token lands
 * the URL is emitted without one and the backend falls back to the cookie.
 */

import api from "@/lib/api";

const TOKEN_TTL_MS = 5 * 60 * 1000;
// Refresh a little early so a URL built from the cache never races expiry.
const CACHE_TTL_MS = TOKEN_TTL_MS - 30 * 1000;

type TokenCacheEntry = { token: string; expiresAt: number };

const cache = new Map<string, TokenCacheEntry>();
const pendingIds = new Set<string>();
let flushScheduled = false;

function scheduleBatchFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;

  queueMicrotask(async () => {
    flushScheduled = false;
    const idsToFetch = Array.from(pendingIds);
    pendingIds.clear();
    if (idsToFetch.length === 0) return;

    try {
      const { data } = await api.post<{
        tokens: Record<string, string>;
        expires_in: number;
      }>("/accounts/media-tokens", { account_ids: idsToFetch });

      const ttlMs = (data.expires_in ?? 300) * 1000;
      const expiresAt = Date.now() + Math.min(ttlMs, CACHE_TTL_MS);
      const tokens = data.tokens ?? {};
      for (const [accId, token] of Object.entries(tokens)) {
        if (token) {
          cache.set(accId, { token, expiresAt });
        }
      }
    } catch {
      // Fallback to single endpoint if batch endpoint is unavailable
      await Promise.allSettled(
        idsToFetch.map(async (accountId) => {
          try {
            const { data } = await api.get<{ token: string; expires_in: number }>(
              `/accounts/${accountId}/media-token`
            );
            const ttlMs = (data.expires_in ?? 300) * 1000;
            cache.set(accountId, {
              token: data.token,
              expiresAt: Date.now() + Math.min(ttlMs, CACHE_TTL_MS),
            });
          } catch {
            // Ignore; falls back to cookie auth and retries on next prefetch.
          }
        })
      );
    }
  });
}

function ensureToken(accountId: string): void {
  if (!accountId) return;
  const now = Date.now();
  const hit = cache.get(accountId);
  if (hit && hit.expiresAt > now) return;
  if (pendingIds.has(accountId)) return;

  pendingIds.add(accountId);
  scheduleBatchFlush();
}

/** Warm the token cache for a set of accounts before building their URLs. */
export function prefetchMediaTokens(
  accountIds: Array<string | undefined | null>
): void {
  for (const id of accountIds) {
    if (id) ensureToken(id);
  }
}

/** Synchronous read of the cached media token query string, or "" if absent. */
export function getAuthParam(accountId?: string | null): string {
  if (!accountId) return "";
  const hit = cache.get(accountId);
  if (!hit || hit.expiresAt <= Date.now()) {
    // Not ready yet — kick off a fetch for the next render, emit no token now.
    ensureToken(accountId);
    return "";
  }
  return `?t=${encodeURIComponent(hit.token)}`;
}

export function clearMediaTokenCache(): void {
  cache.clear();
}
