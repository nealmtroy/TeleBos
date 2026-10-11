"""Pydantic schemas for onboarding survey and admin analytics."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class OnboardingSubmitRequest(BaseModel):
    role: str | None = Field(None, max_length=50)
    referral: str | None = Field(None, max_length=50)
    volume: str | None = Field(None, max_length=50)
    features: list[str] = Field(default_factory=list)
    is_skipped: bool = False


class OnboardingSurveyResponse(BaseModel):
    id: UUID | None = None
    user_id: UUID
    role: str | None = None
    referral: str | None = None
    volume: str | None = None
    features: list[str] = Field(default_factory=list)
    is_skipped: bool = False
    completed_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class OnboardingStatusResponse(BaseModel):
    onboarding_completed: bool
    survey: OnboardingSurveyResponse | None = None


class OnboardingRecentSurveyItem(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str
    user_full_name: str | None = None
    role: str | None = None
    referral: str | None = None
    volume: str | None = None
    features: list[str] = Field(default_factory=list)
    is_skipped: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class OnboardingAnalyticsResponse(BaseModel):
    total_users: int
    completed_count: int
    skipped_count: int
    pending_count: int
    completion_rate: float
    roles_breakdown: dict[str, int] = Field(default_factory=dict)
    referrals_breakdown: dict[str, int] = Field(default_factory=dict)
    volumes_breakdown: dict[str, int] = Field(default_factory=dict)
    features_breakdown: dict[str, int] = Field(default_factory=dict)
    recent_surveys: list[OnboardingRecentSurveyItem] = Field(default_factory=list)
