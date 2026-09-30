import asyncio
import random
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.indonesian_names import (
    INDONESIAN_FULL_NAMES,
    TELEGRAM_USERNAME_RE,
    choose_indonesian_full_name,
    generate_username_candidates,
)
from app.services import marketplace_profile_service
from app.services.marketplace_profile_service import (
    OFFICIAL_MARKETPLACE_BIO,
    MarketplaceProfilePreparationError,
    MarketplaceProfilePreparationRateLimitError,
    MarketplaceProfilePreparationTimeoutError,
    prepare_account_for_sale,
)


class FakeDatabase:
    def __init__(self):
        self.flush = AsyncMock()


class FakeClient:
    def __init__(self, photo_batches, bio_values=None, authorizations=None):
        self.photo_batches = iter(photo_batches)
        self.bio_values = iter(bio_values or [OFFICIAL_MARKETPLACE_BIO] * 3)
        # Default: one TeleBos session (current) plus one foreign session, so
        # the purge path is exercised unless a test opts out.
        self.authorizations = (
            [SimpleNamespace(current=True), SimpleNamespace(current=False)]
            if authorizations is None
            else authorizations
        )
        self.requests = []
        self.on_request = None

    async def get_me(self):
        return SimpleNamespace(id=42)

    async def __call__(self, request):
        self.requests.append(request)
        if self.on_request is not None:
            self.on_request(request)
        request_name = type(request).__name__
        if request_name == "GetUserPhotosRequest":
            return SimpleNamespace(photos=next(self.photo_batches))
        if request_name == "GetFullUserRequest":
            return SimpleNamespace(full_user=SimpleNamespace(about=next(self.bio_values)))
        if request_name == "GetAuthorizationsRequest":
            return SimpleNamespace(authorizations=self.authorizations)
        return SimpleNamespace()


def make_account():
    return SimpleNamespace(
        id="account-id",
        session_string="encrypted-session",
        first_name="Seller",
        last_name="Name",
        username="sellername",
        bio="seller bio",
        profile_photo_path="cached.jpg",
        profile_photo_id=123,
        photo_version=4,
    )


def test_indonesian_name_pool_has_at_least_200_unique_combinations():
    assert len(INDONESIAN_FULL_NAMES) >= 200
    assert len(set(INDONESIAN_FULL_NAMES)) == len(INDONESIAN_FULL_NAMES)


def test_seeded_name_selection_and_usernames_are_reproducible():
    assert choose_indonesian_full_name(random.Random(31)) == choose_indonesian_full_name(
        random.Random(31)
    )

    first_name, last_name = "Gibran", "Rakabuming"
    assert list(generate_username_candidates(first_name, last_name, rng=random.Random(7))) == list(
        generate_username_candidates(first_name, last_name, rng=random.Random(7))
    )


def test_username_candidates_are_valid_name_derived_telegram_usernames():
    candidates = list(generate_username_candidates("Gibran", "Rakabuming", rng=random.Random(9)))

    assert candidates
    assert len(candidates) == len(set(candidates))
    assert all(TELEGRAM_USERNAME_RE.fullmatch(candidate) for candidate in candidates)
    assert any("_" in candidate for candidate in candidates)
    assert any(any(char.isdigit() for char in candidate) for candidate in candidates)


async def test_prepare_account_for_sale_updates_profile_username_and_all_photos(
    monkeypatch, tmp_path
):
    account = make_account()
    db = FakeDatabase()
    client = FakeClient([["photo-1", "photo-2"], ["photo-3"], []])
    photo_path = tmp_path / "account-id.jpg"
    photo_path.write_bytes(b"photo")

    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=client)
    )
    monkeypatch.setattr("app.services.account_service._photo_path", lambda _: str(photo_path))

    identity = await prepare_account_for_sale(db, account, rng=random.Random(12))

    request_names = [type(request).__name__ for request in client.requests]
    profile_request = next(
        request for request in client.requests if type(request).__name__ == "UpdateProfileRequest"
    )
    username_request = next(
        request for request in client.requests if type(request).__name__ == "UpdateUsernameRequest"
    )

    assert profile_request.about == OFFICIAL_MARKETPLACE_BIO
    assert profile_request.first_name == identity.first_name
    assert profile_request.last_name == identity.last_name
    assert profile_request.last_name.endswith(" by Telebos")
    assert username_request.username == identity.username
    assert profile_request.last_name.removesuffix(" by Telebos").lower() in identity.username
    assert request_names.count("GetFullUserRequest") == 1
    assert request_names.count("DeletePhotosRequest") == 2
    assert not photo_path.exists()
    assert account.first_name == identity.first_name
    assert account.last_name == identity.last_name
    assert account.username == identity.username
    assert account.bio == OFFICIAL_MARKETPLACE_BIO
    assert account.profile_photo_path is None
    assert account.profile_photo_id is None
    assert account.photo_version == 5
    db.flush.assert_awaited_once()


async def test_prepare_account_for_sale_retries_when_telegram_bio_is_stale(monkeypatch, tmp_path):
    account = make_account()
    db = FakeDatabase()
    client = FakeClient([[]], bio_values=["old bio", OFFICIAL_MARKETPLACE_BIO])
    photo_path = tmp_path / "account-id.jpg"

    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=client)
    )
    monkeypatch.setattr("app.services.account_service._photo_path", lambda _: str(photo_path))

    await prepare_account_for_sale(db, account, rng=random.Random(12))

    request_names = [type(request).__name__ for request in client.requests]
    assert request_names.count("UpdateProfileRequest") == 2
    assert request_names.count("GetFullUserRequest") == 2
    assert account.bio == OFFICIAL_MARKETPLACE_BIO
    db.flush.assert_awaited_once()


async def test_prepare_account_for_sale_fails_closed_when_telegram_bio_stays_stale(
    monkeypatch, tmp_path
):
    account = make_account()
    db = FakeDatabase()
    client = FakeClient([[]], bio_values=["old bio", "still old"])
    photo_path = tmp_path / "account-id.jpg"

    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=client)
    )
    monkeypatch.setattr("app.services.account_service._photo_path", lambda _: str(photo_path))

    with pytest.raises(MarketplaceProfilePreparationError, match="did not save"):
        await prepare_account_for_sale(db, account, rng=random.Random(12))

    assert account.bio == "seller bio"
    db.flush.assert_not_awaited()


async def test_prepare_account_for_sale_returns_rate_limit_error_for_bio_verification(
    monkeypatch, tmp_path
):
    from telethon.errors import FloodWaitError

    account = make_account()
    db = FakeDatabase()

    class RateLimitedVerificationClient(FakeClient):
        async def __call__(self, request):
            self.requests.append(request)
            if type(request).__name__ == "GetFullUserRequest":
                raise FloodWaitError(request=request, capture=10)
            return await super().__call__(request)

    client = RateLimitedVerificationClient([[]])
    photo_path = tmp_path / "account-id.jpg"
    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=client)
    )
    monkeypatch.setattr("app.services.account_service._photo_path", lambda _: str(photo_path))

    with pytest.raises(MarketplaceProfilePreparationRateLimitError) as exc_info:
        await prepare_account_for_sale(db, account, rng=random.Random(12))

    assert exc_info.value.seconds == 10
    assert account.bio == "seller bio"
    db.flush.assert_not_awaited()


async def test_prepare_account_for_sale_fails_closed_when_client_is_unavailable(monkeypatch):
    account = make_account()
    db = FakeDatabase()

    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=None)
    )

    with pytest.raises(MarketplaceProfilePreparationError, match="disconnected"):
        await prepare_account_for_sale(db, account, rng=random.Random(1))

    assert account.first_name == "Seller"
    assert account.username == "sellername"
    db.flush.assert_not_awaited()


async def test_prepare_account_for_sale_fails_closed_when_profile_update_times_out(
    monkeypatch,
):
    account = make_account()
    db = FakeDatabase()

    class HangingClient(FakeClient):
        async def __call__(self, request):
            await asyncio.sleep(60)

    client = HangingClient([[]])
    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=client)
    )
    monkeypatch.setattr(marketplace_profile_service, "TELEGRAM_RPC_TIMEOUT_SECONDS", 0.001)

    with pytest.raises(MarketplaceProfilePreparationTimeoutError, match="did not respond"):
        await prepare_account_for_sale(db, account, rng=random.Random(1))

    assert account.first_name == "Seller"
    assert account.username == "sellername"
    db.flush.assert_not_awaited()

# ── Session purge: an account may not be listed while other logins survive ──

def _sale_client(monkeypatch, client, tmp_path):
    monkeypatch.setattr(marketplace_profile_service, "decrypt", lambda _: "session")
    monkeypatch.setattr(
        marketplace_profile_service.client_pool, "get", AsyncMock(return_value=client)
    )
    monkeypatch.setattr("app.services.account_service._photo_path", lambda _: str(tmp_path / "x.jpg"))


async def test_prepare_account_for_sale_terminates_foreign_sessions(monkeypatch, tmp_path):
    account = make_account()
    db = FakeDatabase()
    client = FakeClient([[]])

    _sale_client(monkeypatch, client, tmp_path)

    await prepare_account_for_sale(db, account, rng=random.Random(5))

    request_names = [type(request).__name__ for request in client.requests]
    assert "GetAuthorizationsRequest" in request_names
    assert "ResetAuthorizationsRequest" in request_names
    # The purge must run before the profile edits, so a refused reset stops
    # the listing before any Telegram state is changed.
    assert request_names.index("ResetAuthorizationsRequest") < request_names.index(
        "UpdateProfileRequest"
    )
    db.flush.assert_awaited_once()


async def test_prepare_account_for_sale_skips_reset_when_no_foreign_sessions(
    monkeypatch, tmp_path
):
    account = make_account()
    db = FakeDatabase()
    client = FakeClient([[]], authorizations=[SimpleNamespace(current=True)])

    _sale_client(monkeypatch, client, tmp_path)

    await prepare_account_for_sale(db, account, rng=random.Random(5))

    request_names = [type(request).__name__ for request in client.requests]
    assert "GetAuthorizationsRequest" in request_names
    assert "ResetAuthorizationsRequest" not in request_names
    assert "UpdateProfileRequest" in request_names


async def test_prepare_account_for_sale_fails_closed_when_reset_is_refused(
    monkeypatch, tmp_path
):
    """Telegram rejecting the reset must abort the listing, not warn and continue."""
    from telethon.errors import RPCError

    account = make_account()
    db = FakeDatabase()
    client = FakeClient([[]])

    def fail_on_reset(request):
        if type(request).__name__ == "ResetAuthorizationsRequest":
            raise RPCError(request=None, message="RESET_AUTHORIZATIONSR_PEER_FRESH")

    client.on_request = fail_on_reset
    _sale_client(monkeypatch, client, tmp_path)

    with pytest.raises(MarketplaceProfilePreparationError, match="revoke its other sessions"):
        await prepare_account_for_sale(db, account, rng=random.Random(1))

    # Nothing may be mutated on a refused purge.
    assert account.first_name == "Seller"
    assert account.username == "sellername"
    assert account.bio == "seller bio"
    db.flush.assert_not_awaited()


async def test_prepare_account_for_sale_surfaces_reset_flood_wait(monkeypatch, tmp_path):
    from telethon.errors import FloodWaitError

    account = make_account()
    db = FakeDatabase()
    client = FakeClient([[]])

    def flood_on_reset(request):
        if type(request).__name__ == "ResetAuthorizationsRequest":
            raise FloodWaitError(request=None, capture=0)

    client.on_request = flood_on_reset
    _sale_client(monkeypatch, client, tmp_path)

    with pytest.raises(MarketplaceProfilePreparationRateLimitError) as excinfo:
        await prepare_account_for_sale(db, account, rng=random.Random(1))

    assert excinfo.value.seconds >= 0
    db.flush.assert_not_awaited()
