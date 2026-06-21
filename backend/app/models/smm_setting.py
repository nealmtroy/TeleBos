"""SMM global settings model — key/value store for admin-configurable SMM settings."""

from sqlalchemy import Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SmmSetting(Base):
    __tablename__ = "smm_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
