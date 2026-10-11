"""Unit tests for Security & Audit Analytics service, redaction, IP validation, and authorization."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest
from starlette.requests import Request

from app.models.security_audit_log import SecurityAuditLog
from app.models.user import User
from app.services.security_audit_service import (
    FORBIDDEN_AUDIT_KEYS,
    get_safe_client_ip,
    get_security_analytics_summary,
    mask_phone_number,
    query_security_audit_logs,
    record_security_audit_event,
    scrub_sensitive_metadata,
)


def _make_mock_request(client_host: str = "203.0.113.195", headers: dict | None = None) -> Request:
    raw_headers = []
    if headers:
        for k, v in headers.items():
            raw_headers.append((k.lower().encode("latin-1"), v.encode("latin-1")))

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/admin/analytics/security",
        "headers": raw_headers,
        "client": (client_host, 54321),
    }
    return Request(scope)


def test_mask_phone_number():
    assert mask_phone_number("+6281234567890") == "+6281****7890"
    assert mask_phone_number("081234567890") == "08123****7890"
    assert mask_phone_number("1234") == "1234"
    assert mask_phone_number(None) is None


def test_scrub_sensitive_metadata_strict_redaction():
    raw_payload = {
        "user_email": "admin@telebos.id",
        "password": "SuperSecretPassword123!",
        "new_password": "AnotherSecretPassword456!",
        "twofa_password": "telegram_2fa_pass",
        "session_string": "1BJWbasd89712398127391823719827391823719823",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "api_secret": "tb_sec_9999999999999999",
        "otp": "123456",
        "twofa_code": "654321",
        "phone": "+6281234567890",
        "nested": {
            "current_password": "NestedPassword!",
            "private_key": "-----BEGIN RSA PRIVATE KEY-----...",
            "target_phone": "+6281987654321",
            "safe_counter": 42,
        },
        "long_text": "A" * 700,
    }

    scrubbed = scrub_sensitive_metadata(raw_payload)

    # 1. Assert all forbidden credential keys are thoroughly stripped
    for forbidden in FORBIDDEN_AUDIT_KEYS:
        assert forbidden not in scrubbed, f"Forbidden key '{forbidden}' leaked in top-level metadata!"
        assert forbidden not in scrubbed.get("nested", {}), f"Forbidden key '{forbidden}' leaked in nested metadata!"

    # 2. Assert phone numbers are masked
    assert scrubbed["phone"] == "+6281****7890"
    assert scrubbed["nested"]["target_phone"] == "+6281****4321"

    # 3. Assert safe metadata preserved
    assert scrubbed["user_email"] == "admin@telebos.id"
    assert scrubbed["nested"]["safe_counter"] == 42

    # 4. Assert long string was truncated safely
    assert len(scrubbed["long_text"]) <= 550
    assert scrubbed["long_text"].endswith("...[truncated]")


def test_get_safe_client_ip_anti_spoofing():
    # Scenario A: Direct client from public internet sends spoofed X-Forwarded-For header
    # Must NOT trust the header, must return the authentic peer socket IP!
    untrusted_req = _make_mock_request(
        client_host="198.51.100.25",
        headers={"X-Forwarded-For": "127.0.0.1, 10.0.0.1"},
    )
    assert get_safe_client_ip(untrusted_req) == "198.51.100.25"

    # Scenario B: Direct connection from localhost trusted reverse proxy
    # Properly parses and validates the forwarded client IP
    trusted_req = _make_mock_request(
        client_host="127.0.0.1",
        headers={"X-Forwarded-For": "203.0.113.88"},
    )
    assert get_safe_client_ip(trusted_req) == "203.0.113.88"

    # Scenario C: Forwarded header has malformed/garbage string
    # Discards garbage and safely falls back
    garbage_req = _make_mock_request(
        client_host="127.0.0.1",
        headers={"X-Forwarded-For": "<script>alert('xss')</script>, invalid-ip"},
    )
    assert get_safe_client_ip(garbage_req) == "127.0.0.1"


@pytest.mark.asyncio
async def test_record_security_audit_event_stores_sanitized_entry():
    mock_db = MagicMock()
    mock_db.add = MagicMock()

    user = User(
        id=uuid.uuid4(),
        email="owner@telebos.id",
        role="owner",
    )
    request = _make_mock_request(client_host="203.0.113.15")

    event = await record_security_audit_event(
        db=mock_db,
        action="admin.balance_adjusted",
        actor=user,
        target_type="user",
        target_id=str(uuid.uuid4()),
        target_label="target_user@telebos.id",
        outcome="success",
        severity="warning",
        request=request,
        metadata={
            "adjustment_amount": 50000,
            "secret_token": "SHOULD_BE_REMOVED",
            "phone": "+6281234567890",
        },
    )

    assert mock_db.add.called
    assert event.action == "admin.balance_adjusted"
    assert event.actor_email == "owner@telebos.id"
    assert event.actor_role == "owner"
    assert event.ip_address == "203.0.113.15"
    assert event.severity == "warning"
    assert event.outcome == "success"

    # Verify metadata was scrubbed
    assert "secret_token" not in event.metadata_payload
    assert event.metadata_payload["phone"] == "+6281****7890"
    assert event.metadata_payload["adjustment_amount"] == 50000


@pytest.mark.asyncio
async def test_query_security_audit_logs_and_suspicious_signals():
    mock_db = AsyncMock()

    # Mock count query returning 15
    mock_count_res = MagicMock()
    mock_count_res.scalar = MagicMock(return_value=15)

    # Mock logs query returning list
    mock_log = SecurityAuditLog(
        id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
        actor_email="admin@telebos.id",
        actor_role="owner",
        action="admin.role_changed",
        target_type="user",
        target_id=str(uuid.uuid4()),
        target_label="victim@telebos.id",
        outcome="success",
        severity="warning",
        ip_address="192.168.1.100",
        user_agent="Mozilla/5.0",
        metadata_payload={"old_role": "basic", "new_role": "pro"},
        created_at=datetime.now(timezone.utc),
    )
    mock_items_res = MagicMock()
    mock_items_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_log])))

    mock_db.execute = AsyncMock(side_effect=[mock_count_res, mock_items_res])

    logs, total = await query_security_audit_logs(
        db=mock_db,
        action="admin.*",
        outcome="success",
        page=1,
        page_size=10,
    )

    assert total == 15
    assert len(logs) == 1
    assert logs[0].action == "admin.role_changed"


@pytest.mark.asyncio
async def test_security_analytics_endpoint_authorization():
    from app.dependencies import require_role
    from fastapi import HTTPException

    # 1. Non-owner user must receive 403 Forbidden
    regular_user = User(
        id=uuid.uuid4(),
        email="user@telebos.id",
        role="basic",
    )
    dep = require_role(["owner"])

    with pytest.raises(HTTPException) as exc_info:
        await dep(request=None, current_user=regular_user, db=AsyncMock())
    assert exc_info.value.status_code == 403

    # 2. Owner user is authorized
    owner_user = User(
        id=uuid.uuid4(),
        email="owner@telebos.id",
        role="owner",
    )
    res = await dep(request=None, current_user=owner_user, db=AsyncMock())
    assert res.id == owner_user.id


@pytest.mark.asyncio
async def test_get_security_analytics_summary_executes_queries():
    from app.services.security_audit_service import get_security_analytics_summary

    mock_db = AsyncMock()

    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=7)
    end_dt = now

    def make_scalar_mock(val):
        m = MagicMock()
        m.scalar.return_value = val
        return m

    def make_all_mock(val):
        m = MagicMock()
        m.all.return_value = val
        return m

    # Mock responses for all queries executed in get_security_analytics_summary
    mock_db.execute.side_effect = [
        make_scalar_mock(120),  # 1. total_events
        make_all_mock([("success", 100), ("failure", 15), ("warning", 5)]),  # 2. outcome_counts
        make_all_mock([("info", 90), ("warning", 25), ("critical", 5)]),  # 3. severity_counts
        make_all_mock([("auth.login", 80), ("api_key.created", 10)]),  # 4. top_actions
        make_scalar_mock(75),  # 5. successful_logins
        make_scalar_mock(12),  # 6. failed_logins
        make_scalar_mock(3),   # 7. password_changes
        make_scalar_mock(2),   # 8. twofa_changes
        make_scalar_mock(5),   # 9. api_key_actions
        make_scalar_mock(1),   # 10. role_changes
        make_scalar_mock(2),   # 11. balance_adjustments
        make_scalar_mock(4),   # 12. sensitive_admin_actions
        make_all_mock([("203.0.113.10", 6, now)]),  # 13. Signal A: elevated_failed_logins
        make_all_mock([]),     # 15. Signal B: multi_ip_admins
        make_all_mock([]),     # 16. Signal C: unauthorized_admin_access
        make_all_mock([]),     # 17. Signal D: revoked_api_key_attempts
        make_all_mock([        # 18. timeseries
            (now - timedelta(days=1), 40, 5, 2),
            (now, 80, 7, 3),
        ]),
    ]

    summary = await get_security_analytics_summary(
        db=mock_db,
        start_date=start_dt,
        end_date=end_dt,
    )

    assert summary["total_events"] == 120
    assert summary["kpis"]["successful_logins"] == 75
    assert summary["kpis"]["failed_logins"] == 12
    assert len(summary["timeseries"]) == 2
    assert summary["timeseries"][0]["total_events"] == 40
    assert summary["timeseries"][0]["failure_events"] == 5
    assert summary["timeseries"][0]["warning_events"] == 2

