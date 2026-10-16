/**
 * Client-side mirror of the backend SMM target validator
 * (`backend/app/utils/telegram_target.py`).
 *
 * A target is a Telegram link, `@username`, bare username, or numeric id.
 * Keeping arbitrary text out here gives the user a clear inline error before the
 * request is sent; the backend re-validates as the source of truth.
 */

const MAX_TARGET_LENGTH = 500;
const TME_LINK_RE = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/=?.&-]+$/;
const USERNAME_RE = /^@?[A-Za-z][A-Za-z0-9_]{2,63}$/;
const NUMERIC_ID_RE = /^-?\d{1,20}$/;

export function isValidTelegramTarget(value: string | null | undefined): boolean {
  const target = (value ?? "").trim();
  if (!target || target.length > MAX_TARGET_LENGTH) return false;
  if (/[<>"'`\\]/.test(target) || /[\u0000-\u001f]/.test(target)) return false;
  return TME_LINK_RE.test(target) || USERNAME_RE.test(target) || NUMERIC_ID_RE.test(target);
}
