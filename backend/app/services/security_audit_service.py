"""Security & Audit Analytics Service — Tamper-resistant, sanitized security logging and analysis."""

from datetime import datetime, timedelta, timezone
import ipaddress
import logging
from typing import Any
import uuid

from fastapi import Request
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security_audit_log import SecurityAuditLog
from app.models.user import User

logger = logging.getLogger(__name__)

# Keys that must NEVER be stored in audit logs under ANY circumstances
FORBIDDEN_AUDIT_KEYS = {
    "password",
    "password_hash",
    "new_password",
    "old_password",
    "current_password",
    "twofa_password",
    "session_string",
    "token",
    "token_hash",
    "session_token",
    "secret",
    "api_secret",
    "key_secret",
    "app_secret_key",
    "encryption_key",
    "auth_token",
    "cookie",
    "otp",
    "code",
    "twofa_code",
    "recovery_code",
    "bearer",
    "authorization",
    "private_key",
    "credential",
}

# Trusted reverse proxies for client IP header resolution
_LOCAL_TRUSTED_PROXIES = {
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
}


def mask_phone_number(phone: str | None) -> str | None:
    """Mask phone number for privacy preservation (e.g. '+62812****7890')."""
    if not phone or len(phone) < 7:
        return phone
    prefix = phone[:5]
    suffix = phone[-4:]
    return f"{prefix}****{suffix}"


def get_safe_client_ip(request: Request | None) -> str:
    """Extract and strictly validate client IP address.

    Prevents IP spoofing via unvalidated X-Forwarded-For / X-Real-IP headers.
    Only inspects proxy headers if the direct socket peer is a verified trusted proxy,
    and requires syntactic validation of the forwarded IP via ipaddress parser.
    """
    if not request or not request.client or not request.client.host:
        return "127.0.0.1"

    peer_host = request.client.host.strip()

    try:
        peer_ip = ipaddress.ip_address(peer_host)
    except ValueError:
        return "unknown"

    # Check if direct peer is a trusted local/internal proxy
    is_trusted_proxy = any(peer_ip in net for net in _LOCAL_TRUSTED_PROXIES)

    if not is_trusted_proxy:
        # Not behind a proxy: direct peer IP is the only authoritative address
        return str(peer_ip)

    # Behind trusted proxy: inspect X-Forwarded-For or X-Real-IP
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the leftmost untrusted IP in the chain
        tokens = [t.strip() for t in forwarded_for.split(",") if t.strip()]
        for token in tokens:
            try:
                candidate = ipaddress.ip_address(token)
                # Ensure the candidate is not a corrupted or loopback dummy if real IP exists
                return str(candidate)
            except ValueError:
                continue

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        try:
            return str(ipaddress.ip_address(real_ip.strip()))
        except ValueError:
            pass

    return str(peer_ip)


def scrub_sensitive_metadata(data: dict[str, Any] | None) -> dict[str, Any]:
    """Recursively redact forbidden keys, mask identifiers, and prevent storage bloat."""
    if not data:
        return {}

    sanitized: dict[str, Any] = {}
    for key, value in data.items():
        lowered_key = key.lower()
        # Strictly discard any key containing sensitive credentials
        if any(forbidden in lowered_key for forbidden in FORBIDDEN_AUDIT_KEYS):
            continue

        if "phone" in lowered_key and isinstance(value, str):
            sanitized[key] = mask_phone_number(value)
        elif isinstance(value, dict):
            sanitized[key] = scrub_sensitive_metadata(value)
        elif isinstance(value, (list, tuple)):
            cleaned_list = []
            for item in value[:50]:  # limit array length
                if isinstance(item, dict):
                    cleaned_list.append(scrub_sensitive_metadata(item))
                elif isinstance(item, (int, float, bool)) or item is None:
                    cleaned_list.append(item)
                else:
                    str_item = str(item)
                    cleaned_list.append(str_item[:200] if len(str_item) > 200 else str_item)
            sanitized[key] = cleaned_list
        elif isinstance(value, (int, float, bool)) or value is None:
            sanitized[key] = value
        elif isinstance(value, (uuid.UUID, datetime)):
            sanitized[key] = str(value)
        elif isinstance(value, str):
            if len(value) > 500:
                sanitized[key] = value[:500] + "...[truncated]"
            else:
                sanitized[key] = value
        else:
            sanitized[key] = str(value)[:200]

    return sanitized


async def record_security_audit_event(
    db: AsyncSession,
    action: str,
    actor: User | None = None,
    actor_id: uuid.UUID | None = None,
    actor_email: str | None = None,
    actor_role: str | None = None,
    target_type: str = "system",
    target_id: str | None = None,
    target_label: str | None = None,
    outcome: str = "success",
    severity: str = "info",
    request: Request | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> SecurityAuditLog:
    """Record a structured, immutable security audit event with automatic redaction."""
    # Resolve actor information
    resolved_id = actor.id if actor else actor_id
    resolved_email = actor.email if actor else actor_email
    resolved_role = actor.role if actor else actor_role

    # Resolve IP and User-Agent
    resolved_ip = ip_address or get_safe_client_ip(request)
    resolved_ua = user_agent
    if not resolved_ua and request:
        ua_header = request.headers.get("user-agent")
        if ua_header:
            resolved_ua = ua_header[:250]

    # Redact sensitive parameters
    clean_metadata = scrub_sensitive_metadata(metadata)

    log_entry = SecurityAuditLog(
        id=uuid.uuid4(),
        actor_id=resolved_id,
        actor_email=resolved_email,
        actor_role=resolved_role,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else None,
        target_label=str(target_label) if target_label else None,
        outcome=outcome.lower().strip() if outcome else "success",
        severity=severity.lower().strip() if severity else "info",
        ip_address=resolved_ip,
        user_agent=resolved_ua,
        metadata_payload=clean_metadata,
        created_at=datetime.now(timezone.utc),
    )

    db.add(log_entry)
    logger.info(
        "Security audit: [%s] action=%s actor=%s target=%s outcome=%s ip=%s",
        severity,
        action,
        resolved_email or resolved_id or "anonymous",
        f"{target_type}:{target_label or target_id}",
        outcome,
        resolved_ip,
    )
    return log_entry


async def query_security_audit_logs(
    db: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    actor: str | None = None,
    action: str | None = None,
    outcome: str | None = None,
    severity: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[SecurityAuditLog], int]:
    """Search and paginate security audit logs with flexible criteria."""
    query = select(SecurityAuditLog)
    count_query = select(func.count(SecurityAuditLog.id))

    filters = []

    if start_date:
        filters.append(SecurityAuditLog.created_at >= start_date)
    if end_date:
        filters.append(SecurityAuditLog.created_at <= end_date)

    if actor:
        actor_term = actor.strip()
        try:
            actor_uuid = uuid.UUID(actor_term)
            filters.append(
                or_(
                    SecurityAuditLog.actor_id == actor_uuid,
                    SecurityAuditLog.actor_email.ilike(f"%{actor_term}%"),
                )
            )
        except ValueError:
            filters.append(SecurityAuditLog.actor_email.ilike(f"%{actor_term}%"))

    if action and action != "all":
        if "*" in action:
            prefix = action.replace("*", "")
            filters.append(SecurityAuditLog.action.startswith(prefix))
        else:
            filters.append(SecurityAuditLog.action == action)

    if outcome and outcome != "all":
        filters.append(SecurityAuditLog.outcome == outcome.lower())

    if severity and severity != "all":
        filters.append(SecurityAuditLog.severity == severity.lower())

    if search:
        search_term = f"%{search.strip()}%"
        filters.append(
            or_(
                SecurityAuditLog.actor_email.ilike(search_term),
                SecurityAuditLog.action.ilike(search_term),
                SecurityAuditLog.target_label.ilike(search_term),
                SecurityAuditLog.target_id.ilike(search_term),
                SecurityAuditLog.ip_address.ilike(search_term),
            )
        )

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    safe_page = max(1, page)
    safe_page_size = min(max(1, page_size), 100)
    offset = (safe_page - 1) * safe_page_size

    query = query.order_by(desc(SecurityAuditLog.created_at)).offset(offset).limit(safe_page_size)
    result = await db.execute(query)
    logs = list(result.scalars().all())

    return logs, total


async def get_security_analytics_summary(
    db: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """Calculate aggregated security KPIs, outcome distributions, and calibrated risk signals."""
    now = datetime.now(timezone.utc)
    cutoff = start_date or (now - timedelta(days=7))
    until = end_date or now

    # 1. Base counts & specific action aggregations
    base_stmt = select(SecurityAuditLog).where(
        SecurityAuditLog.created_at >= cutoff,
        SecurityAuditLog.created_at <= until,
    )

    total_count_res = await db.execute(
        select(func.count(SecurityAuditLog.id)).where(
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
    )
    total_events = total_count_res.scalar() or 0

    # Group by outcome
    outcome_q = (
        select(SecurityAuditLog.outcome, func.count(SecurityAuditLog.id))
        .where(
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
        .group_by(SecurityAuditLog.outcome)
    )
    outcome_res = await db.execute(outcome_q)
    outcome_breakdown = {str(row[0]): int(row[1]) for row in outcome_res.all()}

    # Group by severity
    severity_q = (
        select(SecurityAuditLog.severity, func.count(SecurityAuditLog.id))
        .where(
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
        .group_by(SecurityAuditLog.severity)
    )
    severity_res = await db.execute(severity_q)
    severity_breakdown = {str(row[0]): int(row[1]) for row in severity_res.all()}

    # Group by action (top 10)
    top_actions_q = (
        select(SecurityAuditLog.action, func.count(SecurityAuditLog.id))
        .where(
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
        .group_by(SecurityAuditLog.action)
        .order_by(desc(func.count(SecurityAuditLog.id)))
        .limit(10)
    )
    top_actions_res = await db.execute(top_actions_q)
    top_actions = [
        {"action": str(row[0]), "count": int(row[1])}
        for row in top_actions_res.all()
    ]

    # Specific category counters
    async def _count_action(action_name: str) -> int:
        res = await db.execute(
            select(func.count(SecurityAuditLog.id)).where(
                SecurityAuditLog.action == action_name,
                SecurityAuditLog.created_at >= cutoff,
                SecurityAuditLog.created_at <= until,
            )
        )
        return res.scalar() or 0

    async def _count_prefix(action_prefix: str) -> int:
        res = await db.execute(
            select(func.count(SecurityAuditLog.id)).where(
                SecurityAuditLog.action.startswith(action_prefix),
                SecurityAuditLog.created_at >= cutoff,
                SecurityAuditLog.created_at <= until,
            )
        )
        return res.scalar() or 0

    successful_logins = await _count_action("auth.login")
    failed_logins = await _count_action("auth.login_failed")
    password_changes = await _count_action("auth.password_changed")
    twofa_changes = await _count_prefix("auth.2fa_")
    api_key_actions = await _count_prefix("api_key.")
    role_changes = await _count_action("admin.role_changed")
    balance_adjustments = await _count_action("admin.balance_adjusted")
    sensitive_admin_actions = await _count_prefix("admin.")

    # 2. Suspicious Signals Detection (Calibrated, Evidence-based, No False Fraud Labels)
    suspicious_signals: list[dict[str, Any]] = []

    # Signal A: Excessive failed logins by IP in window (>= 5 failed attempts)
    failed_ip_q = (
        select(
            SecurityAuditLog.ip_address,
            func.count(SecurityAuditLog.id).label("fail_count"),
            func.max(SecurityAuditLog.created_at).label("last_seen"),
        )
        .where(
            SecurityAuditLog.action == "auth.login_failed",
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
            SecurityAuditLog.ip_address.isnot(None),
        )
        .group_by(SecurityAuditLog.ip_address)
        .having(func.count(SecurityAuditLog.id) >= 5)
        .order_by(desc("fail_count"))
        .limit(5)
    )
    failed_ip_res = await db.execute(failed_ip_q)
    for row in failed_ip_res.all():
        ip_addr, count, last_seen = row[0], int(row[1]), row[2]
        suspicious_signals.append({
            "signal_type": "elevated_failed_logins",
            "severity": "warning",
            "actor_identifier": ip_addr,
            "event_count": count,
            "evidence_summary": f"{count} percobaan login gagal terdeteksi dari IP {ip_addr}.",
            "recommended_action": "Tinjau traffic dari IP ini atau pantau apakah terjadi serangan brute-force.",
            "last_seen": last_seen.isoformat() if last_seen else None,
        })

    # Signal B: Multi-IP access on administrative owner accounts (>= 3 distinct IPs in window)
    admin_ips_q = (
        select(
            SecurityAuditLog.actor_email,
            func.count(func.distinct(SecurityAuditLog.ip_address)).label("ip_count"),
            func.max(SecurityAuditLog.created_at).label("last_seen"),
        )
        .where(
            SecurityAuditLog.actor_role == "owner",
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
            SecurityAuditLog.ip_address.isnot(None),
            SecurityAuditLog.actor_email.isnot(None),
        )
        .group_by(SecurityAuditLog.actor_email)
        .having(func.count(func.distinct(SecurityAuditLog.ip_address)) >= 3)
        .order_by(desc("ip_count"))
        .limit(5)
    )
    admin_ips_res = await db.execute(admin_ips_q)
    for row in admin_ips_res.all():
        email, ip_count, last_seen = row[0], int(row[1]), row[2]
        suspicious_signals.append({
            "signal_type": "multi_ip_admin_activity",
            "severity": "info",
            "actor_identifier": email,
            "event_count": ip_count,
            "evidence_summary": f"Akun administrator {email} aktif dari {ip_count} alamat IP berbeda dalam periode ini.",
            "recommended_action": "Konfirmasi kepada administrator terkait apakah menggunakan VPN atau jaringan multi-lokasi.",
            "last_seen": last_seen.isoformat() if last_seen else None,
        })

    # Signal C: Unauthorized admin access attempts (403 forbidden on admin endpoints)
    unauthorized_q = (
        select(
            SecurityAuditLog.actor_email,
            SecurityAuditLog.ip_address,
            func.count(SecurityAuditLog.id).label("attempts"),
            func.max(SecurityAuditLog.created_at).label("last_seen"),
        )
        .where(
            SecurityAuditLog.action == "security.unauthorized_access_attempt",
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
        .group_by(SecurityAuditLog.actor_email, SecurityAuditLog.ip_address)
        .order_by(desc("attempts"))
        .limit(5)
    )
    unauth_res = await db.execute(unauthorized_q)
    for row in unauth_res.all():
        email, ip_addr, count, last_seen = row[0], row[1], int(row[2]), row[3]
        suspicious_signals.append({
            "signal_type": "unauthorized_admin_access",
            "severity": "warning",
            "actor_identifier": email or ip_addr or "unknown",
            "event_count": count,
            "evidence_summary": f"{count} upaya akses ke endpoint terproteksi administrator tanpa izin yang memadai.",
            "recommended_action": "Verifikasi hak akses user atau periksa potensi scanning endpoint.",
            "last_seen": last_seen.isoformat() if last_seen else None,
        })

    # Signal D: Revoked API key usage
    revoked_key_q = (
        select(
            SecurityAuditLog.target_label,
            SecurityAuditLog.ip_address,
            func.count(SecurityAuditLog.id).label("attempts"),
            func.max(SecurityAuditLog.created_at).label("last_seen"),
        )
        .where(
            SecurityAuditLog.action == "security.revoked_api_key_used",
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
        .group_by(SecurityAuditLog.target_label, SecurityAuditLog.ip_address)
        .order_by(desc("attempts"))
        .limit(5)
    )
    revoked_res = await db.execute(revoked_key_q)
    for row in revoked_res.all():
        label, ip_addr, count, last_seen = row[0], row[1], int(row[2]), row[3]
        suspicious_signals.append({
            "signal_type": "revoked_api_key_attempt",
            "severity": "warning",
            "actor_identifier": label or ip_addr or "unknown",
            "event_count": count,
            "evidence_summary": f"{count} upaya permintaan menggunakan API key yang telah dicabut (prefix: {label}).",
            "recommended_action": "Perbarui kredensial pada integrasi klien yang memanggil endpoint tersebut.",
            "last_seen": last_seen.isoformat() if last_seen else None,
        })

    # 3. Timeseries breakdown (daily buckets)
    timeseries_q = (
        select(
            func.date_trunc("day", SecurityAuditLog.created_at).label("day_bucket"),
            func.count(SecurityAuditLog.id).label("total_count"),
            func.sum(
                case((SecurityAuditLog.outcome == "failure", 1), else_=0)
            ).label("fail_count"),
            func.sum(
                case((SecurityAuditLog.severity == "warning", 1), else_=0)
            ).label("warn_count"),
        )
        .where(
            SecurityAuditLog.created_at >= cutoff,
            SecurityAuditLog.created_at <= until,
        )
        .group_by("day_bucket")
        .order_by("day_bucket")
    )
    ts_res = await db.execute(timeseries_q)
    timeseries = [
        {
            "timestamp": row[0].strftime("%Y-%m-%d") if row[0] else "",
            "total_events": int(row[1] or 0),
            "failure_events": int(row[2] or 0),
            "warning_events": int(row[3] or 0),
        }
        for row in ts_res.all()
    ]

    return {
        "period_start": cutoff.isoformat(),
        "period_end": until.isoformat(),
        "total_events": total_events,
        "kpis": {
            "successful_logins": successful_logins,
            "failed_logins": failed_logins,
            "password_changes": password_changes,
            "twofa_changes": twofa_changes,
            "api_key_actions": api_key_actions,
            "role_changes": role_changes,
            "balance_adjustments": balance_adjustments,
            "sensitive_admin_actions": sensitive_admin_actions,
            "suspicious_events_count": len(suspicious_signals),
        },
        "outcome_breakdown": outcome_breakdown,
        "severity_breakdown": severity_breakdown,
        "top_actions": top_actions,
        "suspicious_signals": suspicious_signals,
        "timeseries": timeseries,
    }
