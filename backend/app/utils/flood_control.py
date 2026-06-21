"""Adaptive flood control that increases delays when flood errors occur.

Entries for accounts that have been inactive (no flood events) for more than
STALE_TIMEOUT seconds are automatically cleaned up to prevent unbounded memory
growth.
"""

from dataclasses import dataclass, field
from collections import defaultdict
import time


STALE_TIMEOUT = 3600  # 1 hour — entries older than this are pruned
_CLEANUP_INTERVAL = 300  # Only check for stale entries every 5 min


@dataclass
class AccountFloodState:
    consecutive_floods: int = 0
    base_delay: float = 5.0  # seconds
    current_delay: float = 5.0
    last_flood_time: float = 0.0
    cooldown_until: float = 0.0
    _last_activity: float = field(default_factory=time.time)


class FloodController:
    """Tracks flood events per account and computes safe delays."""

    MULTIPLIER: float = 1.5
    MAX_DELAY: float = 300.0  # 5 minutes
    COOLDOWN_AFTER_FLOOD: float = 60.0  # pause after flood

    def __init__(self) -> None:
        self._accounts: dict[str, AccountFloodState] = defaultdict(AccountFloodState)
        self._last_cleanup: float = 0.0

    def record_flood(self, account_id: str, wait_seconds: float) -> None:
        """Record a flood event and escalate delay."""
        self._maybe_cleanup()
        state = self._accounts[account_id]
        state.consecutive_floods += 1
        state.last_flood_time = time.time()
        state.cooldown_until = time.time() + max(wait_seconds, self.COOLDOWN_AFTER_FLOOD)
        state.current_delay = min(
            state.current_delay * self.MULTIPLIER, self.MAX_DELAY
        )
        state._last_activity = time.time()

    def record_success(self, account_id: str) -> None:
        """Gradually reduce delay on success."""
        self._maybe_cleanup()
        state = self._accounts[account_id]
        state._last_activity = time.time()
        if state.consecutive_floods > 0:
            state.consecutive_floods = max(0, state.consecutive_floods - 1)
            if state.consecutive_floods == 0:
                state.current_delay = state.base_delay

    def get_delay(self, account_id: str) -> float:
        """Return the current safe delay for this account."""
        self._maybe_cleanup()
        state = self._accounts[account_id]
        state._last_activity = time.time()
        remaining = state.cooldown_until - time.time()
        if remaining > 0:
            return max(remaining, state.current_delay)
        return state.current_delay

    def reset(self, account_id: str) -> None:
        """Remove a specific account from flood tracking."""
        self._accounts.pop(account_id, None)

    def cleanup_stale(self) -> int:
        """Remove entries that haven't been touched in STALE_TIMEOUT seconds.

        Returns the number of entries removed.
        """
        now = time.time()
        stale_keys = [
            k for k, v in self._accounts.items()
            if now - v._last_activity > STALE_TIMEOUT
        ]
        for k in stale_keys:
            del self._accounts[k]
        if stale_keys:
            import logging
            logging.getLogger(__name__).debug(
                "Cleaned up %d stale flood controller entries", len(stale_keys)
            )
        return len(stale_keys)

    def _maybe_cleanup(self) -> None:
        """Periodically prune stale entries (throttled)."""
        now = time.time()
        if now - self._last_cleanup > _CLEANUP_INTERVAL:
            self._last_cleanup = now
            self.cleanup_stale()


flood_controller = FloodController()
