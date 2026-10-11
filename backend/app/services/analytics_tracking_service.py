"""Analytics Tracking Service — Centralized, idempotent, sanitized event telemetry."""

from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import EventCategory

logger = logging.getLogger(__name__)

# Keys that must NEVER be persisted in telemetry payloads under any circumstances
_FORBIDDEN_PROPERTY_KEYS = {
    "password",
    "password_hash",
    "twofa_password",
    "session_string",
    "token",
    "token_hash",
    "secret",
    "app_secret_key",
    "encryption_key",
    "auth_token",
    "cookie",
    "api_key",
    "apikey",
}

_VALID_CATEGORIES = {c.value for c in EventCategory}


def mask_phone_number(phone: str | None) -> str | None:
    """Mask phone number for privacy preservation (e.g. '+62812****7890')."""
    if not phone or len(phone) < 7:
        return phone
    prefix = phone[:5]
    suffix = phone[-4:]
    return f"{prefix}****{suffix}"


def sanitize_event_properties(properties: dict[str, Any] | None) -> dict[str, Any]:
    """Recursively scrub sensitive keys and mask identifiers in event payloads."""
    if not properties:
        return {}

    sanitized: dict[str, Any] = {}
    for key, value in properties.items():
        lowered_key = key.lower()
        if any(forbidden in lowered_key for forbidden in _FORBIDDEN_PROPERTY_KEYS):
            continue  # Strip forbidden credential keys entirely

        if "phone" in lowered_key and isinstance(value, str):
            sanitized[key] = mask_phone_number(value)
        elif isinstance(value, dict):
            sanitized[key] = sanitize_event_properties(value)
        elif isinstance(value, (int, float, bool, str)) or value is None:
            # Enforce max length on strings to prevent unbounded JSON bloat
            if isinstance(value, str) and len(value) > 500:
                sanitized[key] = value[:500] + "...[truncated]"
            else:
                sanitized[key] = value
        elif isinstance(value, (uuid.UUID, datetime)):
            sanitized[key] = str(value)
        elif isinstance(value, (list, tuple)):
            sanitized[key] = [
                str(v) if isinstance(v, (uuid.UUID, datetime)) else v
                for v in value[:50]  # Limit array elements
            ]
        else:
            sanitized[key] = str(value)

    return sanitized


async def track_event(
    db: AsyncSession,
    event_name: str,
    category: str | EventCategory,
    user_id: uuid.UUID | None = None,
    properties: dict[str, Any] | None = None,
    dedup_key: str | None = None,
    check_db_dedup: bool = True,
) -> AnalyticsEvent | None:
    """Record an audit / telemetry event safely and idempotently.

    Parameters:
    -----------
    db:
        Active AsyncSession.
    event_name:
        Standard event identifier (e.g. 'account_connected', 'order_placed').
    category:
        High-level domain category ('product', 'financial', 'automation', 'account', 'subscription', 'system').
    user_id:
        Optional user UUID initiating the event.
    properties:
        Metadata payload (automatically sanitized before storage).
    dedup_key:
        Optional token to prevent double-counting on retries. If an event with this
        dedup_key already exists, the function returns the existing row without duplicating.
    check_db_dedup:
        Whether to query the database before inserting. For freshly minted UUIDs,
        this can be False to avoid extra roundtrips while preserving the DB unique constraint.

    Returns:
    --------
    AnalyticsEvent:
        Persisted or existing analytics event, or None if skipped/errored gracefully.
    """
    category_val = category.value if isinstance(category, EventCategory) else str(category).lower().strip()
    if category_val not in _VALID_CATEGORIES:
        logger.warning(
            "Ignored analytics event '%s' with invalid category '%s'. Must be one of %s",
            event_name,
            category_val,
            _VALID_CATEGORIES,
        )
        return None

    # Enforce safe naming conventions (letters, numbers, underscores)
    if not re.match(r"^[a-zA-Z0-9_]{2,64}$", event_name):
        logger.warning("Ignored analytics event with invalid name format: %s", event_name)
        return None

    # Idempotency / deduplication check
    if dedup_key and check_db_dedup:
        dedup_key = dedup_key.strip()
        existing_res = await db.execute(
            select(AnalyticsEvent).where(AnalyticsEvent.dedup_key == dedup_key)
        )
        existing = existing_res.scalar_one_or_none()
        if existing:
            logger.debug(
                "Analytics dedup hit: event '%s' with dedup_key '%s' already recorded.",
                event_name,
                dedup_key,
            )
            return existing

    cleaned_props = sanitize_event_properties(properties)

    event = AnalyticsEvent(
        id=uuid.uuid4(),
        user_id=user_id,
        event_category=category_val,
        event_name=event_name,
        properties=cleaned_props,
        dedup_key=dedup_key,
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)

    logger.debug(
        "Tracked analytics event: [%s] %s | user=%s | dedup=%s",
        category_val,
        event_name,
        user_id,
        dedup_key,
    )
    return event


# ── Standardized Dispatchers ───────────────────────────────────────────────────


async def track_user_registration(
    db: AsyncSession,
    user_id: uuid.UUID,
    email: str,
    role: str = "freetrial",
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="user_registered",
        category=EventCategory.PRODUCT,
        user_id=user_id,
        properties={"email": email, "role": role},
        dedup_key=f"user_reg:{user_id}",
    )


async def track_user_login(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: str | None = None,
) -> AnalyticsEvent | None:
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dedup = f"login:{user_id}:{session_id}" if session_id else f"daily_login:{user_id}:{today_str}"
    return await track_event(
        db=db,
        event_name="user_login",
        category=EventCategory.PRODUCT,
        user_id=user_id,
        properties={"login_date": today_str},
        dedup_key=dedup,
    )


async def track_account_connected(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    phone: str,
    username: str | None = None,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="account_connected",
        category=EventCategory.ACCOUNT,
        user_id=user_id,
        properties={
            "account_id": str(account_id),
            "phone": mask_phone_number(phone),
            "username": username,
        },
        dedup_key=f"account_connected:{account_id}",
    )


async def track_account_disconnected(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    phone: str,
    reason: str = "manual_disconnect",
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="account_disconnected",
        category=EventCategory.ACCOUNT,
        user_id=user_id,
        properties={
            "account_id": str(account_id),
            "phone": mask_phone_number(phone),
            "reason": reason,
        },
    )


async def track_account_deleted(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    phone: str,
    username: str | None = None,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="account_deleted",
        category=EventCategory.ACCOUNT,
        user_id=user_id,
        properties={
            "account_id": str(account_id),
            "phone": mask_phone_number(phone),
            "username": username,
        },
    )


async def track_account_session_expired(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    phone: str | None = None,
    reason: str = "session_expired",
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="account_session_expired",
        category=EventCategory.ACCOUNT,
        user_id=user_id,
        properties={
            "account_id": str(account_id),
            "phone": mask_phone_number(phone) if phone else None,
            "reason": reason,
        },
    )


async def track_account_connection_result(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    phone: str,
    success: bool,
    is_reconnect: bool = False,
    error_type: str | None = None,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="account_connection_attempt",
        category=EventCategory.ACCOUNT,
        user_id=user_id,
        properties={
            "account_id": str(account_id),
            "phone": mask_phone_number(phone),
            "success": success,
            "is_reconnect": is_reconnect,
            "error_type": error_type,
        },
    )


async def track_broadcast_cycle(
    db: AsyncSession,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    cycle_number: int,
    sent_count: int,
    fail_count: int,
    total_groups: int,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="broadcast_cycle_completed",
        category=EventCategory.AUTOMATION,
        user_id=user_id,
        properties={
            "job_id": str(job_id),
            "cycle_number": cycle_number,
            "sent_count": sent_count,
            "fail_count": fail_count,
            "total_groups": total_groups,
        },
        dedup_key=f"broadcast_cycle:{job_id}:{cycle_number}",
    )


async def track_invite_completion(
    db: AsyncSession,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    invited_count: int,
    fail_count: int,
    total_members: int,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="invite_job_completed",
        category=EventCategory.AUTOMATION,
        user_id=user_id,
        properties={
            "job_id": str(job_id),
            "invited_count": invited_count,
            "fail_count": fail_count,
            "total_members": total_members,
        },
        dedup_key=f"invite_job:{job_id}",
    )


async def track_financial_mutation(
    db: AsyncSession,
    user_id: uuid.UUID,
    ledger_id: uuid.UUID,
    amount: int,
    entry_type: str,
    category: str,
    reference_id: str | None = None,
    balance_before: int | None = None,
    balance_after: int | None = None,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name=f"wallet_{entry_type.lower()}",
        category=EventCategory.FINANCIAL,
        user_id=user_id,
        properties={
            "ledger_id": str(ledger_id),
            "amount": amount,
            "entry_type": entry_type,
            "category": category,
            "reference_id": reference_id,
            "balance_before": balance_before,
            "balance_after": balance_after,
        },
        dedup_key=f"ledger:{ledger_id}",
        check_db_dedup=False,
    )


async def track_order_placed(
    db: AsyncSession,
    user_id: uuid.UUID,
    order_id: uuid.UUID,
    service_id: int,
    service_name: str,
    quantity: int,
    total_price: int,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="smm_order_placed",
        category=EventCategory.FINANCIAL,
        user_id=user_id,
        properties={
            "order_id": str(order_id),
            "service_id": service_id,
            "service_name": service_name,
            "quantity": quantity,
            "total_price": total_price,
        },
        dedup_key=f"order_placed:{order_id}",
    )


async def track_order_refund(
    db: AsyncSession,
    user_id: uuid.UUID,
    order_id: uuid.UUID,
    refunded_amount: int,
    reason: str | None = None,
) -> AnalyticsEvent | None:
    return await track_event(
        db=db,
        event_name="smm_order_refunded",
        category=EventCategory.FINANCIAL,
        user_id=user_id,
        properties={
            "order_id": str(order_id),
            "refunded_amount": refunded_amount,
            "reason": reason,
        },
        dedup_key=f"order_refund:{order_id}",
    )


async def track_subscription_change(
    db: AsyncSession,
    user_id: uuid.UUID,
    old_role: str,
    new_role: str,
    reason: str,
    duration_days: int | None = None,
) -> AnalyticsEvent | None:
    now_ts = int(datetime.now(timezone.utc).timestamp())
    return await track_event(
        db=db,
        event_name="subscription_role_changed",
        category=EventCategory.SUBSCRIPTION,
        user_id=user_id,
        properties={
            "old_role": old_role,
            "new_role": new_role,
            "reason": reason,
            "duration_days": duration_days,
        },
        dedup_key=f"sub_change:{user_id}:{new_role}:{now_ts}",
    )


# ── Retention Policy ──────────────────────────────────────────────────────────


async def prune_ephemeral_events(
    db: AsyncSession,
    retention_days: int = 90,
) -> int:
    """Prune ephemeral automation and system events older than `retention_days`.

    Financial, subscription, and core product events are strictly excluded from
    deletion to preserve regulatory and audit trail integrity.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    stmt = (
        delete(AnalyticsEvent)
        .where(AnalyticsEvent.created_at < cutoff)
        .where(AnalyticsEvent.event_category.in_(["automation", "system"]))
    )
    result = await db.execute(stmt)
    deleted_count = result.rowcount or 0
    logger.info("Pruned %d ephemeral analytics events older than %d days.", deleted_count, retention_days)
    return deleted_count
