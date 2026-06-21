"""Order model for SMM panel orders."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    smm_order_id: Mapped[str | None] = mapped_column(String(50))  # Buzzerpanel order ID
    service_id: Mapped[int] = mapped_column(Integer, nullable=False)
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    data_target: Mapped[str] = mapped_column(Text, nullable=False)  # URL/username target
    quantity: Mapped[int] = mapped_column(BigInteger, default=1)
    price: Mapped[int] = mapped_column(BigInteger, default=0)  # Price per 1k or total
    total_price: Mapped[int] = mapped_column(BigInteger, default=0)  # Final price charged
    status: Mapped[str] = mapped_column(String(50), default="Pending")  # Pending, Processing, Partial, In progress, Error, Success
    start_count: Mapped[int | None] = mapped_column(Integer)
    remains: Mapped[int | None] = mapped_column(Integer)
    is_mass_order: Mapped[bool] = mapped_column(Boolean, default=False)
    mass_parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # For mass orders
    note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="orders")
