"""Unit tests for Onboarding survey and admin analytics."""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.models.user import User
from app.models.onboarding_survey import OnboardingSurvey
from app.schemas.onboarding import (
    OnboardingSubmitRequest,
    OnboardingStatusResponse,
    OnboardingSurveyResponse,
    OnboardingAnalyticsResponse,
    OnboardingRecentSurveyItem,
)
from app.api.onboarding import get_onboarding_status, submit_onboarding_survey
from app.api.admin import get_onboarding_analytics


@pytest.mark.asyncio
async def test_onboarding_schemas_validation():
    req = OnboardingSubmitRequest(
        role="agency",
        referral="telegram",
        volume="21-50",
        features=["broadcast", "webchat"],
        is_skipped=False,
    )
    assert req.role == "agency"
    assert req.referral == "telegram"
    assert "broadcast" in req.features
    assert req.is_skipped is False


@pytest.mark.asyncio
async def test_submit_onboarding_survey_creates_record():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    # Mock no existing survey
    mock_exec_result = MagicMock()
    mock_exec_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_exec_result

    user_id = uuid.uuid4()
    mock_user = User(
        id=user_id,
        email="test@telebos.app",
        onboarding_completed=False,
    )

    req = OnboardingSubmitRequest(
        role="solo",
        referral="friend",
        volume="1-5",
        features=["broadcast"],
        is_skipped=False,
    )

    resp = await submit_onboarding_survey(
        payload=req,
        current_user=mock_user,
        db=mock_db,
    )

    assert resp.onboarding_completed is True
    assert resp.survey is not None
    assert resp.survey.role == "solo"
    assert resp.survey.referral == "friend"
    assert mock_user.onboarding_completed is True
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_get_onboarding_status_when_completed():
    user_id = uuid.uuid4()
    survey = OnboardingSurvey(
        id=uuid.uuid4(),
        user_id=user_id,
        role="developer",
        referral="search",
        volume="6-20",
        features=["proxy", "autoreply"],
        is_skipped=False,
    )
    mock_user = User(
        id=user_id,
        email="dev@telebos.app",
        onboarding_completed=True,
    )

    mock_db = AsyncMock()
    mock_exec_result = MagicMock()
    mock_exec_result.scalar_one_or_none.return_value = survey
    mock_db.execute.return_value = mock_exec_result

    resp = await get_onboarding_status(
        current_user=mock_user,
        db=mock_db,
    )

    assert resp.onboarding_completed is True
    assert resp.survey is not None
    assert resp.survey.role == "developer"
    assert resp.survey.volume == "6-20"


@pytest.mark.asyncio
async def test_get_onboarding_analytics():
    mock_db = AsyncMock()

    # Mocks for queries in get_onboarding_analytics:
    # 1. total_users: 10
    # 2. completed_count: 8
    # 3. skipped_count: 2
    # 4. roles_breakdown: [("solo", 5), ("agency", 3)]
    # 5. referrals_breakdown: [("friend", 4), ("telegram", 4)]
    # 6. volumes_breakdown: [("1-5", 3), ("6-20", 5)]
    # 7. features_breakdown: [(["broadcast", "smm"],), (["broadcast"],)]
    # 8. recent_surveys: [(survey, email, full_name)]

    survey = OnboardingSurvey(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        role="solo",
        referral="friend",
        volume="1-5",
        features=["broadcast", "smm"],
        is_skipped=False,
    )

    mock_db.execute.side_effect = [
        MagicMock(scalar=MagicMock(return_value=10)),  # total users
        MagicMock(scalar=MagicMock(return_value=8)),   # completed count
        MagicMock(scalar=MagicMock(return_value=2)),   # skipped count
        MagicMock(all=MagicMock(return_value=[("solo", 5), ("agency", 3)])), # roles
        MagicMock(all=MagicMock(return_value=[("friend", 4), ("telegram", 4)])), # referrals
        MagicMock(all=MagicMock(return_value=[("1-5", 3), ("6-20", 5)])), # volumes
        MagicMock(all=MagicMock(return_value=[(["broadcast", "smm"],), (["broadcast"],)])), # features
        MagicMock(all=MagicMock(return_value=[(survey, "user@telebos.app", "User Boss")])), # recent
    ]

    mock_owner = User(id=uuid.uuid4(), role="owner", email="owner@telebos.app")

    resp = await get_onboarding_analytics(
        db=mock_db,
        current_user=mock_owner,
        limit=20,
    )

    assert resp.total_users == 10
    assert resp.completed_count == 8
    assert resp.skipped_count == 2
    assert resp.pending_count == 2
    assert resp.completion_rate == 80.0
    assert resp.roles_breakdown["solo"] == 5
    assert resp.referrals_breakdown["friend"] == 4
    assert resp.volumes_breakdown["1-5"] == 3
    assert resp.features_breakdown["broadcast"] == 2
    assert resp.features_breakdown["smm"] == 1
    assert len(resp.recent_surveys) == 1
    assert resp.recent_surveys[0].user_email == "user@telebos.app"
