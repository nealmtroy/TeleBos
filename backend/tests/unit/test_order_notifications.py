import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services import order_service


async def test_status_change_creates_persistent_notification(monkeypatch):
    order = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        smm_order_id="123",
        service_name="Telegram Members",
        status="Pending",
        start_count=None,
        remains=None,
    )
    db = SimpleNamespace(add=MagicMock(), flush=AsyncMock())
    monkeypatch.setattr(
        order_service,
        "check_order_status",
        AsyncMock(
            return_value={
                "status": True,
                "data": {"status": "Success", "start_count": "10", "remains": "0"},
            }
        ),
    )

    await order_service.refresh_order_status(db, order)

    notification = db.add.call_args.args[0]
    assert notification.event == "order.status_changed"
    assert notification.kind == "success"
    assert notification.data["status"] == "Success"
