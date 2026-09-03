"""Database schema migrator: applies idempotent schema migrations not covered by create_all."""

import hashlib
import json
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def run_migrations(connection):
    """Apply idempotent schema migrations not covered by create_all."""
    inspector = inspect(connection)

    # ── Session token hashing (vuln-0005) ──────────────────────────────────
    # Adds a token_hash column so the backend can validate sessions by
    # SHA-256 hash instead of plaintext token comparison, protecting
    # tokens at rest in the database.  Backfills existing sessions.
    session_cols = [c["name"] for c in inspector.get_columns("session")]
    if "token_hash" not in session_cols:
        connection.execute(text("ALTER TABLE session ADD COLUMN token_hash TEXT"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS idx_session_token_hash ON session(token_hash)")
        )

    # Backfill any sessions without a hash (new sessions get this from the
    # Better Auth session.create.before database hook in frontend/src/lib/auth.ts)
    backfill_result = connection.execute(
        text("SELECT id, token FROM session WHERE token_hash IS NULL")
    )
    backfill_rows = backfill_result.fetchall()
    for row in backfill_rows:
        h = hashlib.sha256(row.token.encode()).hexdigest()
        connection.execute(
            text("UPDATE session SET token_hash = :h WHERE id = :id"),
            {"h": h, "id": row.id},
        )

    columns = [c["name"] for c in inspector.get_columns("broadcast_jobs")]

    if "loop_enabled" not in columns:
        connection.execute(
            text(
                "ALTER TABLE broadcast_jobs ADD COLUMN loop_enabled BOOLEAN DEFAULT false NOT NULL"
            )
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
            connection.execute(
                text("ALTER TABLE broadcast_jobs ALTER COLUMN account_ids SET NOT NULL")
            )
            connection.execute(text("ALTER TABLE broadcast_jobs DROP COLUMN account_id"))
        else:
            connection.execute(
                text("ALTER TABLE broadcast_jobs ALTER COLUMN account_ids SET NOT NULL")
            )

    if "delay_randomized" not in columns:
        connection.execute(
            text(
                "ALTER TABLE broadcast_jobs "
                "ADD COLUMN delay_randomized BOOLEAN DEFAULT false NOT NULL"
            )
        )

    if "log_destination" not in columns:
        connection.execute(
            text("ALTER TABLE broadcast_jobs ADD COLUMN log_destination VARCHAR(255) DEFAULT NULL")
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

    # ── Cached 2FA metadata (safe masked values only) ─────────────────────
    twofa_cache_columns = {
        "twofa_has_recovery": "BOOLEAN DEFAULT NULL",
        "twofa_hint": "VARCHAR(255) DEFAULT NULL",
        "login_email_pattern": "VARCHAR(255) DEFAULT NULL",
        "unconfirmed_email_pattern": "VARCHAR(255) DEFAULT NULL",
        "twofa_status_synced_at": "TIMESTAMPTZ DEFAULT NULL",
        "twofa_status_retry_at": "TIMESTAMPTZ DEFAULT NULL",
    }
    for column_name, definition in twofa_cache_columns.items():
        if column_name not in acct_cols:
            connection.execute(
                text(f"ALTER TABLE telegram_accounts ADD COLUMN {column_name} {definition}")
            )

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
            text("ALTER TABLE telegram_accounts ADD COLUMN auto_reply_text TEXT DEFAULT NULL")
        )

    # ── Cached stats columns on telegram_accounts ──────────────────────────
    if "contacts_count" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN contacts_count BIGINT DEFAULT 0 NOT NULL"
            )
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
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN total_channels BIGINT DEFAULT 0 NOT NULL"
            )
        )
    if "owned_channels" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN owned_channels BIGINT DEFAULT 0 NOT NULL"
            )
        )
    if "stats_updated_at" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN stats_updated_at TIMESTAMPTZ DEFAULT NULL"
            )
        )
    if "groups_channels_synced_at" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN groups_channels_synced_at TIMESTAMPTZ DEFAULT NULL"
            )
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
            text("ALTER TABLE telegram_accounts ADD COLUMN spam_detail TEXT DEFAULT NULL")
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
            text("ALTER TABLE telegram_accounts ADD COLUMN profile_photo_id BIGINT DEFAULT NULL")
        )
    if "color_id" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN color_id INTEGER DEFAULT NULL")
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
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN seller_id UUID REFERENCES users(id) ON DELETE SET NULL"
            )
        )
    if "sold_at" not in acct_cols:
        connection.execute(
            text("ALTER TABLE telegram_accounts ADD COLUMN sold_at TIMESTAMPTZ DEFAULT NULL")
        )
    if "recovery_email" not in acct_cols:
        connection.execute(
            text(
                "ALTER TABLE telegram_accounts ADD COLUMN recovery_email VARCHAR(255) DEFAULT NULL"
            )
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
                "CREATE INDEX ix_auto_reply_logs_sender ON auto_reply_logs (account_id, sender_id)"
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
            connection.execute(
                text("ALTER TABLE invite_jobs ADD COLUMN account_ids JSONB DEFAULT '[]'::jsonb")
            )
            if "account_id" in invite_jobs_cols:
                connection.execute(
                    text(
                        "UPDATE invite_jobs SET account_ids = jsonb_build_array(account_id::text) WHERE account_id IS NOT NULL"
                    )
                )
                connection.execute(
                    text("ALTER TABLE invite_jobs ALTER COLUMN account_ids SET NOT NULL")
                )
                connection.execute(text("ALTER TABLE invite_jobs DROP COLUMN account_id"))
            else:
                connection.execute(
                    text("ALTER TABLE invite_jobs ALTER COLUMN account_ids SET NOT NULL")
                )

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
        connection.execute(text("CREATE INDEX ix_invite_logs_job ON invite_logs (job_id)"))
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
            text("CREATE INDEX ix_account_audit_logs_user_id ON account_audit_logs (user_id)")
        )
        connection.execute(
            text("CREATE INDEX ix_account_audit_logs_account_id ON account_audit_logs (account_id)")
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

    # ── Better Auth user table: brute force protection columns (vuln-0007) ─
    if "user" in tables:
        user_ba_cols = [c["name"] for c in inspector.get_columns("user")]
        if "failedLoginAttempts" not in user_ba_cols:
            connection.execute(
                text(
                    'ALTER TABLE "user" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0'
                )
            )
        if "lockedUntil" not in user_ba_cols:
            connection.execute(
                text('ALTER TABLE "user" ADD COLUMN "lockedUntil" TIMESTAMPTZ DEFAULT NULL')
            )
        if "lastFailedLoginAt" not in user_ba_cols:
            connection.execute(
                text('ALTER TABLE "user" ADD COLUMN "lastFailedLoginAt" TIMESTAMPTZ DEFAULT NULL')
            )

    # ── Better Auth: make users.password_hash nullable ────────────────
    # Better Auth manages passwords in its own "account" table — the legacy
    # "users" table's password_hash is unused but still NOT NULL.
    user_cols_for_migration = [c["name"] for c in inspector.get_columns("users")]
    if "password_hash" in user_cols_for_migration and any(
        col["name"] == "password_hash" and col.get("nullable", True) is False
        for col in inspector.get_columns("users")
    ):
        try:
            connection.execute(text("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"))
        except Exception:
            # Column may already be nullable in some envs — ignore
            pass

    # ── Better Auth: sync existing BA users into legacy users table ──
    # If the BA "user" table exists, ensure every user there has a row in
    # the legacy "users" table (for existing DBs upgraded after BA migration).
    if "user" in tables and "users" in tables:
        connection.execute(
            text("""
                INSERT INTO users (id, email, full_name, is_active, role, balance, created_at, updated_at)
                SELECT u.id::uuid, u.email, u.name, true, 'basic', 0, COALESCE(u."createdAt", NOW()), NOW()
                FROM "user" u
                WHERE NOT EXISTS (SELECT 1 FROM users us WHERE us.id = u.id::uuid)
                ON CONFLICT (id) DO NOTHING
            """)
        )
        logger.info("Synced existing Better Auth users into legacy users table")

    # ── Better Auth: sync legacy users into BA "user" + "account" tables ──
    # This handles the reverse direction: users who were registered before the
    # Better Auth migration.  BA and passlib both use bcrypt, so existing
    # password hashes are compatible.
    #
    # Wrapped in try/except so failure never blocks startup.
    # Can also be run manually via: docker exec telebos-backend-1 python /app/migrate_ba_users.py
    try:
        if "users" in tables and "user" in tables and "account" in tables:
            # Migrate legacy users into BA "user" table
            r1 = connection.execute(
                text("""
                    INSERT INTO "user" (id, name, email, "emailVerified", "twoFactorEnabled", "createdAt", "updatedAt")
                    SELECT us.id::text, COALESCE(us.full_name, ''), us.email, true, false, us.created_at, us.updated_at
                    FROM users us
                    WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = us.id::text)
                    ON CONFLICT (id) DO NOTHING
                """)
            )
            if r1.rowcount:
                logger.info("Synced %d legacy users into BA user table", r1.rowcount)

            # Migrate passwords into BA "account" table
            r2 = connection.execute(
                text("""
                    INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
                    SELECT
                      gen_random_uuid()::text,
                      us.email,
                      'credential',
                      us.id::text,
                      us.password_hash,
                      us.created_at,
                      us.updated_at
                    FROM users us
                    WHERE us.password_hash IS NOT NULL AND us.password_hash != ''
                      AND NOT EXISTS (
                        SELECT 1 FROM "account" a
                        WHERE a."userId" = us.id::text AND a."providerId" = 'credential'
                      )
                """)
            )
            if r2.rowcount:
                logger.info("Synced passwords for %d users into BA account table", r2.rowcount)
    except Exception as exc:
        logger.warning("BA user sync skipped (tables not ready): %s", exc)

    # ── Performance Indexes ───────────────────────────────────────────
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_telegram_accounts_user_id ON telegram_accounts (user_id)"
        )
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
        text(
            "CREATE INDEX IF NOT EXISTS ix_broadcast_logs_job_sent ON broadcast_logs (job_id, sent_at)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_broadcast_logs_account_used ON broadcast_logs (account_id_used)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_invite_logs_job_invited ON invite_logs (job_id, invited_at)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_invite_logs_account_used ON invite_logs (account_id_used)"
        )
    )

    # ── Telegram chats: is_archived ──────────────────────────────────────
    chat_cols = [c["name"] for c in inspector.get_columns("telegram_chats")]
    if "is_archived" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN is_archived BOOLEAN DEFAULT false NOT NULL")
        )
    if "is_muted" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN is_muted BOOLEAN DEFAULT false NOT NULL")
        )
    if "is_pinned" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN is_pinned BOOLEAN DEFAULT false NOT NULL")
        )
    if "member_count" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN member_count INTEGER DEFAULT NULL")
        )
    if "online_count" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN online_count INTEGER DEFAULT NULL")
        )
    if "invite_link" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN invite_link VARCHAR(500) DEFAULT NULL")
        )
    if "photo_version" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN photo_version BIGINT DEFAULT NULL")
        )
    if "color_id" not in chat_cols:
        connection.execute(
            text("ALTER TABLE telegram_chats ADD COLUMN color_id INTEGER DEFAULT NULL")
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
        text(
            "CREATE INDEX IF NOT EXISTS ix_account_folder_members_folder ON account_folder_members (folder_id)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_account_folder_members_account ON account_folder_members (account_id)"
        )
    )

    # ── User balance & role migrations ────────────────────────────────
    user_cols = [c["name"] for c in inspector.get_columns("users")]
    if "balance" not in user_cols:
        connection.execute(text("ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0 NOT NULL"))
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
            col_type = next(
                c["type"] for c in inspector.get_columns("smm_services") if c["name"] == "speed"
            )
            # API returns long descriptions like "Jumlah Order Selesai ... 21 Hari 17 Jam 52 Menit"
            if hasattr(col_type, "length") and col_type.length == 50:
                connection.execute(text("ALTER TABLE smm_services ALTER COLUMN speed TYPE TEXT"))
        # API prices can exceed 32-bit INTEGER (e.g. 225486227451)
        for col in ["original_price", "selling_price"]:
            if col in smm_cols:
                col_type = next(
                    c["type"] for c in inspector.get_columns("smm_services") if c["name"] == col
                )
                if str(col_type) == "INTEGER":
                    connection.execute(
                        text(f"ALTER TABLE smm_services ALTER COLUMN {col} TYPE BIGINT")
                    )

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
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders (user_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status)"))

    # Migrate existing orders price columns if still INTEGER
    if "orders" in tables:
        orders_cols = [c["name"] for c in inspector.get_columns("orders")]
        for col in ["price", "total_price"]:
            if col in orders_cols:
                col_type = next(
                    c["type"] for c in inspector.get_columns("orders") if c["name"] == col
                )
                if str(col_type) == "INTEGER":
                    connection.execute(text(f"ALTER TABLE orders ALTER COLUMN {col} TYPE BIGINT"))

    # ── Fix broadcast_jobs FK constraints to use ON DELETE SET NULL ────────
    # Existing DBs have bare FKs that block group_list / text_list deletion.
    # We drop and re-create with ON DELETE SET NULL.
    if "broadcast_jobs" in tables:
        existing_fks = inspector.get_foreign_keys("broadcast_jobs")
        for fk in existing_fks:
            ref_table = fk.get("referred_table", "")
            fk_name = fk.get("name")
            if ref_table in ("group_lists", "text_lists") and fk_name:
                on_delete = (fk.get("options", {}).get("ondelete") or "").upper()
                if on_delete != "SET NULL":
                    col_name = fk["constrained_columns"][0]
                    connection.execute(
                        text(f"ALTER TABLE broadcast_jobs DROP CONSTRAINT {fk_name}")
                    )
                    connection.execute(
                        text(
                            f"ALTER TABLE broadcast_jobs "
                            f"ADD CONSTRAINT {fk_name} "
                            f"FOREIGN KEY ({col_name}) REFERENCES {ref_table}(id) ON DELETE SET NULL"
                        )
                    )

    # ── Telegram ID registration date datapoints table & seeding ──────────
    if "telegram_registration_datapoints" not in tables:
        connection.execute(
            text(
                "CREATE TABLE telegram_registration_datapoints ("
                "  telegram_id BIGINT PRIMARY KEY,"
                "  registered_at TIMESTAMPTZ NOT NULL,"
                "  source VARCHAR(50) DEFAULT 'seeded' NOT NULL,"
                "  created_at TIMESTAMPTZ DEFAULT now() NOT NULL"
                ")"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_telegram_registration_datapoints_registered_at ON telegram_registration_datapoints (registered_at)")
        )
        
    # Seed datapoints from JSON if seeded count is less than JSON dataset size
    import os
    import json
    seed_path = os.path.join(os.path.dirname(__file__), "resources", "telegram_reg_date_seed.json")
    if os.path.exists(seed_path):
        try:
            with open(seed_path, "r", encoding="utf-8") as f:
                seed_data = json.load(f)
            
            result = connection.execute(text("SELECT count(*) FROM telegram_registration_datapoints WHERE source = 'seeded'"))
            seeded_count = result.scalar()
            
            if seeded_count < len(seed_data):
                # Bulk insert using raw SQL parameter binding
                values_clause = []
                params = {}
                import datetime
                for idx, entry in enumerate(seed_data):
                    t_id = int(entry["id"])
                    reg_date = datetime.datetime.fromisoformat(entry["date"]).replace(tzinfo=datetime.timezone.utc)
                    values_clause.append(f"(:id_{idx}, :date_{idx}, 'seeded')")
                    params[f"id_{idx}"] = t_id
                    params[f"date_{idx}"] = reg_date
                
                if values_clause:
                    sql = f"INSERT INTO telegram_registration_datapoints (telegram_id, registered_at, source) VALUES {','.join(values_clause)} ON CONFLICT DO NOTHING"
                    connection.execute(text(sql), params)
                    logger.info("Successfully seeded %d Telegram registration datapoints", len(seed_data))
        except Exception as e:
            logger.error("Failed to seed Telegram registration datapoints: %s", e)

    # Ensure database constraints exist (idempotent)
    try:
        connection.execute(text("ALTER TABLE telegram_accounts ADD CONSTRAINT uq_telegram_account_phone UNIQUE (phone)"))
    except Exception:
        pass

    try:
        connection.execute(text("ALTER TABLE users ADD CONSTRAINT chk_user_balance_positive CHECK (balance >= 0)"))
    except Exception:
        pass

    # Ensure performance indexes exist (idempotent)
    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS ix_orders_smm_order_id ON orders (smm_order_id)",
        "CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status)",
        "CREATE INDEX IF NOT EXISTS ix_orders_user_id_status ON orders (user_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_broadcast_jobs_status ON broadcast_jobs (status)",
        "CREATE INDEX IF NOT EXISTS ix_broadcast_jobs_user_id_status ON broadcast_jobs (user_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_invite_logs_job_user ON invite_logs (job_id, user_id_tg)",
    ]:
        try:
            connection.execute(text(idx_sql))
        except Exception:
            pass

