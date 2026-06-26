#!/usr/bin/env python3
"""Debug & reset passwords for Better Auth migration.

Cek apakah data user legacy udah properly tersinkronisasi ke BA tables,
dan reset password kalo perlu.

Usage:
    docker compose exec backend python /app/migrate_ba_users.py --check <email>
    docker compose exec backend python /app/migrate_ba_users.py --reset <email> <new-password>
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import text

from app.database import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("migrate_ba_users")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def show_tables():
    async with engine.begin() as conn:
        tables = await conn.run_sync(
            lambda sync_conn: [
                row[0]
                for row in sync_conn.execute(
                    text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
                ).fetchall()
            ]
        )
        logger.info("Tables: %s", tables)


async def check_user(email: str):
    """Check if a legacy user is properly synced to BA tables."""
    async with engine.begin() as conn:
        # 1. Check legacy users table
        legacy = await conn.execute(
            text("SELECT id, email, full_name, role, is_active, password_hash IS NOT NULL AND password_hash != '' as has_pwd FROM users WHERE email = :email"),
            {"email": email},
        )
        lrow = legacy.one_or_none()
        if not lrow:
            logger.error("User %s not found in legacy users table!", email)
            return
        logger.info("=== Legacy users table ===")
        logger.info("  id: %s", lrow.id)
        logger.info("  email: %s", lrow.email)
        logger.info("  name: %s", lrow.full_name)
        logger.info("  role: %s", lrow.role)
        logger.info("  has password: %s", lrow.has_pwd)

        user_id_text = str(lrow.id)

        # 2. Check BA user table
        ba_user = await conn.execute(
            text('SELECT id, name, email, "emailVerified" FROM "user" WHERE email = :email'),
            {"email": email},
        )
        brow = ba_user.one_or_none()
        if not brow:
            logger.error("User %s NOT FOUND in BA user table!", email)
        else:
            logger.info("=== BA user table ===")
            logger.info("  id: %s", brow.id)
            logger.info("  email: %s", brow.email)
            logger.info("  name: %s", brow.name)
            logger.info("  emailVerified: %s", brow.emailVerified)
            logger.info("  id match with legacy: %s", brow.id == user_id_text)

        # 3. Check BA account table
        ba_acct = await conn.execute(
            text('SELECT id, "accountId", "providerId", password IS NOT NULL AND password != \'\' as has_pwd FROM "account" WHERE "userId" = :uid AND "providerId" = \'email\''),
            {"uid": user_id_text},
        )
        arow = ba_acct.one_or_none()
        if not arow:
            # Try looking up by userId as-is without the text cast
            ba_acct2 = await conn.execute(
                text('SELECT id, "accountId", "providerId", password IS NOT NULL AND password != \'\' as has_pwd FROM "account" WHERE "userId" = :uid2 AND "providerId" = \'email\''),
                {"uid2": brow.id if brow else user_id_text},
            )
            arow2 = ba_acct2.one_or_none()
            if arow2:
                arow = arow2
                logger.info("  (found via brow.id)")

        if not arow:
            logger.error("ACCOUNT RECORD NOT FOUND for userId=%s!", user_id_text)
            # Try listing all accounts for this user
            all_accts = await conn.execute(
                text('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = :uid'),
                {"uid": user_id_text},
            )
            rows = all_accts.fetchall()
            if rows:
                logger.info("  But found %d account(s) with other providerId(s):", len(rows))
                for r in rows:
                    logger.info("    providerId=%s accountId=%s", r.providerId, r.accountId)
            else:
                logger.info("  No accounts at all for this userId.")
        else:
            logger.info("=== BA account table ===")
            logger.info("  id: %s", arow.id)
            logger.info("  accountId: %s", arow.accountId)
            logger.info("  providerId: %s", arow.providerId)
            logger.info("  has password: %s", arow.has_pwd)


async def reset_password(email: str, new_password: str):
    """Reset a user's password in BA account table using passlib bcrypt.

    BA v1.6 uses bcrypt by default, so passlib bcrypt hashes are compatible.
    """
    if len(new_password) < 6:
        logger.error("Password must be at least 6 characters")
        return

    async with engine.begin() as conn:
        # Find user in BA user table
        ba_user = await conn.execute(
            text('SELECT id FROM "user" WHERE email = :email'),
            {"email": email},
        )
        brow = ba_user.one_or_none()
        if not brow:
            logger.error("User %s not found in BA user table!", email)
            return

        # Hash with passlib bcrypt (same algorithm BA uses)
        new_hash = pwd_context.hash(new_password)

        # Update the account record (or create if missing)
        result = await conn.execute(
            text('''
                INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, :email, 'email', :uid, :pwd, NOW(), NOW())
                ON CONFLICT ("providerId", "userId") DO UPDATE SET password = :pwd2, "updatedAt" = NOW()
            '''),
            {"email": email, "uid": brow.id, "pwd": new_hash, "pwd2": new_hash},
        )
        logger.info("Password reset for %s — hash written to account table", email)

        # Also update legacy users table password_hash
        await conn.execute(
            text("UPDATE users SET password_hash = :pwd WHERE email = :email"),
            {"pwd": new_hash, "email": email},
        )
        logger.info("Legacy password_hash also updated for consistency")

    logger.info("✓ Sekarang coba login dengan password baru.")


async def main():
    args = sys.argv[1:]

    if not args:
        # Default: run original sync migration
        logger.info("Starting legacy → BA user migration...")
        async with engine.begin() as conn:
            tables = await conn.run_sync(
                lambda sync_conn: [
                    row[0]
                    for row in sync_conn.execute(
                        text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
                    ).fetchall()
                ]
            )
            logger.info("Tables: %s", tables)

            if "user" not in tables or "account" not in tables:
                logger.error("BA tables not found — run setup-db.mjs first")
                return

            r1 = await conn.execute(
                text('''
                    INSERT INTO "user" (id, name, email, "emailVerified", "twoFactorEnabled", "createdAt", "updatedAt")
                    SELECT us.id::text, COALESCE(us.full_name, ''), us.email, true, false, us.created_at, us.updated_at
                    FROM users us
                    WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = us.id::text)
                    ON CONFLICT (id) DO NOTHING
                ''')
            )
            logger.info("Synced %d users → BA user table", r1.rowcount)

            r2 = await conn.execute(
                text('''
                    INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
                    SELECT gen_random_uuid()::text, us.email, 'email', us.id::text, us.password_hash, us.created_at, us.updated_at
                    FROM users us
                    WHERE us.password_hash IS NOT NULL AND us.password_hash != ''
                      AND NOT EXISTS (
                        SELECT 1 FROM "account" a WHERE a."userId" = us.id::text AND a."providerId" = 'email'
                      )
                ''')
            )
            logger.info("Synced %d passwords → BA account table", r2.rowcount)

            verify = await conn.execute(
                text('''SELECT COUNT(*) FROM "account" a JOIN "user" u ON u.id = a."userId" WHERE a."providerId" = 'email' ''')
            )
            logger.info("Total BA email accounts ready: %d", verify.scalar())

    elif args[0] == "--check" and len(args) >= 2:
        await check_user(args[1])

    elif args[0] == "--reset" and len(args) >= 3:
        await reset_password(args[1], args[2])

    elif args[0] == "--tables":
        await show_tables()

    else:
        print("Usage:")
        print("  python migrate_ba_users.py                          # Run sync migration")
        print("  python migrate_ba_users.py --check <email>          # Check user sync status")
        print("  python migrate_ba_users.py --reset <email> <pass>   # Reset user password")
        print("  python migrate_ba_users.py --tables                 # List all tables")
        sys.exit(1)

    logger.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
