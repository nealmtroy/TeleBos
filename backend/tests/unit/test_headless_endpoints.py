"""Unit tests for headless API endpoints (Reactions, Analytics Pruning, Reg Date Sync).

Verifies functionality, parameter handling, error cases, and response schemas.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest
from fastapi import HTTPException

from app.api.admin_analytics import prune_events
from app.api.reactions import get_message_reactions, send_message_reaction
from app.api.telegram_reg_date import (
    RegDateEstimateResponse,
    RegDateSyncResponse,
    estimate_reg_date,
    sync_reg_dates,
)
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.analytics import PruneEventsResponse
from app.schemas.chat import (
    MessageReactionsResponse,
    SendReactionRequestSchema,
)


@pytest.mark.asyncio
async def test_send_reaction_success():
    """Verify that send_message_reaction resolves account and invokes reaction_service."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()

    mock_account = MagicMock(spec=TelegramAccount)
    mock_account.id = uuid.uuid4()

    with patch("app.services.account_service.get_account", new_callable=AsyncMock) as mock_get_acc, \
         patch("app.services.reaction_service.send_reaction", new_callable=AsyncMock) as mock_send_react:
        mock_get_acc.return_value = mock_account

        payload = SendReactionRequestSchema(reaction="🔥")
        await send_message_reaction(
            account_id=str(mock_account.id),
            chat_id=123456789,
            msg_id=42,
            payload=payload,
            db=mock_db,
            user=mock_user,
        )

        mock_get_acc.assert_awaited_once_with(mock_db, str(mock_account.id), str(mock_user.id))
        mock_send_react.assert_awaited_once_with(mock_account, 123456789, 42, "🔥")


@pytest.mark.asyncio
async def test_send_reaction_account_not_found():
    """Verify 404 HTTPException when target account does not belong to user."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()

    with patch("app.services.account_service.get_account", new_callable=AsyncMock) as mock_get_acc:
        mock_get_acc.return_value = None

        payload = SendReactionRequestSchema(reaction="❤️")
        with pytest.raises(HTTPException) as exc_info:
            await send_message_reaction(
                account_id="non-existent-acc-id",
                chat_id=123456789,
                msg_id=42,
                payload=payload,
                db=mock_db,
                user=mock_user,
            )
        assert exc_info.value.status_code == 404
        assert "Account not found" in exc_info.value.detail


@pytest.mark.asyncio
async def test_get_message_reactions_success():
    """Verify that get_message_reactions returns structured reaction lists."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()

    mock_account = MagicMock(spec=TelegramAccount)
    mock_account.id = uuid.uuid4()

    sample_reactions = {
        "count": 2,
        "reactions": [
            {
                "peer_id": 98765,
                "peer_name": "John Doe",
                "reaction": "👍",
                "date": "2026-10-14T03:00:00Z",
            },
            {
                "peer_id": 54321,
                "peer_name": "Jane Smith",
                "reaction": "🎉",
                "date": "2026-10-14T03:05:00Z",
            },
        ],
    }

    with patch("app.services.account_service.get_account", new_callable=AsyncMock) as mock_get_acc, \
         patch("app.services.reaction_service.get_reactions", new_callable=AsyncMock) as mock_get_react:
        mock_get_acc.return_value = mock_account
        mock_get_react.return_value = sample_reactions

        result = await get_message_reactions(
            account_id=str(mock_account.id),
            chat_id=123456789,
            msg_id=42,
            db=mock_db,
            user=mock_user,
        )

        assert result["count"] == 2
        assert len(result["reactions"]) == 2
        assert result["reactions"][0]["peer_name"] == "John Doe"

        # Validate that the response passes MessageReactionsResponse schema parsing
        parsed = MessageReactionsResponse(**result)
        assert parsed.count == 2
        assert parsed.reactions[0].reaction == "👍"


@pytest.mark.asyncio
async def test_prune_events_endpoint_success():
    """Verify that prune_events endpoint executes retention deletion and commits transaction."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.role = "owner"

    with patch("app.services.analytics_tracking_service.prune_ephemeral_events", new_callable=AsyncMock) as mock_prune:
        mock_prune.return_value = 57

        res: PruneEventsResponse = await prune_events(
            retention_days=90,
            db=mock_db,
            current_user=mock_user,
        )

        assert res.status == "success"
        assert res.deleted_count == 57
        assert res.retention_days == 90
        mock_prune.assert_awaited_once_with(mock_db, retention_days=90)
        mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sync_reg_dates_success():
    """Verify that sync_reg_dates triggers harvesting and returns new datapoints count."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()
    mock_user.role = "owner"

    mock_account = MagicMock(spec=TelegramAccount)
    mock_account.id = uuid.uuid4()

    with patch("app.services.account_service.get_account", new_callable=AsyncMock) as mock_get_acc, \
         patch("app.services.telegram_reg_date_service.reg_date_service.sync_datapoints_from_account", new_callable=AsyncMock) as mock_sync:
        mock_get_acc.return_value = mock_account
        mock_sync.return_value = 14

        res = await sync_reg_dates(
            account_id=str(mock_account.id),
            db=mock_db,
            user=mock_user,
        )

        assert res.status == "success"
        assert res.new_datapoints == 14
        mock_sync.assert_awaited_once_with(mock_db, mock_account.id, limit=500)


@pytest.mark.asyncio
async def test_sync_reg_dates_account_not_found():
    """Verify 404 when syncing reg dates with non-existent account."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()
    mock_user.role = "owner"

    with patch("app.services.account_service.get_account", new_callable=AsyncMock) as mock_get_acc:
        mock_get_acc.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await sync_reg_dates(
                account_id="non-existent",
                db=mock_db,
                user=mock_user,
            )
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_estimate_reg_date_endpoint_success():
    """Verify estimate_reg_date endpoint returns formatted response model."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.role = "pro"

    with patch("app.services.telegram_reg_date_service.reg_date_service.get_estimated_registration_date", new_callable=AsyncMock) as mock_est:
        mock_est.return_value = {
            "status": "estimated",
            "date": "2021-08-20",
            "age": "3 years, 2 months",
        }

        res = await estimate_reg_date(
            telegram_id=999888777,
            db=mock_db,
            user=mock_user,
        )

        assert res.status == "estimated"
        assert res.date == "2021-08-20"
        assert res.age == "3 years, 2 months"
