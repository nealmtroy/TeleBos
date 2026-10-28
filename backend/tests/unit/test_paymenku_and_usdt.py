"""Unit tests for Paymenku QRIS gateway client and self-custody USDT on-chain payment service."""

from __future__ import annotations

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.paymenku_service import (
    check_paymenku_status,
    create_paymenku_transaction,
    is_paymenku_configured,
    verify_paymenku_webhook_signature,
)
from app.services.usdt_payment_service import (
    BSC_USDT_DECIMALS,
    POLYGON_USDT_DECIMALS,
    TRON_USDT_DECIMALS,
    _raw_units_to_4dec,
    is_usdt_payment_method,
    normalize_usdt_network,
)
from app.utils.crypto_wallet import (
    derive_master_wallet_from_mnemonic,
    generate_bip39_mnemonic,
    generate_master_crypto_wallet,
    validate_bip39_mnemonic,
)


def test_bip39_and_bip44_official_vector():
    """Verify BIP-39 seed and BIP-44 derivation match official Ethereum & TRON test vectors."""
    mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    assert validate_bip39_mnemonic(mnemonic) is True

    wallet = derive_master_wallet_from_mnemonic(mnemonic)
    assert wallet["evm_address"] == "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"
    assert wallet["tron_address"] == "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH"
    assert wallet["evm_private_key"].startswith("0x")
    assert len(wallet["evm_private_key"]) == 66
    assert len(wallet["tron_private_key"]) == 64


def test_generate_master_crypto_wallet_random():
    """Verify random 12-word master wallet generation produces valid mnemonic and addresses."""
    wallet = generate_master_crypto_wallet()
    words = wallet["mnemonic"].split(" ")
    assert len(words) == 12
    assert validate_bip39_mnemonic(wallet["mnemonic"]) is True
    assert wallet["evm_address"].startswith("0x")
    assert len(wallet["evm_address"]) == 42
    assert wallet["tron_address"].startswith("T")
    assert len(wallet["tron_address"]) == 34


def test_usdt_network_normalization_and_decimal_conversion():
    """Verify network normalization and 4-decimal token unit conversion across BSC/Polygon/TRON."""
    assert normalize_usdt_network("USDT_BEP20") == "BEP20"
    assert normalize_usdt_network("usdt_trc20") == "TRC20"
    assert normalize_usdt_network("USDT_POLYGON") == "POLYGON"
    assert normalize_usdt_network("QRIS") is None

    assert is_usdt_payment_method("usdt_bep20") is True
    assert is_usdt_payment_method("USDT_TRC20") is True
    assert is_usdt_payment_method("QRIS") is False

    # 6.2501 USDT in 18 decimals (BSC BEP-20)
    raw_bsc = 62501 * (10 ** 14)
    assert _raw_units_to_4dec(raw_bsc, BSC_USDT_DECIMALS) == "6.2501"

    # 6.2501 USDT in 6 decimals (Polygon & TRON)
    raw_6dec = 6_250_100
    assert _raw_units_to_4dec(raw_6dec, POLYGON_USDT_DECIMALS) == "6.2501"
    assert _raw_units_to_4dec(raw_6dec, TRON_USDT_DECIMALS) == "6.2501"


def test_paymenku_webhook_hmac_verification():
    """Verify Paymenku X-PaymenKu-Signature HMAC-SHA256 verification."""
    secret = "whsec_test_paymenku_secret_123"
    timestamp = "1713258000"
    body_dict = {
        "event": "payment.status_updated",
        "trx_id": "TRX20260416ABC",
        "reference_id": "INV-12345",
        "status": "paid",
        "amount": "50000.00",
        "is_sandbox": False,
    }
    raw_body = json.dumps(body_dict).encode("utf-8")
    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    valid_sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    mock_settings = MagicMock()
    mock_settings.PAYMENKU_WEBHOOK_SECRET = secret
    mock_settings.PAYMENKU_API_KEY = "sk_live_test"

    with patch("app.services.paymenku_service.get_settings", return_value=mock_settings):
        assert verify_paymenku_webhook_signature(raw_body, valid_sig, timestamp) is True
        assert verify_paymenku_webhook_signature(raw_body, "deadbeef", timestamp) is False
        assert verify_paymenku_webhook_signature(raw_body, valid_sig, None) is False


@pytest.mark.asyncio
async def test_paymenku_create_and_check_status():
    """Verify Paymenku v1 transaction creation and status check response normalization."""
    mock_settings = MagicMock()
    mock_settings.PAYMENKU_API_KEY = "sk_test_paymenku_123"
    mock_settings.PAYMENKU_BASE_URL = "https://paymenku.com/api/v1"
    mock_settings.PAYMENKU_CHANNEL_CODE = "qris"
    mock_settings.NEXT_PUBLIC_URL = "https://telebos.id"

    mock_create_resp = MagicMock()
    mock_create_resp.status_code = 200
    mock_create_resp.content = b"{}"
    mock_create_resp.json.return_value = {
        "status": "success",
        "data": {
            "trx_id": "TRX998877",
            "reference_id": "INV-998877",
            "amount": 50000,
            "status": "pending",
            "pay_url": "https://paymenku.com/pay/TRX998877",
            "payment_info": {
                "qr_string": "00020101021226...",
                "qr_url": "https://api.qrserver.com/v1/create-qr-code/?data=000201...",
                "expiration_date": "2026-10-29T12:00:00Z",
            },
        },
    }

    mock_status_resp = MagicMock()
    mock_status_resp.status_code = 200
    mock_status_resp.is_success = True
    mock_status_resp.content = b"{}"
    mock_status_resp.json.return_value = {
        "status": "success",
        "data": {
            "trx_id": "TRX998877",
            "reference_id": "INV-998877",
            "amount": "50000.00",
            "status": "paid",
        },
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_create_resp
    mock_client.get.return_value = mock_status_resp

    with (
        patch("app.services.paymenku_service.get_settings", return_value=mock_settings),
        patch("app.services.paymenku_service.get_paymenku_http_client", return_value=mock_client),
    ):
        assert is_paymenku_configured() is True
        created = await create_paymenku_transaction(
            reference_id="INV-998877",
            amount=50000,
            keterangan="Top Up Test",
        )
        assert created["trx_id"] == "TRX998877"
        assert created["qris_url"] == "00020101021226..."
        assert created["qris_image"].startswith("https://api.qrserver.com")

        status_data = await check_paymenku_status("INV-998877")
        assert status_data is not None
        assert status_data["status"] == "PAID"
        assert status_data["total_amount"] == 50000

