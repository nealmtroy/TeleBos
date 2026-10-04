"""Schema integrity cleanup and user suspension support

Revision ID: 017
Revises: 016
Create Date: 2026-10-04
"""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Clean up duplicate redundant indexes
    op.execute("DROP INDEX IF EXISTS uq_telegram_account_phone")
    op.execute("DROP INDEX IF EXISTS ix_account_folder_members_account")
    op.execute("DROP INDEX IF EXISTS ix_account_folder_members_folder")
    op.execute("DROP INDEX IF EXISTS ix_invite_logs_account_used")

    # 2. Add missing indexes on foreign keys to eliminate sequential scans
    op.execute("CREATE INDEX IF NOT EXISTS ix_broadcast_jobs_group_list_id ON broadcast_jobs (group_list_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_broadcast_jobs_text_list_id ON broadcast_jobs (text_list_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_redeem_codes_created_by ON redeem_codes (created_by)")

    # 3. Fix orders.user_id FK constraint to ON DELETE CASCADE
    op.execute("""
        ALTER TABLE orders 
        DROP CONSTRAINT IF EXISTS orders_user_id_fkey,
        ADD CONSTRAINT orders_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # 4. Fix redeem_codes.created_by FK constraint to ON DELETE CASCADE
    op.execute("""
        ALTER TABLE redeem_codes 
        DROP CONSTRAINT IF EXISTS redeem_codes_created_by_fkey,
        ADD CONSTRAINT redeem_codes_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    """)

    # 5. Clean up lingering production backup table
    op.execute("DROP TABLE IF EXISTS telegram_accounts_bak_20261002")

    # 6. Add suspension fields to users table
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires TIMESTAMP WITH TIME ZONE")

    # 7. Add Better Auth admin plugin fields to "user" and "session" tables
    op.execute("ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'")
    op.execute("ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS \"banReason\" TEXT")
    op.execute("ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS \"banExpires\" TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE \"session\" ADD COLUMN IF NOT EXISTS \"impersonatedBy\" TEXT")

    # Sync roles from users table into "user" table
    op.execute("UPDATE \"user\" u SET role = tu.role FROM users tu WHERE u.id = tu.id::text")


def downgrade():
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS ban_reason")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS ban_expires")
    op.execute("DROP INDEX IF EXISTS ix_broadcast_jobs_group_list_id")
    op.execute("DROP INDEX IF EXISTS ix_broadcast_jobs_text_list_id")
    op.execute("DROP INDEX IF EXISTS ix_redeem_codes_created_by")
