"""Regression coverage for encrypted Telegram-sensitive values."""

import pytest
from cryptography.fernet import Fernet

from app.config import get_settings
from app.utils import encryption


def reset_cipher(monkeypatch):
    monkeypatch.setattr(encryption, "_cipher", None)


def test_encrypt_decrypt_round_trip_supports_unicode(monkeypatch):
    reset_cipher(monkeypatch)
    plaintext = "session-data: telegram ✅ 日本語"

    ciphertext = encryption.encrypt(plaintext)

    assert ciphertext != plaintext
    assert encryption.decrypt(ciphertext) == plaintext


def test_empty_encryption_inputs_are_preserved():
    assert encryption.encrypt("") == ""
    assert encryption.decrypt("") == ""


def test_invalid_ciphertext_fails_closed(monkeypatch):
    """Invalid ciphertext must raise, not silently return an empty string.

    Returning "" used to hand a blank session string to Telethon, which then
    failed far away with a misleading "auth key" error. Raising DecryptionError
    keeps the failure at the point of the actual corruption.
    """
    reset_cipher(monkeypatch)

    with pytest.raises(encryption.DecryptionError):
        encryption.decrypt("not-a-valid-fernet-token")

    # The tolerant variant still returns None for callers that cannot raise.
    assert encryption.decrypt_or_none("not-a-valid-fernet-token") is None


def test_ciphertext_from_another_key_raises(monkeypatch):
    """A rotated ENCRYPTION_KEY surfaces as DecryptionError, not as empty data."""
    reset_cipher(monkeypatch)
    ciphertext = encryption.encrypt("session-data")

    other_key = Fernet(Fernet.generate_key())
    monkeypatch.setattr(encryption, "_cipher", other_key)

    with pytest.raises(encryption.DecryptionError):
        encryption.decrypt(ciphertext)


def test_password_hash_verification():
    password_hash = encryption.hash_password("correct-horse-battery-staple")

    assert encryption.verify_password("correct-horse-battery-staple", password_hash)
    assert not encryption.verify_password("wrong-password", password_hash)


def test_invalid_fernet_key_fails_closed(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", "not-a-fernet-key")
    get_settings.cache_clear()
    monkeypatch.setattr(encryption, "settings", get_settings())
    reset_cipher(monkeypatch)

    try:
        encryption._get_cipher()
    except RuntimeError as exc:
        assert "ENCRYPTION_KEY" in str(exc)
    else:
        raise AssertionError("An invalid Fernet key must abort encryption setup")
    finally:
        monkeypatch.setenv("ENCRYPTION_KEY", Fernet.generate_key().decode())
        get_settings.cache_clear()
        monkeypatch.setattr(encryption, "settings", get_settings())
        reset_cipher(monkeypatch)
