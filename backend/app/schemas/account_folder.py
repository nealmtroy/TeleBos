"""Account folder Pydantic schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class AccountFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class AccountFolderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class AccountFolderMembershipRequest(BaseModel):
    account_ids: list[str]


class AccountFolderResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    account_ids: list[UUID] = []

    model_config = {"from_attributes": True}


class AccountFolderListResponse(BaseModel):
    folders: list[AccountFolderResponse]
