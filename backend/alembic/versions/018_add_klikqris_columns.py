"""Add KlikQRIS fields to wallet_transactions table

Revision ID: 018
Revises: 017
Create Date: 2026-10-09
"""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS total_amount BIGINT")
    op.execute("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS signature VARCHAR(255)")
    op.execute("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS qris_url TEXT")
    op.execute("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS qris_image TEXT")
    op.execute("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ")


def downgrade():
    op.execute("ALTER TABLE wallet_transactions DROP COLUMN IF EXISTS expired_at")
    op.execute("ALTER TABLE wallet_transactions DROP COLUMN IF EXISTS qris_image")
    op.execute("ALTER TABLE wallet_transactions DROP COLUMN IF EXISTS qris_url")
    op.execute("ALTER TABLE wallet_transactions DROP COLUMN IF EXISTS signature")
    op.execute("ALTER TABLE wallet_transactions DROP COLUMN IF EXISTS total_amount")
