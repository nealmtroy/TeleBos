#!/usr/bin/env python3
"""Manual migration: sync legacy users → Better Auth tables.

Run from inside the container:
    docker exec telebos-backend-1 python /app/migrate_ba_users.py

Or via docker-compose:
    docker compose exec backend python /app/migrate_ba_users.py

This does the same thing as the startup migration in main.py._run_migrations,
but can be triggered on-demand when BA tables weren't ready during startup
(e.g. setup-db.mjs ran after the backend container started).
"""

import asyncio
import logging

from sqlalchemy import text

from app.config import get_settings
from app.database import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("migrate_ba_users")


async def main():
    settings = get_settings()
    logger.info("Starting legacy → BA user migration...")

    async with engine.begin() as conn:
        # 1. Check tables exist
        tables = await conn.run_sync(
            lambda sync_conn: [
                row[0]
                for row in sync_conn.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                ).fetchall()
            ]
        )
        logger.info("Tables found: %s", tables)

        if "user" not in tables:
            logger.error(
                'BA "user" table does not exist! '
                "Run setup-db.mjs first:\n"
                "  docker exec telebos-frontend-1 node /app/setup-db.mjs"
            )
            return
        if "account" not in tables:
            logger.error(
                'BA "account" table does not exist! '
                "Run setup-db.mjs first."
            )
            return

        # 2. Sync legacy users → BA "user" table
        r1 = await conn.execute(
            text("""
                INSERT INTO "user" (id, name, email, "emailVerified", "twoFactorEnabled", "createdAt", "updatedAt")
                SELECT us.id::text, COALESCE(us.full_name, ''), us.email, true, false, us.created_at, us.updated_at
                FROM users us
                WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = us.id::text)
                ON CONFLICT (id) DO NOTHING
            """)
        )
        logger.info("Synced %d users → BA \"user\" table", r1.rowcount)

        # 3. Sync passwords → BA "account" table
        r2 = await conn.execute(
            text("""
                INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
                SELECT
                  gen_random_uuid()::text,
                  us.email,
                  'email',
                  us.id::text,
                  us.password_hash,
                  us.created_at,
                  us.updated_at
                FROM users us
                WHERE us.password_hash IS NOT NULL AND us.password_hash != ''
                  AND NOT EXISTS (
                    SELECT 1 FROM "account" a
                    WHERE a."userId" = us.id::text AND a."providerId" = 'email'
                  )
            """)
        )
        logger.info("Synced %d passwords → BA \"account\" table", r2.rowcount)

        # 4. Verify
        verify = await conn.execute(
            text("""
                SELECT COUNT(*) FROM "account" a
                JOIN "user" u ON u.id = a."userId"
                WHERE a."providerId" = 'email'
            """)
        )
        total = verify.scalar()
        logger.info("Total BA email accounts ready for login: %d", total)

    logger.info("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())
