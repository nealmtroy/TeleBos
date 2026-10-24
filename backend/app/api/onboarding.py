"""Onboarding survey API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.onboarding_survey import OnboardingSurvey
from app.schemas.onboarding import (
    OnboardingSubmitRequest,
    OnboardingStatusResponse,
    OnboardingSurveyResponse,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/status", response_model=OnboardingStatusResponse)
async def get_onboarding_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the current user's onboarding completion status and survey answers."""
    result = await db.execute(
        select(OnboardingSurvey).where(OnboardingSurvey.user_id == current_user.id)
    )
    survey = result.scalar_one_or_none()

    return OnboardingStatusResponse(
        onboarding_completed=bool(current_user.onboarding_completed),
        survey=OnboardingSurveyResponse.model_validate(survey) if survey else None,
    )


@router.post("", response_model=OnboardingStatusResponse)
async def submit_onboarding_survey(
    payload: OnboardingSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save onboarding survey responses or record user skip, persisting to database."""
    # Find existing survey response if user is re-submitting or updating
    result = await db.execute(
        select(OnboardingSurvey).where(OnboardingSurvey.user_id == current_user.id)
    )
    survey = result.scalar_one_or_none()

    if survey:
        survey.role = payload.role
        survey.referral = payload.referral
        survey.volume = payload.volume
        survey.features = payload.features
        survey.is_skipped = payload.is_skipped
        survey.completed_at = func.now()
    else:
        import uuid
        survey = OnboardingSurvey(
            id=uuid.uuid4(),
            user_id=current_user.id,
            role=payload.role,
            referral=payload.referral,
            volume=payload.volume,
            features=payload.features,
            is_skipped=payload.is_skipped,
        )
        db.add(survey)

    current_user.onboarding_completed = True
    try:
        await db.commit()
    except Exception as exc:
        # Menangani race condition duplicate key (uq_onboarding_surveys_user_id)
        from sqlalchemy.exc import IntegrityError
        if isinstance(exc, IntegrityError) or "unique constraint" in str(exc).lower():
            await db.rollback()
            result = await db.execute(
                select(OnboardingSurvey).where(OnboardingSurvey.user_id == current_user.id)
            )
            survey = result.scalar_one_or_none()
            if survey:
                survey.role = payload.role
                survey.referral = payload.referral
                survey.volume = payload.volume
                survey.features = payload.features
                survey.is_skipped = payload.is_skipped
                survey.completed_at = func.now()
            current_user.onboarding_completed = True
            await db.commit()
        else:
            raise

    await db.refresh(survey)
    await db.refresh(current_user)

    return OnboardingStatusResponse(
        onboarding_completed=True,
        survey=OnboardingSurveyResponse.model_validate(survey),
    )
