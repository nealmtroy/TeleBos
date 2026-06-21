"""Account statistics schema — contacts, groups, and channel counts."""

from datetime import datetime
from pydantic import BaseModel


class AccountStatsResponse(BaseModel):
    contacts_count: int = 0
    total_groups: int = 0
    owned_groups: int = 0
    total_channels: int = 0
    owned_channels: int = 0
    stats_updated_at: datetime | None = None
