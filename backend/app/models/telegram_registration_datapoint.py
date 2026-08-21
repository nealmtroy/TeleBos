"""SQLAlchemy model for storing Telegram registration date datapoints."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TelegramRegistrationDatapoint(Base):
    __tablename__ = "telegram_registration_datapoints"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), default="seeded", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
