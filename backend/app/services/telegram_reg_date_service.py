"""Service to estimate Telegram account registration dates and sync datapoints."""

import asyncio
import datetime
import logging
from uuid import UUID

from sqlalchemy import select
from app.database import async_session_factory
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import MessageService, MessageActionContactSignUp

from app.models.telegram_account import TelegramAccount
from app.models.telegram_registration_datapoint import TelegramRegistrationDatapoint
from app.utils.telethon_helpers import get_active_client

logger = logging.getLogger(__name__)


class TelegramRegDateService:
    """Estimates Telegram registration dates by interpolating between known user ID datapoints."""

    async def get_estimated_registration_date(self, db: AsyncSession, telegram_id: int) -> dict | None:
        """Estimate the creation date of a Telegram ID.

        Returns:
            dict containing:
                "status": "exact" | "approx" | "older_than" | "newer_than"
                "date": datetime of registration
                "age": human-readable age string
        """
        if not telegram_id:
            return None

        # 1. Check if exact match exists in database
        stmt = select(TelegramRegistrationDatapoint).where(TelegramRegistrationDatapoint.telegram_id == telegram_id)
        result = await db.execute(stmt)
        exact = result.scalar_one_or_none()
        if exact:
            return {
                "status": "exact",
                "date": exact.registered_at,
                "age": self.format_age(exact.registered_at),
            }

        # 2. Find closest lower ID
        stmt_lower = (
            select(TelegramRegistrationDatapoint)
            .where(TelegramRegistrationDatapoint.telegram_id < telegram_id)
            .order_by(TelegramRegistrationDatapoint.telegram_id.desc())
            .limit(1)
        )
        res_lower = await db.execute(stmt_lower)
        lower = res_lower.scalar_one_or_none()

        # 3. Find closest upper ID
        stmt_upper = (
            select(TelegramRegistrationDatapoint)
            .where(TelegramRegistrationDatapoint.telegram_id > telegram_id)
            .order_by(TelegramRegistrationDatapoint.telegram_id.asc())
            .limit(1)
        )
        res_upper = await db.execute(stmt_upper)
        upper = res_upper.scalar_one_or_none()

        # 4. Handle boundaries
        if not lower and not upper:
            return None

        if not lower:  # telegram_id is smaller than the min ID in DB
            # Use upper as the estimate but mark it as older_than
            return {
                "status": "older_than",
                "date": upper.registered_at,
                "age": self.format_age(upper.registered_at),
            }

        if not upper:  # telegram_id is larger than the max ID in DB
            # Use lower as the estimate but mark it as newer_than
            return {
                "status": "newer_than",
                "date": lower.registered_at,
                "age": self.format_age(lower.registered_at),
            }

        # 5. Linear interpolation
        lower_id = lower.telegram_id
        lower_ts = lower.registered_at.timestamp()

        upper_id = upper.telegram_id
        upper_ts = upper.registered_at.timestamp()

        if upper_id == lower_id:
            est_ts = lower_ts
        else:
            est_ts = lower_ts + ((telegram_id - lower_id) / (upper_id - lower_id)) * (upper_ts - lower_ts)

        est_date = datetime.datetime.fromtimestamp(est_ts, tz=datetime.timezone.utc)
        return {
            "status": "approx",
            "date": est_date,
            "age": self.format_age(est_date),
        }

    def format_age(self, date: datetime.datetime) -> str:
        """Convert a Date object to a human-readable age string."""
        now = datetime.datetime.now(datetime.timezone.utc)
        if date.tzinfo is None:
            date = date.replace(tzinfo=datetime.timezone.utc)
        months_diff = (now.year - date.year) * 12 + (now.month - date.month)
        if months_diff < 0:
            return "0 months"
        if months_diff < 12:
            return f"{months_diff} months"
        else:
            years = months_diff // 12
            remaining_months = months_diff % 12
            if remaining_months > 0:
                return f"{years} years, {remaining_months} months"
            return f"{years} years"

    async def sync_datapoints_from_account(self, db: AsyncSession, account_id: UUID, limit: int = 500) -> int:
        """Scan dialogues of a specific account for contact signup service messages

        and add them to the database as verified registration datapoints.
        """
        # Convert string to UUID object if needed
        if isinstance(account_id, str):
            account_id = UUID(account_id)

        account = await db.get(TelegramAccount, account_id)
        if not account:
            raise ValueError(f"Account not found for ID: {account_id}")

        client = await get_active_client(account)
        if not client:
            raise ValueError(f"Telegram client is not active for account: {account.phone}")

        added_count = 0
        try:
            logger.info("Scanning last %d dialogs for account %s for signups...", limit, account.phone)
            async for dialog in client.iter_dialogs(limit=limit):
                if dialog.is_user and dialog.id > 0:
                    msg = dialog.message
                    if msg and isinstance(msg, MessageService) and isinstance(msg.action, MessageActionContactSignUp):
                        telegram_id = dialog.id
                        
                        # Truncate time to midnight UTC to match dataset.json formatting exactly
                        date_only = msg.date.date()
                        registered_at = datetime.datetime.combine(
                            date_only, datetime.time.min, tzinfo=datetime.timezone.utc
                        )

                        # Check if this ID already exists
                        stmt = select(TelegramRegistrationDatapoint).where(
                            TelegramRegistrationDatapoint.telegram_id == telegram_id
                        )
                        result = await db.execute(stmt)
                        existing = result.scalar_one_or_none()
                        if not existing:
                            # Enforce monotonicity check to prevent contact sync date anomalies
                            # 1. Find closest lower ID in the database
                            stmt_low = (
                                select(TelegramRegistrationDatapoint)
                                .where(TelegramRegistrationDatapoint.telegram_id < telegram_id)
                                .order_by(TelegramRegistrationDatapoint.telegram_id.desc())
                                .limit(1)
                            )
                            res_low = await db.execute(stmt_low)
                            low_dp = res_low.scalar_one_or_none()

                            # 2. Find closest upper ID in the database
                            stmt_up = (
                                select(TelegramRegistrationDatapoint)
                                .where(TelegramRegistrationDatapoint.telegram_id > telegram_id)
                                .order_by(TelegramRegistrationDatapoint.telegram_id.asc())
                                .limit(1)
                            )
                            res_up = await db.execute(stmt_up)
                            up_dp = res_up.scalar_one_or_none()

                            is_monotonic = True
                            if low_dp and registered_at < low_dp.registered_at:
                                is_monotonic = False
                            if up_dp and registered_at > up_dp.registered_at:
                                is_monotonic = False

                            if not is_monotonic:
                                logger.warning(
                                    "Skipping non-monotonic sync datapoint: ID=%d, Date=%s (Bounds: %s to %s)",
                                    telegram_id,
                                    registered_at.date(),
                                    low_dp.registered_at.date() if low_dp else "None",
                                    up_dp.registered_at.date() if up_dp else "None",
                                )
                                continue

                            dp = TelegramRegistrationDatapoint(
                                telegram_id=telegram_id,
                                registered_at=registered_at,
                                source="sync",
                            )
                            db.add(dp)
                            added_count += 1
            if added_count > 0:
                await db.commit()
                logger.info("Successfully harvested %d new signup datapoints from %s", added_count, account.phone)
        except Exception as exc:
            logger.exception("Error scanning signup messages for account %s: %s", account.phone, exc)
            raise

        return added_count

    async def sync_all_accounts_reg_dates(self) -> int:
        """Sync Telegram registration date datapoints for all active accounts."""
        total_new_datapoints = 0

        # Phase 1: Short DB session to get account IDs
        account_ids = []
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(TelegramAccount.id).where(
                        TelegramAccount.is_active == True,
                        TelegramAccount.session_string != "",
                    )
                )
                account_ids = [row[0] for row in result.all()]
        except Exception as exc:
            logger.error("Reg date sync: failed to fetch accounts: %s", exc)
            return 0

        # Phase 2: Sync each account with its own short-lived session
        for account_id in account_ids:
            try:
                async with async_session_factory() as db:
                    count = await self.sync_datapoints_from_account(db, account_id, limit=500)
                    total_new_datapoints += count
            except ValueError as val_exc:
                # e.g., client not active/connected — normal situation, log as debug
                logger.debug("Reg date sync skipped for account %s: %s", account_id, val_exc)
            except Exception as exc:
                logger.warning("Reg date sync: error syncing account %s: %s", account_id, exc)
            
            # Delay to avoid flood limits
            await asyncio.sleep(5.0)

        if total_new_datapoints > 0:
            logger.info("Reg date sync: harvested %d new datapoints in total", total_new_datapoints)
        return total_new_datapoints


reg_date_service = TelegramRegDateService()
