"""Main FastAPI application with middleware, routers, and lifespan."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import engine, Base, async_session_factory
from app.api import auth, accounts, chats, contacts, devices, broadcast, ws, invite, system, admin, admin_smm, orders, redeem, marketplace, admin_account_prices, account_folders
from app.api import settings as api_settings
from app.services.session_manager import session_manager

app_settings = get_settings()
logger = logging.getLogger(__name__)


class RealIPMiddleware:
    """ASGI Middleware to extract real client IP when behind Cloudflare or reverse proxies."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            headers = dict(scope.get("headers", []))
            # Cloudflare sends CF-Connecting-IP
            cf_ip = headers.get(b"cf-connecting-ip")
            if cf_ip:
                try:
                    ip_str = cf_ip.decode("utf-8").strip()
                    port = scope["client"][1] if scope.get("client") else 0
                    scope["client"] = (ip_str, port)
                except Exception:
                    pass
            else:
                # Fallback to X-Forwarded-For
                x_forwarded_for = headers.get(b"x-forwarded-for")
                if x_forwarded_for:
                    try:
                        ips = x_forwarded_for.decode("utf-8").split(",")
                        ip_str = ips[0].strip()
                        port = scope["client"][1] if scope.get("client") else 0
                        scope["client"] = (ip_str, port)
                    except Exception:
                        pass
        await self.app(scope, receive, send)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security hardening headers to every response."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"  # Deprecated — disables legacy XSS auditor

        # HSTS
        if app_settings.PRODUCTION:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        else:
            # Short max-age in dev so it's not cached by browsers
            response.headers["Strict-Transport-Security"] = "max-age=300; includeSubDomains"

        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; "  # Next.js needs these + Cloudflare Web Analytics
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' http://localhost:3000 ws: wss: https://cloudflareinsights.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Content-Security-Policy"] = csp.strip()
        return response


def _run_migrations(connection):
    """Apply idempotent schema migrations not covered by create_all."""
    from sqlalchemy import text, inspect

    inspector = inspect(connection)
    columns = [c["name"] for c in inspector.get_columns("broadcast_jobs")]

    if "loop_enabled" not in columns:
        connection.execute(
            text("ALTER TABLE broadcast_jobs ADD COLUMN loop_enabled BOOLEAN DEFAULT false NOT NULL")
        )

    # ── Broadcast jobs multi-account & randomized delay migrations ────────
    if "account_ids" not in columns:
        connection.execute(
            text("ALTER TABLE broadcast_jobs ADD COLUMN account_ids JSONB DEFAULT '[]'::jsonb")
        )
        if "account_id" in columns:
            connection.execute(
                text(
                    "UPDATE broadcast_jobs SET account_ids = jsonb_build_array(account_id::text) "
                    "WHERE account_id IS NOT NULL"
                )
            )
            connection.execute(text("ALTER TABLE broadcast_jobs ALTER COLUMN account_ids SET NOT NULL"))
            connection.execute(text("ALTER TABLE broadcast_jobs DROP COLUMN account_id"))
        else:
            connection.execute(text("ALTER TABLE broadcast_jobs ALTER COLUMN account_ids SET NOT NULL"))

    if "delay_randomized" not in columns:
        connection.execute(
            text(
                "ALTER TABLE broadcast_jobs "
                "ADD COLUMN delay_randomized BOOLEAN DEFAULT false NOT NULL"
            )
        )

    if "log_destination" not in columns:
        connection.execute(
            text(
                "ALTER TABLE broadcast_jobs "
                "ADD COLUMN log_destination VARCHAR(255) DEFAULT NULL"
            )
        )

    # ── Broadcast logs migrations ───────────────────────────────────────
    broadcast_logs_cols_info = inspector.get_columns("broadcast_logs")
    broadcast_logs_cols = [c["name"] for c in broadcast_logs_cols_info]
    if "account_id_used" not in broadcast_logs_cols:
        connection.execute(
            text(
                "ALTER TABLE broadcast_logs "
                "ADD COLUMN account_id_used UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL"
            )
        )

    # Widen group_identifier (was VARCHAR(500), some pasted blobs overflow it
    # and rolled back the whole broadcast transaction with
    # StringDataRightTruncationError).
    for col in broadcast_logs_cols_info:
        if col["name"] == "group_identifier":
            col_type = str(col.get("type", "")).upper()
            if "VARCHAR" in col_type or "CHARACTER VARYING" in col_type:
                connection.execute(
                    text(
                        "ALTER TABLE broadcast_logs "
                        "ALTER COLUMN group_identifier TYPE TEXT "
                        "USING group_identifier::TEXT"
                    )
                )
            break

    # ── Telegram account columns (auto-reply, cached stats, spam) ────────
    acct_cols = [c["name"] for c in inspector.get_columns("telegram_accounts")]

    # ── Auto-reply columns on telegram_accounts ──────────────────────────
    if "auto_reply_enabled" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts "
                "ADD COLUMN auto_reply_enabled BOOLEAN DEFAULT false NOT NULL"
            )
        )
    if "auto_reply_text" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts "
                "ADD COLUMN auto_reply_text TEXT DEFAULT NULL"
            )
        )

    # ── Cached stats columns on telegram_accounts ──────────────────────────
    if "contacts_count" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN contacts_count BIGINT DEFAULT 0 NOT NULL")
        )
    if "total_groups" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN total_groups BIGINT DEFAULT 0 NOT NULL")
        )
    if "owned_groups" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN owned_groups BIGINT DEFAULT 0 NOT NULL")
        )
    if "total_channels" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN total_channels BIGINT DEFAULT 0 NOT NULL")
        )
    if "owned_channels" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN owned_channels BIGINT DEFAULT 0 NOT NULL")
        )
    if "stats_updated_at" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN stats_updated_at TIMESTAMPTZ DEFAULT NULL")
        )

    # ── Spam limit columns on telegram_accounts ──────────────────────────
    if "spam_status" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts "
                "ADD COLUMN spam_status VARCHAR(50) DEFAULT 'unknown' NOT NULL"
            )
        )
    if "spam_detail" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts "
                "ADD COLUMN spam_detail TEXT DEFAULT NULL"
            )
        )
    if "spam_last_checked_at" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts "
                "ADD COLUMN spam_last_checked_at TIMESTAMPTZ DEFAULT NULL"
            )
        )

    # ── Profile photo ID for change detection ─────────────────────────────
    if "profile_photo_id" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts "
                "ADD COLUMN profile_photo_id BIGINT DEFAULT NULL"
            )
        )

    # ── Marketplace columns on telegram_accounts ──────────────────────────
    if "for_sale" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN for_sale BOOLEAN DEFAULT false NOT NULL")
        )
    if "is_sold" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN is_sold BOOLEAN DEFAULT false NOT NULL")
        )
    if "seller_id" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN seller_id UUID REFERENCES users(id) ON DELETE SET NULL")
        )
    if "sold_at" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN sold_at TIMESTAMPTZ DEFAULT NULL")
        )
    if "recovery_email" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN recovery_email VARCHAR(255) DEFAULT NULL")
        )

    # ── Auto-reply logs table ───────────────────────────────────────────
    tables = inspector.get_table_names()
    if "auto_reply_logs" not in tables:
        connection.execute(
            text(
                "CREATE TABLE auto_reply_logs ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  account_id UUID NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE,"
                "  sender_id BIGINT NOT NULL,"
                "  replied_at TIMESTAMPTZ DEFAULT now(),"
                "  UNIQUE (account_id, sender_id)"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX ix_auto_reply_logs_sender "
                "ON auto_reply_logs (account_id, sender_id)"
            )
        )

    # ── Invite jobs table ─────────────────────────────────────────────
    if "invite_jobs" not in tables:
        connection.execute(
            text(
                "CREATE TABLE invite_jobs ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  account_ids JSONB NOT NULL DEFAULT '[]',"
                "  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                "  destination_group VARCHAR(500) NOT NULL,"
                "  destination_type VARCHAR(20) NOT NULL DEFAULT 'username',"
                "  source_groups JSONB NOT NULL DEFAULT '[]',"
                "  status VARCHAR(20) DEFAULT 'pending',"
                "  total_members INTEGER DEFAULT 0,"
                "  invited_count INTEGER DEFAULT 0,"
                "  already_member_count INTEGER DEFAULT 0,"
                "  fail_count INTEGER DEFAULT 0,"
                "  skip_count INTEGER DEFAULT 0,"
                "  progress INTEGER DEFAULT 0,"
                "  delay_per_invite INTEGER DEFAULT 30,"
                "  delay_per_batch INTEGER DEFAULT 60,"
                "  batch_size INTEGER DEFAULT 5,"
                "  created_at TIMESTAMPTZ DEFAULT now(),"
                "  updated_at TIMESTAMPTZ DEFAULT now(),"
                "  completed_at TIMESTAMPTZ"
                ")"
            )
        )
    else:
        invite_jobs_cols = [c["name"] for c in inspector.get_columns("invite_jobs")]
        if "account_ids" not in invite_jobs_cols:
            connection.execute(text("ALTER TABLE invite_jobs ADD COLUMN account_ids JSONB DEFAULT '[]'::jsonb"))
            if "account_id" in invite_jobs_cols:
                connection.execute(text("UPDATE invite_jobs SET account_ids = jsonb_build_array(account_id::text) WHERE account_id IS NOT NULL"))
                connection.execute(text("ALTER TABLE invite_jobs ALTER COLUMN account_ids SET NOT NULL"))
                connection.execute(text("ALTER TABLE invite_jobs DROP COLUMN account_id"))
            else:
                connection.execute(text("ALTER TABLE invite_jobs ALTER COLUMN account_ids SET NOT NULL"))

    # ── Invite logs table ─────────────────────────────────────────────
    if "invite_logs" not in tables:
        connection.execute(
            text(
                "CREATE TABLE invite_logs ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  job_id UUID NOT NULL REFERENCES invite_jobs(id) ON DELETE CASCADE,"
                "  account_id_used UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL,"
                "  user_id_tg BIGINT NOT NULL,"
                "  username VARCHAR(255),"
                "  first_name VARCHAR(255),"
                "  source_group VARCHAR(500) NOT NULL,"
                "  status VARCHAR(20) NOT NULL,"
                "  error_type VARCHAR(50),"
                "  error_message TEXT,"
                "  invited_at TIMESTAMPTZ DEFAULT now()"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX ix_invite_logs_job "
                "ON invite_logs (job_id)"
            )
        )
    else:
        invite_logs_cols = [c["name"] for c in inspector.get_columns("invite_logs")]
        if "account_id_used" not in invite_logs_cols:
            connection.execute(
                text(
                    "ALTER TABLE invite_logs "
                    "ADD COLUMN account_id_used UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL"
                )
            )

    # ── Account audit logs table ──────────────────────────────────────
    if "account_audit_logs" not in tables:
        connection.execute(
            text(
                "CREATE TABLE account_audit_logs ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                "  account_id UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL,"
                "  action VARCHAR(20) NOT NULL,"
                "  price BIGINT NOT NULL,"
                "  phone VARCHAR(50),"
                "  telegram_id BIGINT,"
                "  created_at TIMESTAMPTZ DEFAULT now()"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX ix_account_audit_logs_user_id "
                "ON account_audit_logs (user_id)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX ix_account_audit_logs_account_id "
                "ON account_audit_logs (account_id)"
            )
        )

    # ── Telegram ID prefix prices table ─────────────────────────────
    if "telegram_id_prefix_prices" not in tables:
        connection.execute(
            text(
                "CREATE TABLE telegram_id_prefix_prices ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  id_prefix VARCHAR(20) NOT NULL,"
                "  sell_price BIGINT NOT NULL DEFAULT 5500,"
                "  note TEXT,"
                "  created_at TIMESTAMPTZ DEFAULT now(),"
                "  updated_at TIMESTAMPTZ DEFAULT now()"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX ix_telegram_id_prefix_prices_prefix "
                "ON telegram_id_prefix_prices (id_prefix)"
            )
        )

    # ── Performance Indexes ───────────────────────────────────────────
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_telegram_accounts_user_id ON telegram_accounts (user_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_chat_folders_account_id ON chat_folders (account_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_group_lists_user_id ON group_lists (user_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_text_lists_user_id ON text_lists (user_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_broadcast_jobs_user_id ON broadcast_jobs (user_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_invite_jobs_user_id ON invite_jobs (user_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_broadcast_logs_job_sent ON broadcast_logs (job_id, sent_at)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_broadcast_logs_account_used ON broadcast_logs (account_id_used)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_invite_logs_job_invited ON invite_logs (job_id, invited_at)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_invite_logs_account_used ON invite_logs (account_id_used)")
    )

    # ── Account folders ──────────────────────────────────────────────────
    if "account_folders" not in tables:
        connection.execute(
            text(
                "CREATE TABLE account_folders ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                "  name VARCHAR(100) NOT NULL,"
                "  created_at TIMESTAMPTZ DEFAULT now(),"
                "  updated_at TIMESTAMPTZ DEFAULT now()"
                ")"
            )
        )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_account_folders_user_id ON account_folders (user_id)")
    )

    if "account_folder_members" not in tables:
        connection.execute(
            text(
                "CREATE TABLE account_folder_members ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  folder_id UUID NOT NULL REFERENCES account_folders(id) ON DELETE CASCADE,"
                "  account_id UUID NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_uq_folder_account "
                "ON account_folder_members (folder_id, account_id)"
            )
        )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_account_folder_members_folder ON account_folder_members (folder_id)")
    )
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_account_folder_members_account ON account_folder_members (account_id)")
    )

    # ── User balance & role migrations ────────────────────────────────
    user_cols = [c["name"] for c in inspector.get_columns("users")]
    if "balance" not in user_cols:
        connection.execute(
            text("ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0 NOT NULL")
        )
    if "subscription_expires_at" not in user_cols:
        connection.execute(
            text("ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMPTZ DEFAULT NULL")
        )
    if "telegram_chat_id" not in user_cols:
        connection.execute(
            text("ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT UNIQUE DEFAULT NULL")
        )

    # ── SMM services schema fixes ───────────────────────────────────────
    if "smm_services" in tables:
        smm_cols = [c["name"] for c in inspector.get_columns("smm_services")]
        if "speed" in smm_cols:
            col_type = next(c["type"] for c in inspector.get_columns("smm_services") if c["name"] == "speed")
            # API returns long descriptions like "Jumlah Order Selesai ... 21 Hari 17 Jam 52 Menit"
            if hasattr(col_type, "length") and col_type.length == 50:
                connection.execute(text("ALTER TABLE smm_services ALTER COLUMN speed TYPE TEXT"))
        # API prices can exceed 32-bit INTEGER (e.g. 225486227451)
        for col in ["original_price", "selling_price"]:
            if col in smm_cols:
                col_type = next(c["type"] for c in inspector.get_columns("smm_services") if c["name"] == col)
                if str(col_type) == "INTEGER":
                    connection.execute(text(f"ALTER TABLE smm_services ALTER COLUMN {col} TYPE BIGINT"))

    # ── Orders table ─────────────────────────────────────────────────
    if "orders" not in tables:
        connection.execute(
            text(
                "CREATE TABLE orders ("
                "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                "  smm_order_id VARCHAR(50),"
                "  service_id INTEGER NOT NULL,"
                "  service_name VARCHAR(255) NOT NULL,"
                "  category VARCHAR(100) NOT NULL,"
                "  data_target TEXT NOT NULL,"
                "  quantity BIGINT DEFAULT 1,"
                "  price BIGINT DEFAULT 0,"
                "  total_price BIGINT DEFAULT 0,"
                "  status VARCHAR(50) DEFAULT 'Pending',"
                "  start_count INTEGER,"
                "  remains INTEGER,"
                "  is_mass_order BOOLEAN DEFAULT false,"
                "  mass_parent_id UUID,"
                "  note TEXT,"
                "  created_at TIMESTAMPTZ DEFAULT now(),"
                "  updated_at TIMESTAMPTZ DEFAULT now()"
                ")"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders (user_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status)")
        )

    # Migrate existing orders price columns if still INTEGER
    if "orders" in tables:
        orders_cols = [c["name"] for c in inspector.get_columns("orders")]
        for col in ["price", "total_price"]:
            if col in orders_cols:
                col_type = next(c["type"] for c in inspector.get_columns("orders") if c["name"] == col)
                if str(col_type) == "INTEGER":
                    connection.execute(text(f"ALTER TABLE orders ALTER COLUMN {col} TYPE BIGINT"))


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Suppress verbose Telethon logs
# - telethon.client.users: PersistentTimestampOutdatedError spam from
#   GetChannelDifferenceRequest when Telegram's internal state diverges
logging.getLogger("telethon").setLevel(logging.WARNING)
logging.getLogger("telethon.client.users").setLevel(logging.ERROR)
logging.getLogger("telethon.client.updates").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    # Startup
    logger.info("Starting TeleBos API...")

    # 1. Verify encryption key on startup
    from app.utils.encryption import _get_cipher
    try:
        _get_cipher()
    except Exception as e:
        logger.critical("Encryption key verification failed: %s", e)
        raise

    # Ensure upload directories exist
    import os
    os.makedirs(os.path.join(os.path.dirname(__file__), "uploads", "profile_photos"), exist_ok=True)

    # Create tables (in production use Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run pending schema migrations (idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(_run_migrations)

    await session_manager.start()

    # Auto-reconnect all active accounts and attach real-time event handlers
    async with async_session_factory() as db:
        reconnected = await session_manager.reconnect_all(db)
        logger.info("Auto-reconnected %d accounts with real-time handlers", reconnected)
        
        # Resume any running broadcast jobs
        from app.services.broadcast_service import resume_running_broadcasts_on_startup
        resumed = await resume_running_broadcasts_on_startup(db)
        logger.info("Auto-resumed %d running broadcast jobs", resumed)

        # Seed: ensure nealmtroy@gmail.com is owner
        from sqlalchemy import select
        from app.models.user import User
        result = await db.execute(select(User).where(User.email == "nealmtroy@gmail.com"))
        owner_user = result.scalar_one_or_none()
        if owner_user and owner_user.role != "owner":
            owner_user.role = "owner"
            logger.info("Promoted nealmtroy@gmail.com to owner")
        await db.commit()

    # Start UptimeRobot background refresh (10-minute interval)
    from app.services.uptimerobot_status import uptimerobot_service
    uptimerobot_service.start_background_refresh()

    # 2. Spawn background cleanup for pending logins
    import asyncio
    from app.api.accounts import clean_pending_logins_task
    cleanup_task = asyncio.create_task(clean_pending_logins_task())

    # 3. Spawn background stats updater (runs daily)
    from app.services.stats_service import background_stats_updater
    stats_updater_task = asyncio.create_task(background_stats_updater())

    # 4. Spawn profile sync background loop (checks every 5 minutes)
    from app.services.profile_sync_service import sync_all_profiles

    async def _profile_sync_loop():
        """Periodically sync Telegram profile changes."""
        await asyncio.sleep(60)  # Initial delay — let accounts connect first
        while True:
            try:
                await sync_all_profiles()
            except Exception as exc:
                logger.warning("Profile sync loop error: %s", exc)
            await asyncio.sleep(300)  # Every 5 minutes

    profile_sync_task = asyncio.create_task(_profile_sync_loop())
    logger.info("Profile sync background task started (5-min interval)")

    yield
    # Shutdown
    logger.info("Shutting down TeleBos API...")

    # 3. Cancel background tasks
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    stats_updater_task.cancel()
    try:
        await stats_updater_task
    except asyncio.CancelledError:
        pass

    profile_sync_task.cancel()
    try:
        await profile_sync_task
    except asyncio.CancelledError:
        pass

    # 4. Close Redis client connection
    from app.utils.redis import redis_client
    await redis_client.close()

    await session_manager.stop()
    await engine.dispose()



app = FastAPI(
    title=app_settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# Trusted host — prevents Host header injection
# Extract hostnames from CORS origins (strip scheme:// and trailing /)
_allowed_hosts: list[str] = []
for origin in app_settings.CORS_ORIGINS:
    if origin == "*":
        _allowed_hosts = ["*"]
        break
    host = origin.removeprefix("https://").removeprefix("http://").rstrip("/")
    if ":" in host:
        host = host.split(":")[0]
    _allowed_hosts.append(host)
    _allowed_hosts.append(f"{host}:8000")
    _allowed_hosts.append(f"{host}:3000")

if "*" not in _allowed_hosts:
    _allowed_hosts.extend([
        "localhost", 
        "127.0.0.1", 
        "localhost:8000", 
        "localhost:3000", 
        "backend", 
        "backend:8000",
        "frontend",
        "frontend:3000"
    ])
    # Allow all hosts in debug/non-production to support arbitrary VPS IPs and tunnels seamlessly
    if app_settings.DEBUG or not app_settings.PRODUCTION:
        # Reject obviously spoofed Host headers but allow common tunnel services
        # to keep development ergonomic on arbitrary VPS IPs and tunnels.
        _allowed_hosts.extend([
            "*.trycloudflare.com",
            "*.ngrok-free.app",
        ])

# Add RealIPMiddleware to parse correct client IPs when behind Cloudflare/reverse proxy
app.add_middleware(RealIPMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With",
        "x-better-auth-token",
    ],
)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(accounts.router, prefix="/api/v1")
app.include_router(chats.router, prefix="/api/v1")
app.include_router(contacts.router, prefix="/api/v1")
app.include_router(devices.router, prefix="/api/v1")
app.include_router(api_settings.router, prefix="/api/v1")
app.include_router(broadcast.router, prefix="/api/v1")
app.include_router(invite.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(marketplace.router, prefix="/api/v1")
app.include_router(redeem.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(admin_smm.router, prefix="/api/v1")
app.include_router(admin_account_prices.router, prefix="/api/v1")
app.include_router(account_folders.router, prefix="/api/v1")
app.include_router(ws.router)
app.include_router(system.router)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "app": app_settings.APP_NAME}
