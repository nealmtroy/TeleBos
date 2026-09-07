import uuid
from app.schemas.broadcast import BroadcastUserSummaryResponse
from app.api.admin import UserAdminResponse, AdminStatsResponse


def test_broadcast_user_summary_schema():
    summary = BroadcastUserSummaryResponse(
        total_jobs=10,
        running_jobs=2,
        paused_jobs=1,
        completed_jobs=6,
        failed_jobs=1,
        cancelled_jobs=0,
        active_accounts_count=5,
        total_accounts_used=12,
        total_sent=1500,
        total_failed=30,
    )
    assert summary.total_jobs == 10
    assert summary.running_jobs == 2
    assert summary.active_accounts_count == 5
    assert summary.total_accounts_used == 12
    assert summary.total_sent == 1500


def test_user_admin_response_telemetry():
    uid = uuid.uuid4()
    resp = UserAdminResponse(
        id=uid,
        email="test@example.com",
        full_name="Tester",
        role="basic",
        balance=50000,
        is_active=True,
        order_count=3,
        connected_accounts=5,
        active_accounts=4,
        expired_accounts=1,
        limited_accounts=1,
        broadcast_running=2,
        broadcast_finished=5,
        broadcast_failed=1,
        broadcast_total=8,
    )
    assert resp.connected_accounts == 5
    assert resp.active_accounts == 4
    assert resp.limited_accounts == 1
    assert resp.broadcast_running == 2
    assert resp.broadcast_finished == 5


def test_admin_stats_response_telemetry():
    stats = AdminStatsResponse(
        total_users=10,
        total_broadcast_jobs=15,
        total_invite_jobs=3,
        total_accounts_connected=25,
        total_basic_users=8,
        total_pro_users=1,
        total_premium_users=1,
        total_owner_users=1,
        accounts_active=20,
        accounts_expired=5,
        accounts_limited=2,
        broadcast_running=3,
        broadcast_stopped=12,
        broadcast_completed=10,
        broadcast_failed=2,
    )
    assert stats.accounts_limited == 2
    assert stats.broadcast_completed == 10
    assert stats.broadcast_failed == 2
