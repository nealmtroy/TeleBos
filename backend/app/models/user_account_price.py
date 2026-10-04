"""TelegramIdPrefixPrice model — owner sets buy/sell price by telegram_id prefix.

Each prefix carries two prices so the platform margin is configured per prefix:

  prefix "7"  → sell_price = 5000, buy_price = 7000
                 (seller receives 5000, buyer pays 7000, margin 2000)
  prefix "1"  → sell_price = 4000, buy_price = 5500
  prefix "5"  → sell_price = 1500, buy_price = 2500

Matching rule: the LONGEST matching prefix wins. If none match, the global
SmmSetting ``account_sell_price`` / ``account_buy_price`` pair is used as the
fallback for the sell side; the buy side falls back to the global
``account_buy_price`` and is never allowed below the resolved sell price.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TelegramIdPrefixPrice(Base):
    """Owner-configured buy/sell prices for accounts whose telegram_id starts with a prefix."""
    __tablename__ = "telegram_id_prefix_prices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    id_prefix: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True,
    )
    sell_price: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=5500,
    )
    buy_price: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, default=None,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
