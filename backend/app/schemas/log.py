"""Pydantic schemas for broadcast logs."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BroadcastLogResponse(BaseModel):
    id: str
    job_id: str
    group_identifier: str
    group_name: Optional[str] = None
    sent_text: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    telegram_error_code: Optional[int] = None
    sent_at: datetime

    model_config = {"from_attributes": True}
