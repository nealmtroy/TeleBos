"""Distinct health state for accounts restricted by Telegram.

An account can be *restricted* by Telegram without its session being dead:

* ``frozen`` — Telegram froze specific methods for this account
  (``FROZEN_METHOD_INVALID``, e.g. joins). Temporary; usually lifts after a few
  hours.
* ``limited`` — the account is spam-limited (confirmed via @SpamBot). It cannot
  post/invite to supergroups/channels until Telegram lifts the limit.
* ``banned`` — the account is banned from a channel/group chain that Telegram
  reports as a hard account-level restriction.

These accounts must NOT be deleted or flipped to ``is_active=False`` — that is
reserved for genuinely dead sessions (revoked auth key, deactivated user). A
restricted account is instead held out of job rotation for a cooldown window so
it can recover on its own, and the running job keeps going with its other
accounts (or pauses if none remain).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

RESTRICTED_FROZEN = "frozen"
RESTRICTED_LIMITED = "limited"
RESTRICTED_BANNED = "banned"

# Frozen methods usually lift within hours; hold the account out for six.
FROZEN_COOLDOWN_SECONDS = 6 * 3600
# A spam-limited account stays out until a fresh @SpamBot check clears it; the
# cooldown only gates the *runtime* retry, the periodic checker is authoritative.
LIMITED_COOLDOWN_SECONDS = 12 * 3600
BANNED_COOLDOWN_SECONDS = 24 * 3600

# Classifications returned by ``classify_telegram_error`` that describe an
# account-level restriction rather than a per-target failure.
RESTRICTION_ERROR_TYPES = frozenset({"account_frozen", "spam_restricted"})


def _as_utc(value: datetime | None) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def is_account_restricted(account, now: datetime | None = None) -> bool:
    """Whether this account is currently held out of jobs.

    A set ``restriction_status`` blocks the account until ``restriction_until``
    elapses (or forever when no expiry is stored). A raw ``spam_status ==
    "limited"`` set by the periodic SpamBot checker also blocks it, so an
    account flagged outside a job is never reused either.
    """
    now = now or datetime.now(timezone.utc)
    status = getattr(account, "restriction_status", None)
    if isinstance(status, str) and status:
        until = _as_utc(getattr(account, "restriction_until", None))
        if until is None:
            return True
        return until > now
    spam = getattr(account, "spam_status", None)
    if isinstance(spam, str) and spam.lower() == "limited":
        return True
    return False


def mark_account_restricted(
    account,
    status: str,
    detail: str | None = None,
    cooldown_seconds: int | None = None,
    now: datetime | None = None,
) -> None:
    """Record an account-level restriction without deactivating the account."""
    now = now or datetime.now(timezone.utc)
    if cooldown_seconds is None:
        cooldown_seconds = {
            RESTRICTED_FROZEN: FROZEN_COOLDOWN_SECONDS,
            RESTRICTED_LIMITED: LIMITED_COOLDOWN_SECONDS,
            RESTRICTED_BANNED: BANNED_COOLDOWN_SECONDS,
        }.get(status, FROZEN_COOLDOWN_SECONDS)

    account.restriction_status = status
    account.restriction_detail = detail
    account.restriction_until = now + timedelta(seconds=cooldown_seconds)

    # Keep the legacy SpamBot flag coherent for the UI when the restriction is
    # a spam limit; a frozen method is a separate condition and leaves it alone.
    if status == RESTRICTED_LIMITED:
        account.spam_status = "limited"
        if detail:
            account.spam_detail = detail
    account.updated_at = now


def clear_account_restriction(account) -> None:
    """Lift a restriction once the account recovers."""
    account.restriction_status = None
    account.restriction_detail = None
    account.restriction_until = None
