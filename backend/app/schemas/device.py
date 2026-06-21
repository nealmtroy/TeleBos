"""Pydantic schemas for devices."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DeviceResponse(BaseModel):
    hash: str
    device_name: str
    app_name: str
    app_version: Optional[str] = None
    platform: Optional[str] = None
    system_version: Optional[str] = None
    ip: Optional[str] = None
    country: Optional[str] = None
    first_login_date: Optional[datetime] = None
