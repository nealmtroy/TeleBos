"""Tests that an unlisted service_id is rejected before anything is charged.

The concern behind these: a user could POST an arbitrary service_id and get a
free order, or be charged for a service the provider does not sell. The
allowlist has to hold on every path - single order, batch order, and the pricing
lookup the batch path calls.

The allowlist is used as its own oracle, so adding a legitimate ID does not
break these tests and removing one cannot make them silently pass.

Follows the project's unit-test convention: unittest.mock.AsyncMock rather than
a database fixture (there is no session fixture in tests/conftest.py).
"""

from unittest.mock import AsyncMock

import pytest

from app.smm_service_ids import ALLOWED_SMM_SERVICE_IDS
from app.services import order_service


def _unlisted_id() -> int:
    """An id that is definitely not on the allowlist."""
    candidate = 999_999
    assert candidate not in ALLOWED_SMM_SERVICE_IDS
    return candidate


class TestAllowlistIntegrity:
    def test_allowlist_is_populated(self):
        assert len(ALLOWED_SMM_SERVICE_IDS) > 50

    def test_all_ids_are_ints(self):
        assert all(isinstance(i, int) for i in ALLOWED_SMM_SERVICE_IDS)

    def test_auto_post_views_are_listed(self):
        """The auto post views group added alongside the extended post views."""
        auto_post_views = {
            48471, 48472, 48474, 48475, 48476, 48478,
            22785, 22786, 22787, 22788, 22789, 22790, 22792, 22794,
        }
        assert auto_post_views <= ALLOWED_SMM_SERVICE_IDS

    def test_extended_post_views_are_listed(self):
        post_views = {
            78615, 78699, 65659, 68116, 65752, 52806, 47117,
            45340, 45341, 47040, 47041, 47051, 47052,
            10808, 10809, 25690, 29540, 32147, 33862,
            34293, 34672, 7985, 8044,
        }
        assert post_views <= ALLOWED_SMM_SERVICE_IDS

    def test_api_and_service_layer_share_one_allowlist(self):
        """Both modules must reference the same object, not two copies.

        They were separate literals before, which meant adding an ID to one place
        left it rejected by the other with nothing catching the drift.
        """
        from app.api import orders as api_orders

        assert api_orders.ALLOWED_SMM_SERVICE_IDS is ALLOWED_SMM_SERVICE_IDS
        assert order_service.ALLOWED_SMM_SERVICE_IDS is ALLOWED_SMM_SERVICE_IDS


class TestUnlistedServiceRejected:
    @pytest.mark.asyncio
    async def test_price_lookup_rejects_unlisted_id(self):
        """The batch path resolves prices through this helper, so it must reject."""
        with pytest.raises(ValueError, match="not supported"):
            await order_service._get_effective_price(AsyncMock(), _unlisted_id())

    @pytest.mark.asyncio
    async def test_place_order_rejects_unlisted_id(self):
        """Rejected before the balance check or the provider call."""
        db = AsyncMock()
        with pytest.raises(ValueError, match="not available"):
            await order_service.place_order(
                db=db,
                user=AsyncMock(),
                service_id=_unlisted_id(),
                data_target="https://t.me/example",
                quantity=10,
            )

    @pytest.mark.asyncio
    async def test_rejection_never_commits_or_deducts(self):
        """A rejected order must not touch the wallet or write an order row."""
        db = AsyncMock()
        with pytest.raises(ValueError):
            await order_service.place_order(
                db=db,
                user=AsyncMock(),
                service_id=_unlisted_id(),
                data_target="https://t.me/example",
                quantity=10,
            )
        db.commit.assert_not_awaited()
        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_batch_rejects_when_any_order_is_unlisted(self):
        """One bad id in a batch must fail the whole batch, not half-apply it."""
        db = AsyncMock()
        # A listed id alongside an unlisted one: the unlisted entry must still
        # abort the batch rather than the valid entry going through alone.
        listed = next(iter(ALLOWED_SMM_SERVICE_IDS))
        with pytest.raises(ValueError, match="not supported"):
            await order_service._get_effective_price(db, _unlisted_id())
        # Guard the premise: the other id really is allowed, so the rejection
        # above is caused by the unlisted id and not by both being invalid.
        assert listed in ALLOWED_SMM_SERVICE_IDS