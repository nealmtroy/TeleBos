"""TelegramIdPrefixPrice model — owner sets sell price by telegram_id prefix.

Example:
  prefix "7"  → sell_price = 6000  (matches 7780645374, 7780645372, …)
  prefix "1"  → sell_price = 5000  (matches 1197078139, …)
  prefix "5"  → sell_price = 2000  (matches 5720511596, …)

Matching rule: the LONGEST matching prefix wins. If none match, the
global SmmSetting account_sell_price is used as fallback.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TelegramIdPrefixPrice(Base):
    """Owner-configured sell price for all accounts whose telegram_id starts with a given prefix."""
    __tablename__ = "telegram_id_prefix_prices"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    id_prefix: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True,
    )
    sell_price: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=5500,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
