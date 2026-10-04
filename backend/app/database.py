"""Async database engine and session factory."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# Connection budget: three processes import this engine (uvicorn backend, async
# worker, telegram bot), so total demand is 3 x (POOL_SIZE + MAX_OVERFLOW).
# The old 50/50 setting meant up to 300 connections, which exhausted Postgres
# and surfaced as "sorry, too many clients already" (PYTHON-FASTAPI-4).
# docker-compose.yml raises max_connections to 300 to match; 20/20 keeps the
# worst case at 120 and leaves headroom for migrations and admin sessions.
POOL_SIZE = 20
MAX_OVERFLOW = 20

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_recycle=1800,  # Recycle connections after 30 min to avoid stale connections
    pool_pre_ping=True,  # Verify connections before use
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """Dependency that yields an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            try:
                await session.rollback()
            except Exception:
                # Connection may already be closed/dead during server restart or network drop
                pass
            raise
