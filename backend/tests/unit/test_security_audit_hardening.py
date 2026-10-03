"""Comprehensive unit tests for Access Control, SSRF, and Business Logic hardening."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from app.utils.url_security import (
    is_prohibited_ip,
    is_safe_ip_address,
    validate_safe_captcha_url,
)
from app.services.order_service import (
    ALLOWED_SMM_SERVICE_IDS,
    _calculate_price,
    _get_effective_price,
    get_order_by_id,
)
from app.services import marketplace_service


# ── SSRF Security Tests ────────────────────────────────────────────────────────


def test_ssrf_blocks_private_ip_ranges():
    """Verify private/loopback/link-local IP addresses are classified as prohibited."""
    assert is_prohibited_ip("127.0.0.1")
    assert is_prohibited_ip("127.0.1.1")
    assert is_prohibited_ip("::1")
    assert is_prohibited_ip("10.0.0.1")
    assert is_prohibited_ip("172.16.0.1")
    assert is_prohibited_ip("172.31.255.255")
    assert is_prohibited_ip("192.168.1.1")
    # AWS / Cloud Metadata IP (critical for VPS security)
    assert is_prohibited_ip("169.254.169.254")
    assert is_prohibited_ip("169.254.1.1")
    assert is_prohibited_ip("224.0.0.1")  # Multicast
    assert is_prohibited_ip("255.255.255.255")  # Broadcast
    assert is_prohibited_ip("0.0.0.0")  # Unspecified
    assert is_prohibited_ip("invalid-ip")


def test_ssrf_rejects_non_https():
    """Only HTTPS URLs are acceptable for captcha solving."""
    with pytest.raises(ValueError, match="Only HTTPS is allowed"):
        validate_safe_captcha_url("http://telegram.org/captcha?scope=test&actor=1", check_dns=False)

    with pytest.raises(ValueError, match="Only HTTPS is allowed"):
        validate_safe_captcha_url("file:///etc/passwd", check_dns=False)

    with pytest.raises(ValueError, match="Only HTTPS is allowed"):
        validate_safe_captcha_url("gopher://telegram.org/captcha", check_dns=False)


def test_ssrf_rejects_unauthorized_hosts():
    """Non-Telegram domains must be strictly rejected."""
    with pytest.raises(ValueError, match="Only official Telegram domains"):
        validate_safe_captcha_url("https://attacker.com/captcha", check_dns=False)

    with pytest.raises(ValueError, match="Only official Telegram domains"):
        validate_safe_captcha_url("https://telegram.org.attacker.com/captcha", check_dns=False)

    with pytest.raises(ValueError, match="Only official Telegram domains"):
        validate_safe_captcha_url("https://nottelegram.org/captcha", check_dns=False)


def test_ssrf_rejects_userinfo_injection():
    """URLs using username:password@host must be rejected to prevent domain confusion."""
    with pytest.raises(ValueError, match="URLs with embedded userinfo"):
        validate_safe_captcha_url("https://telegram.org@attacker.com/captcha", check_dns=False)

    with pytest.raises(ValueError, match="URLs with embedded userinfo"):
        validate_safe_captcha_url("https://admin:secret@telegram.org/captcha", check_dns=False)


def test_ssrf_rejects_direct_ip_addresses():
    """Direct IP access is banned for captcha endpoints."""
    with pytest.raises(ValueError, match="Direct IP address access is prohibited"):
        validate_safe_captcha_url("https://169.254.169.254/captcha", check_dns=False)

    with pytest.raises(ValueError, match="Direct IP address access is prohibited"):
        validate_safe_captcha_url("https://127.0.0.1/captcha", check_dns=False)


def test_ssrf_rejects_non_standard_ports():
    """Only standard HTTPS port 443 is permitted."""
    with pytest.raises(ValueError, match="Only standard HTTPS port 443"):
        validate_safe_captcha_url("https://telegram.org:8080/captcha", check_dns=False)

    with pytest.raises(ValueError, match="Only standard HTTPS port 443"):
        validate_safe_captcha_url("https://telegram.org:5432/captcha", check_dns=False)


def test_ssrf_rejects_invalid_paths_and_traversal():
    """Only paths starting with /captcha are allowed, and traversal is blocked."""
    with pytest.raises(ValueError, match="Must begin with '/captcha'"):
        validate_safe_captcha_url("https://telegram.org/admin", check_dns=False)

    with pytest.raises(ValueError, match="Path traversal detected"):
        validate_safe_captcha_url("https://telegram.org/captcha/../../etc/passwd", check_dns=False)


def test_ssrf_rejects_private_dns_resolution(monkeypatch):
    """If a valid domain name resolves to a private IP (e.g. DNS rebinding), it must be rejected."""
    # Mock socket.getaddrinfo to simulate malicious internal resolution
    fake_addrinfo = [(2, 1, 6, "", ("169.254.169.254", 443))]
    monkeypatch.setattr("socket.getaddrinfo", lambda host, port, proto=0: fake_addrinfo)

    with pytest.raises(ValueError, match="SSRF blocked: Host resolves to private/reserved"):
        validate_safe_captcha_url("https://telegram.org/captcha?scope=test&actor=1", check_dns=True)


def test_ssrf_accepts_valid_telegram_captcha_url(monkeypatch):
    """Legitimate Telegram captcha URLs resolve and pass validation."""
    fake_addrinfo = [(2, 1, 6, "", ("149.154.167.99", 443))]
    monkeypatch.setattr("socket.getaddrinfo", lambda host, port, proto=0: fake_addrinfo)

    valid_url = "https://telegram.org/captcha?scope=sbot_spam&actor=123456789"
    result = validate_safe_captcha_url(valid_url, check_dns=True)
    assert result == valid_url


# ── Business Logic Tests: SMM Orders ──────────────────────────────────────────


def test_calculate_price_enforces_positive_values():
    """Zero or negative price/quantity must be rejected."""
    with pytest.raises(ValueError, match="Price per unit and quantity must be positive"):
        _calculate_price(0, 100)

    with pytest.raises(ValueError, match="Price per unit and quantity must be positive"):
        _calculate_price(-50, 100)

    with pytest.raises(ValueError, match="Price per unit and quantity must be positive"):
        _calculate_price(1000, 0)

    with pytest.raises(ValueError, match="Price per unit and quantity must be positive"):
        _calculate_price(1000, -10)

    # Valid calculation (per 1000 units)
    assert _calculate_price(1000, 1000) == 1000
    assert _calculate_price(5000, 200) == 1000
    # Minimum 1 credit floor
    assert _calculate_price(10, 1) == 1


@pytest.mark.asyncio
async def test_get_effective_price_rejects_unauthorized_service_id():
    """Services outside ALLOWED_SMM_SERVICE_IDS must be rejected immediately."""
    fake_db = AsyncMock()
    with pytest.raises(ValueError, match="is not supported"):
        await _get_effective_price(fake_db, service_id=999999)


@pytest.mark.asyncio
async def test_get_effective_price_fails_closed_when_not_in_db():
    """If service is in allowed list but not cached/configured in DB, it must fail closed."""
    allowed_id = next(iter(ALLOWED_SMM_SERVICE_IDS))
    fake_db = AsyncMock()
    fake_db.get.return_value = None  # Not in database

    with pytest.raises(ValueError, match="not found in catalog"):
        await _get_effective_price(fake_db, service_id=allowed_id)


@pytest.mark.asyncio
async def test_get_order_by_id_handles_invalid_uuid():
    """Passing a malformed UUID to get_order_by_id returns None instead of raising unhandled 500."""
    fake_db = AsyncMock()
    user_id = str(uuid.uuid4())
    # Malformed order ID
    res = await get_order_by_id(fake_db, "not-a-uuid", user_id)
    assert res is None

    # Malformed user ID
    res2 = await get_order_by_id(fake_db, str(uuid.uuid4()), "not-a-uuid")
    assert res2 is None


# ── Business Logic Tests: Marketplace ─────────────────────────────────────────


class FakeResult:
    def __init__(self, accounts):
        self._accounts = accounts

    def scalars(self):
        return SimpleNamespace(all=lambda: self._accounts)


class FakeDatabase:
    def __init__(self, account):
        self.account = account
        self.execute = AsyncMock(return_value=FakeResult([account]))
        self.flush = AsyncMock()


@pytest.mark.asyncio
async def test_sell_accounts_rejects_unverified_account():
    """Unverified Telegram accounts cannot be listed for sale."""
    owner_id = uuid.uuid4()
    acc_id = uuid.uuid4()
    account = SimpleNamespace(
        id=acc_id,
        phone="+62812345678",
        for_sale=False,
        phone_verified=False,  # NOT verified!
        is_active=True,
    )

    fake_db = FakeDatabase(account)
    user = SimpleNamespace(id=owner_id)

    with pytest.raises(ValueError, match="Account is not verified"):
        await marketplace_service.sell_accounts(fake_db, user, [str(acc_id)])


@pytest.mark.asyncio
async def test_sell_accounts_rejects_inactive_account():
    """Inactive Telegram accounts cannot be listed for sale."""
    owner_id = uuid.uuid4()
    acc_id = uuid.uuid4()
    account = SimpleNamespace(
        id=acc_id,
        phone="+62812345678",
        for_sale=False,
        phone_verified=True,
        is_active=False,  # INACTIVE!
    )

    fake_db = FakeDatabase(account)
    user = SimpleNamespace(id=owner_id)

    with pytest.raises(ValueError, match="Inactive account cannot be listed for sale"):
        await marketplace_service.sell_accounts(fake_db, user, [str(acc_id)])
