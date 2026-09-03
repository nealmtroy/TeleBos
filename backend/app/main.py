"""Main FastAPI application with middleware, routers, and lifespan."""

import ipaddress
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBearer


_MAX_PUBLIC_SCHEMA_PATH_PREFIX = "/api/public/v1/"


def _build_public_openapi(app: FastAPI) -> dict:
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )
    schema["paths"] = {
        path: operations
        for path, operations in schema.get("paths", {}).items()
        if path.startswith(_MAX_PUBLIC_SCHEMA_PATH_PREFIX)
    }
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["HTTPBearer"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "TeleBos API key",
        "description": "Use a scoped integration key in the Authorization header.",
    }
    for operations in schema["paths"].values():
        for operation in operations.values():
            if isinstance(operation, dict) and operation.get("tags") == ["public-api"]:
                operation["security"] = [{"HTTPBearer": []}]
    return schema


public_api_bearer = HTTPBearer(
    auto_error=False,
    description="Scoped TeleBos integration API key. Use Authorization: Bearer tb_live_...",
)


from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import engine, Base, async_session_factory
from app.api import (
    auth,
    accounts,
    chats,
    contacts,
    devices,
    broadcast,
    ws,
    invite,
    system,
    admin,
    admin_smm,
    orders,
    redeem,
    marketplace,
    admin_account_prices,
    account_folders,
    messages,
    media,
    reactions,
    pins,
    group_admin,
    stickers,
    polls,
    forward,
    gifs,
    public,
    api_keys,
    notifications,
    telegram_reg_date,
)
from app.api import settings as api_settings
from app.services.session_manager import session_manager

app_settings = get_settings()
logger = logging.getLogger(__name__)


# Cloudflare IPv4 ranges — https://www.cloudflare.com/ips-v4/
# Cloudflare IPv6 ranges — https://www.cloudflare.com/ips-v6/
# Last updated: 2025-01-15 — review periodically at https://www.cloudflare.com/ips/
CLOUDFLARE_IP_RANGES: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    # IPv4
    ipaddress.ip_network("173.245.48.0/20"),
    ipaddress.ip_network("103.21.244.0/22"),
    ipaddress.ip_network("103.22.200.0/22"),
    ipaddress.ip_network("103.31.4.0/22"),
    ipaddress.ip_network("141.101.64.0/18"),
    ipaddress.ip_network("108.162.192.0/18"),
    ipaddress.ip_network("190.93.240.0/20"),
    ipaddress.ip_network("188.114.96.0/20"),
    ipaddress.ip_network("197.234.240.0/22"),
    ipaddress.ip_network("198.41.128.0/17"),
    ipaddress.ip_network("162.158.0.0/15"),
    ipaddress.ip_network("104.16.0.0/13"),
    ipaddress.ip_network("104.24.0.0/14"),
    ipaddress.ip_network("172.64.0.0/13"),
    ipaddress.ip_network("131.0.72.0/22"),
    # IPv6
    ipaddress.ip_network("2400:cb00::/32"),
    ipaddress.ip_network("2606:4700::/32"),
    ipaddress.ip_network("2803:f800::/32"),
    ipaddress.ip_network("2405:b500::/32"),
    ipaddress.ip_network("2405:8100::/32"),
    ipaddress.ip_network("2a06:98c0::/29"),
    ipaddress.ip_network("2c0f:f248::/32"),
]


def _build_trusted_cidrs() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    """Build the combined trusted proxy CIDR list from Cloudflare ranges + config."""
    cidrs = list(CLOUDFLARE_IP_RANGES)
    try:
        extra = app_settings.TRUSTED_PROXIES
        for cidr_str in extra:
            cidr_str = cidr_str.strip()
            if cidr_str:
                cidrs.append(ipaddress.ip_network(cidr_str, strict=False))
    except Exception as exc:
        logger.warning("Failed to parse TRUSTED_PROXIES config: %s", exc)
    return cidrs


def _is_trusted_proxy(
    ip_str: str,
    trusted_cidrs: list[ipaddress.IPv4Network | ipaddress.IPv6Network],
) -> bool:
    """Check if an IP address belongs to a trusted proxy range."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in cidr for cidr in trusted_cidrs)
    except ValueError:
        return False


class RealIPMiddleware:
    """ASGI Middleware to extract real client IP when behind Cloudflare or reverse proxies.

    Only trusts proxy headers (CF-Connecting-IP, X-Forwarded-For) when the
    actual TCP connection IP belongs to a known trusted proxy (Cloudflare
    published ranges + operator-configured TRUSTED_PROXIES).

    Untrusted requests that send proxy headers are logged as potential
    spoofing attempts.
    """

    def __init__(self, app):
        self.app = app
        self.trusted_cidrs = _build_trusted_cidrs()
        logger.info(
            "RealIPMiddleware initialised with %d trusted CIDR ranges",
            len(self.trusted_cidrs),
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope.get("client"):
            original_ip = scope["client"][0]
            original_port = scope["client"][1]

            if not _is_trusted_proxy(original_ip, self.trusted_cidrs):
                # Connecting IP is not a trusted proxy — ignore all proxy headers.
                # Log if the request tried to sneak in proxy headers (potential attack).
                headers = dict(scope.get("headers", []))
                if headers.get(b"cf-connecting-ip") or headers.get(b"x-forwarded-for"):
                    logger.warning(
                        "Untrusted IP %s sent proxy headers — ignoring "
                        "(potential IP spoofing attempt)",
                        original_ip,
                    )
                await self.app(scope, receive, send)
                return

            # Connecting IP is trusted — safe to read proxy headers
            headers = dict(scope.get("headers", []))

            # Cloudflare sends CF-Connecting-IP
            cf_ip = headers.get(b"cf-connecting-ip")
            if cf_ip:
                try:
                    ip_str = cf_ip.decode("utf-8").strip()
                    # Basic validation: must be a valid IP address
                    ipaddress.ip_address(ip_str)
                    scope["client"] = (ip_str, original_port)
                except (ValueError, UnicodeDecodeError):
                    pass
            else:
                # Fallback to X-Forwarded-For — walk right-to-left
                x_forwarded_for = headers.get(b"x-forwarded-for")
                if x_forwarded_for:
                    try:
                        ips = [ip.strip() for ip in x_forwarded_for.decode("utf-8").split(",")]
                        # Walk right-to-left: first non-trusted IP is the real client
                        for ip_str in reversed(ips):
                            if not _is_trusted_proxy(ip_str, self.trusted_cidrs):
                                # Validate it's a real IP before using it
                                ipaddress.ip_address(ip_str)
                                scope["client"] = (ip_str, original_port)
                                break
                    except (ValueError, UnicodeDecodeError):
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
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        else:
            # Short max-age in dev so it's not cached by browsers
            response.headers["Strict-Transport-Security"] = "max-age=300; includeSubDomains"

        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://cdn.jsdelivr.net; "  # Next.js needs these + Cloudflare Web Analytics + FastAPI docs
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: blob: https://api.qrserver.com https://fastapi.tiangolo.com; "
            "font-src 'self' data:; "
            "connect-src 'self' http://localhost:3000 ws: wss: https://cloudflareinsights.com https://cdn.jsdelivr.net; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Content-Security-Policy"] = csp.strip()
        return response


from app.database_migrator import run_migrations


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
        await conn.run_sync(run_migrations)

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

    # 4. Spawn cached 2FA metadata updater (runs every 6 hours)
    from app.services.twofa_sync_service import background_twofa_updater

    twofa_sync_task = asyncio.create_task(background_twofa_updater())

    # 5. Spawn background schedulers (adaptive sync, SMM services, SMM orders polling)
    from app.schedulers.background_tasks import (
        adaptive_sequential_sync_loop,
        smm_services_sync_loop,
        smm_orders_poll_loop,
    )

    adaptive_sync_task = asyncio.create_task(adaptive_sequential_sync_loop())
    logger.info("Adaptive sequential background sync task started (coalesced loop)")

    smm_sync_task = asyncio.create_task(smm_services_sync_loop())
    logger.info("SMM services background sync task started (12-hour interval)")

    smm_orders_poll_task = asyncio.create_task(smm_orders_poll_loop())
    logger.info("SMM orders background status poll task started (1-min interval)")

    # 7. Spawn message media cache cleanup background task (runs daily)
    from app.utils.media_cleanup import background_media_cleanup_loop

    media_cleanup_task = asyncio.create_task(background_media_cleanup_loop())
    logger.info("Message media cache cleanup background task started (daily interval)")

    yield
    # Shutdown
    logger.info("Shutting down TeleBos API...")

    # 3. Cancel background tasks
    twofa_sync_task.cancel()
    try:
        await twofa_sync_task
    except asyncio.CancelledError:
        pass

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

    adaptive_sync_task.cancel()
    try:
        await adaptive_sync_task
    except asyncio.CancelledError:
        pass

    smm_sync_task.cancel()
    try:
        await smm_sync_task
    except asyncio.CancelledError:
        pass

    smm_orders_poll_task.cancel()
    try:
        await smm_orders_poll_task
    except asyncio.CancelledError:
        pass

    media_cleanup_task.cancel()
    try:
        await media_cleanup_task
    except asyncio.CancelledError:
        pass



    # 4. Stop Telegram clients while Redis and DB connections are still active
    await session_manager.stop()
    from app.services.telegram_client import client_pool

    # 5. Clean up zombie jobs — pause active running jobs before closing DB
    try:
        from app.database import async_session_factory
        from app.models.broadcast_job import BroadcastJob
        from app.models.invite_job import InviteJob
        from sqlalchemy import update

        async with async_session_factory() as shutdown_db:
            await shutdown_db.execute(
                update(BroadcastJob)
                .where(BroadcastJob.status == "running")
                .values(status="paused")
            )
            await shutdown_db.execute(
                update(InviteJob)
                .where(InviteJob.status == "running")
                .values(status="paused")
            )
            await shutdown_db.commit()
            logger.info("Shutdown: In-flight broadcast and invite jobs marked as paused.")
    except Exception as shutdown_err:
        logger.warning("Shutdown: Error updating in-flight jobs status: %s", shutdown_err)

    # 6. Close Redis client connection and dispose database engine
    from app.utils.redis import redis_client

    await redis_client.close()
    await engine.dispose()


app = FastAPI(
    title=app_settings.APP_NAME,
    version="1.0.0",
    description=(
        "TeleBos API for first-party dashboard use and carefully scoped integrations. "
        "Browser sessions use x-better-auth-token; external websites must use a scoped "
        "Authorization: Bearer API key. Never share browser session tokens with third parties."
    ),
    contact={"name": "TeleBos Support", "url": "https://telebos.app/help"},
    openapi_tags=[
        {
            "name": "public-api",
            "description": "Stable, read-only endpoints for external integrations.",
        },
        {"name": "api-keys", "description": "Create and revoke external integration keys."},
    ],
    # Keep documentation under /api so it works both through Next.js and
    # when the backend is exposed directly by a reverse proxy.
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.openapi_schema = None


def public_openapi() -> dict:
    if app.openapi_schema is None:
        app.openapi_schema = _build_public_openapi(app)
    return app.openapi_schema


app.openapi = public_openapi  # type: ignore[method-assign]

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
    _allowed_hosts.extend(
        [
            "localhost",
            "127.0.0.1",
            "localhost:8000",
            "localhost:3000",
            "backend",
            "backend:8000",
            "frontend",
            "frontend:3000",
        ]
    )
    # Allow all hosts in debug/non-production to support arbitrary VPS IPs and tunnels seamlessly
    if app_settings.DEBUG or not app_settings.PRODUCTION:
        # Reject obviously spoofed Host headers but allow common tunnel services
        # to keep development ergonomic on arbitrary VPS IPs and tunnels.
        _allowed_hosts.extend(
            [
                "*.trycloudflare.com",
                "*.ngrok-free.app",
            ]
        )

# Add RealIPMiddleware to parse correct client IPs when behind Cloudflare/reverse proxy
app.add_middleware(RealIPMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "x-better-auth-token",
    ],
)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(accounts.router, prefix="/api/v1")
app.include_router(chats.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
app.include_router(reactions.router, prefix="/api/v1")
app.include_router(pins.router, prefix="/api/v1")
app.include_router(group_admin.router, prefix="/api/v1")
app.include_router(stickers.router, prefix="/api/v1")
app.include_router(polls.router, prefix="/api/v1")
app.include_router(forward.router, prefix="/api/v1")
app.include_router(gifs.router, prefix="/api/v1")
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
app.include_router(public.router)
app.include_router(api_keys.router)
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(telegram_reg_date.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health(response: Response):
    from sqlalchemy import text

    checks = {
        "status": "ok",
        "app": app_settings.APP_NAME,
        "database": "unknown",
        "redis": "unknown",
    }
    is_healthy = True

    # 1. Check PostgreSQL connection
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {str(exc)[:60]}"
        is_healthy = False

    # 2. Check Redis connection
    try:
        from app.utils.redis import redis_client
        pong = await redis_client.ping()
        checks["redis"] = "ok" if pong else "no_pong"
        if not pong:
            is_healthy = False
    except Exception as exc:
        checks["redis"] = f"error: {str(exc)[:60]}"
        is_healthy = False

    if not is_healthy:
        checks["status"] = "unhealthy"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return checks
