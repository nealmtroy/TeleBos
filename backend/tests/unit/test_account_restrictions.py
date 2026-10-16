"""Coverage for the distinct account-restriction state (frozen / limited / banned).

A frozen or spam-limited account must be held out of job rotation without being
deleted or flipped to ``is_active=False`` — that is reserved for dead sessions.
These tests pin the helper semantics plus the two integration points that matter
most: a frozen join is not pointlessly retried, and a restricted account cannot
start a new broadcast.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.utils.account_restrictions import (
    RESTRICTED_FROZEN,
    RESTRICTED_LIMITED,
    clear_account_restriction,
    is_account_restricted,
    mark_account_restricted,
)


def _acct(**kw):
    base = dict(
        restriction_status=None,
        restriction_until=None,
        restriction_detail=None,
        spam_status="normal",
        spam_detail=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_plain_account_is_not_restricted():
    assert is_account_restricted(_acct()) is False


def test_magicmock_account_is_not_treated_as_restricted():
    """Existing tests build accounts from bare MagicMocks; those must not be
    read as restricted (attribute access returns truthy mocks)."""
    assert is_account_restricted(MagicMock()) is False


def test_spam_limited_flag_restricts_account():
    assert is_account_restricted(_acct(spam_status="limited")) is True


def test_mark_frozen_sets_distinct_state_and_blocks():
    acc = _acct()
    mark_account_restricted(acc, RESTRICTED_FROZEN, detail="frozen accounts", now=datetime.now(timezone.utc))
    assert acc.restriction_status == RESTRICTED_FROZEN
    assert acc.restriction_detail == "frozen accounts"
    assert acc.restriction_until is not None
    # A frozen method is NOT a spam status — it must not touch spam_status.
    assert acc.spam_status == "normal"
    assert is_account_restricted(acc) is True


def test_mark_limited_also_flags_spam_status():
    acc = _acct()
    mark_account_restricted(acc, RESTRICTED_LIMITED, detail="limited", now=datetime.now(timezone.utc))
    assert acc.restriction_status == RESTRICTED_LIMITED
    assert acc.spam_status == "limited"
    assert is_account_restricted(acc) is True


def test_restriction_expires_after_cooldown():
    now = datetime.now(timezone.utc)
    acc = _acct()
    mark_account_restricted(acc, RESTRICTED_FROZEN, now=now, cooldown_seconds=60)
    assert is_account_restricted(acc, now=now + timedelta(seconds=30)) is True
    assert is_account_restricted(acc, now=now + timedelta(seconds=61)) is False


def test_clear_restriction_resets_state():
    acc = _acct()
    mark_account_restricted(acc, RESTRICTED_FROZEN)
    clear_account_restriction(acc)
    assert acc.restriction_status is None
    assert acc.restriction_until is None
    assert is_account_restricted(acc) is False


@pytest.mark.asyncio
async def test_frozen_join_is_not_retried():
    """FROZEN_METHOD_INVALID must propagate immediately, not spin a retry."""
    from telethon.errors import FrozenMethodInvalidError

    from app.utils import telethon_helpers as th

    class _Client:
        def __init__(self):
            self.join_calls = 0

        async def get_entity(self, key):
            return MagicMock()

        async def __call__(self, request):
            self.join_calls += 1
            raise FrozenMethodInvalidError(request=None)

    client = _Client()
    with pytest.raises(FrozenMethodInvalidError):
        await th.join_and_resolve_chat(client, "https://t.me/zotangacor")

    # One attempt only: the generic "retry once" branch must not swallow a freeze.
    assert client.join_calls == 1


@pytest.mark.asyncio
async def test_start_broadcast_rejects_restricted_account():
    from app.services.broadcast_service import start_broadcast

    mock_db = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = uuid4()
    mock_user.role = "pro"
    mock_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    acc = MagicMock()
    acc.id = uuid4()
    acc.first_name = "Alennaa"
    acc.phone = "6283838491151"
    acc.is_active = True
    acc.for_sale = False
    acc.restriction_status = RESTRICTED_FROZEN
    acc.restriction_until = datetime.now(timezone.utc) + timedelta(hours=6)
    acc.restriction_detail = "frozen accounts"
    acc.spam_status = "normal"

    with patch("app.services.account_service.get_account", AsyncMock(return_value=acc)), patch(
        "app.services.redeem_service.is_subscription_active", return_value=True
    ):
        with pytest.raises(ValueError, match="dibatasi Telegram"):
            await start_broadcast(
                db=mock_db,
                user=mock_user,
                account_ids=[str(acc.id)],
                group_list_id=str(uuid4()),
                text_list_id=None,
                mode="single_text",
                custom_text="hi",
                delay_per_group=1,
                delay_after_all=0,
            )
