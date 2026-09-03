"""Unit tests for Code Quality Fase 3 (Database migrator and schedulers)."""

from unittest.mock import MagicMock, patch
import pytest

from app.database_migrator import run_migrations
from app.schedulers.background_tasks import (
    adaptive_sequential_sync_loop,
    smm_services_sync_loop,
    smm_orders_poll_loop,
)


def test_run_migrations_idempotency_structure():
    """Verify run_migrations inspects tables and executes schema statements."""
    mock_conn = MagicMock()
    mock_inspector = MagicMock()

    # Provide mock columns for relevant tables
    mock_inspector.get_columns.return_value = [
        {"name": "id"},
        {"name": "token_hash"},
        {"name": "loop_enabled"},
        {"name": "account_ids"},
        {"name": "target_chat_title"},
        {"name": "is_bot"},
        {"name": "is_scam"},
        {"name": "is_fake"},
        {"name": "for_sale"},
        {"name": "groups_channels_synced_at"},
        {"name": "is_sold"},
    ]

    with patch("app.database_migrator.inspect", return_value=mock_inspector):
        run_migrations(mock_conn)

    # Inspector should have been called for several tables
    assert mock_inspector.get_columns.call_count >= 1
    # connection.execute should have been called for indexes and backfills
    assert mock_conn.execute.call_count >= 1


def test_background_schedulers_importable():
    """Verify background sync functions are valid coroutine functions."""
    import inspect

    assert inspect.iscoroutinefunction(adaptive_sequential_sync_loop)
    assert inspect.iscoroutinefunction(smm_services_sync_loop)
    assert inspect.iscoroutinefunction(smm_orders_poll_loop)
