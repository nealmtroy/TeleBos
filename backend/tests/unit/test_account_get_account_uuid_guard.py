"""Guard against a non-UUID account id reaching Postgres.

``GET /api/v1/accounts/marketplace`` hit ``GET /accounts/{account_id}`` because
no literal ``/accounts/marketplace`` route exists. ``account_id`` was typed
``str`` and passed straight into the query, so asyncpg tried to encode
``"marketplace"`` into a ``uuid`` bind parameter and raised::

    ValueError: invalid UUID 'marketplace': length must be between 32..36
    characters, got 11

That escaped as an unhandled 500 instead of a clean 404 (production log
2026-11-08, backend-1, one occurrence in 24h).

``account_service.get_account`` now rejects a malformed id before it reaches
the database.
"""

import uuid

import pytest
from sqlalchemy.exc import StatementError

from app.services import account_service


class _ExplodingDB:
    """Fails the test if the query is ever executed."""

    def __init__(self) -> None:
        self.executed = False

    async def execute(self, *_args, **_kwargs):
        self.executed = True
        raise AssertionError("query must not run for a malformed account id")


@pytest.mark.asyncio
async def test_get_account_returns_none_for_non_uuid_without_querying():
    db = _ExplodingDB()

    result = await account_service.get_account(db, "marketplace", str(uuid.uuid4()))

    assert result is None
    assert not db.executed, "malformed id must be rejected before the DB round-trip"


@pytest.mark.asyncio
async def test_get_account_returns_none_for_empty_id():
    db = _ExplodingDB()

    result = await account_service.get_account(db, "", str(uuid.uuid4()))

    assert result is None
    assert not db.executed


@pytest.mark.asyncio
async def test_get_account_returns_none_for_uuid_shaped_garbage():
    """A string with UUID length but illegal chars must also be rejected."""
    db = _ExplodingDB()

    result = await account_service.get_account(
        db, "marketplace-is-not-a-uuid-here", str(uuid.uuid4())
    )

    assert result is None
    assert not db.executed


@pytest.mark.asyncio
async def test_get_profile_photo_and_chat_photo_reject_non_uuid_before_db():
    """get_profile_photo and get_chat_photo reject 'marketplace' with 400 before DB query."""
    from fastapi import HTTPException
    from starlette.requests import Request
    from app.api.accounts import get_profile_photo
    from app.api.media import get_chat_photo

    db = _ExplodingDB()
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "client": ("127.0.0.1", 12345)}
    req = Request(scope)

    with pytest.raises(HTTPException) as exc1:
        await get_profile_photo("marketplace", req, db=db)
    assert exc1.value.status_code == 400
    assert not db.executed

    with pytest.raises(HTTPException) as exc2:
        await get_chat_photo("marketplace", 12345, req, db=db, user=None)
    assert exc2.value.status_code == 400
    assert not db.executed

