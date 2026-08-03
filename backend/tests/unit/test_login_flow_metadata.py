from types import SimpleNamespace

import pytest

from app.services.account_service import sent_code_metadata, validate_login_code
from app.services.pending_login_service import PendingLoginManager


class SentCodeTypeEmailCode:
    email_pattern = "u***@example.com"
    length = 6
    google_signin_allowed = True
    apple_signin_allowed = False
    reset_available_period = 0
    reset_pending_date = None


class SentCodeTypeSetUpEmailRequired:
    google_signin_allowed = True
    apple_signin_allowed = True


class CodeTypeSms:
    pass


def test_email_code_metadata_exposes_only_presentation_fields():
    result = SimpleNamespace(
        type=SentCodeTypeEmailCode(),
        next_type=CodeTypeSms(),
        timeout=90,
        phone_code_hash="never-return-this-value",
    )

    metadata = sent_code_metadata(result)

    assert metadata == {
        "stage": "enter_code",
        "delivery_type": "email_code",
        "next_delivery_type": "sms",
        "timeout": 90,
        "code_length": 6,
        "input_mode": "alphanumeric",
        "input_pattern": None,
        "email_pattern": "u***@example.com",
        "reset_available_period": 0,
        "reset_pending_date": None,
        "setup_url": None,
        "google_signin_allowed": True,
        "apple_signin_allowed": False,
    }
    assert "phone_code_hash" not in metadata


def test_setup_email_metadata_keeps_flow_actionable():
    metadata = sent_code_metadata(
        SimpleNamespace(type=SentCodeTypeSetUpEmailRequired(), next_type=None, timeout=None)
    )

    assert metadata["stage"] == "setup_email"
    assert metadata["google_signin_allowed"] is True
    assert metadata["apple_signin_allowed"] is True


@pytest.mark.parametrize(
    ("code", "metadata", "message"),
    [
        ("12345", {"code_length": 6, "input_mode": "numeric"}, "Panjang kode"),
        ("12a456", {"code_length": 6, "input_mode": "numeric"}, "harus berupa angka"),
        ("123456", {"code_length": 6, "input_mode": "numeric"}, None),
    ],
)
def test_login_code_validation_uses_server_metadata(code, metadata, message):
    if message:
        with pytest.raises(ValueError, match=message):
            validate_login_code(code, metadata)
    else:
        validate_login_code(code, metadata)


@pytest.mark.asyncio
async def test_pending_login_is_owner_scoped_and_disconnects_once():
    class Client:
        disconnected = 0

        async def disconnect(self):
            self.disconnected += 1

    manager = PendingLoginManager()
    client = Client()
    entry = await manager.create(
        user_id="owner",
        phone="+628123",
        client=client,
        phone_code_hash="server-only",
        sent_code={"stage": "enter_code"},
    )

    assert await manager.get(entry.login_id, "other") is None
    assert await manager.get(entry.login_id, "owner") is entry

    await manager.discard(entry.login_id, expected=entry)
    await manager.discard(entry.login_id, expected=entry)

    assert client.disconnected == 1
