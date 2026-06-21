"""SMM Service model — cached SMM panel services with admin overrides."""

from datetime import datetime

from sqlalchemy import Boolean, BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SmmService(Base):
    __tablename__ = "smm_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    """SMM API service_id — same as the upstream panel's service ID."""

    service_id: Mapped[int] = mapped_column(Integer, nullable=False)
    """Readable service ID mirror. Same as `id` for convenience."""

    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    original_price: Mapped[int] = mapped_column(BigInteger, default=0)
    """Price from the SMM panel per 1k units."""

    selling_price: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    """Admin-overridden selling price. If None, uses original_price + global markup."""

    min_qty: Mapped[int] = mapped_column(Integer, default=1)
    max_qty: Mapped[int] = mapped_column(Integer, default=999999)
    note: Mapped[str | None] = mapped_column(Text)
    speed: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    """If False, the service cannot be ordered by anyone."""

    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    """If False, hidden from the user-facing services list."""

    markup_percent: Mapped[int] = mapped_column(Integer, default=0)
    """Per-service markup percentage over original_price."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
