"""Regression tests for account-scoped signed photo URLs."""

from app.utils import signed_url


def test_photo_token_round_trip(monkeypatch):
    monkeypatch.setattr(signed_url.time, "time", lambda: 1_000.0)

    token = signed_url.generate_photo_token("account-1", "user-1")

    assert signed_url.parse_photo_token(token, "account-1") == "user-1"


def test_photo_token_rejects_tampering_and_wrong_account(monkeypatch):
    monkeypatch.setattr(signed_url.time, "time", lambda: 1_000.0)
    token = signed_url.generate_photo_token("account-1", "user-1")
    user_id, expiry, signature = token.split(":")

    assert (
        signed_url.parse_photo_token(f"{user_id}:{expiry}:{signature[:-1]}0", "account-1") is None
    )
    assert signed_url.parse_photo_token(token, "account-2") is None


def test_photo_token_rejects_malformed_and_expired_tokens(monkeypatch):
    monkeypatch.setattr(signed_url.time, "time", lambda: 1_000.0)
    expired = signed_url.generate_photo_token("account-1", "user-1", expires_in=1)

    assert signed_url.parse_photo_token("invalid", "account-1") is None
    monkeypatch.setattr(signed_url.time, "time", lambda: 1_002.0)
    assert signed_url.parse_photo_token(expired, "account-1") is None
