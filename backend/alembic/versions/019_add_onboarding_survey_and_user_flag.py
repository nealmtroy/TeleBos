"""Add onboarding_survey table and onboarding_completed column on users

Revision ID: 019
Revises: 018
Create Date: 2026-10-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS onboarding_surveys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(50),
            referral VARCHAR(50),
            volume VARCHAR(50),
            features JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
            completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_onboarding_surveys_user_id UNIQUE (user_id)
        )
        """
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_onboarding_surveys_user_id ON onboarding_surveys (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_onboarding_surveys_created_at ON onboarding_surveys (created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_onboarding_surveys_role ON onboarding_surveys (role)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_onboarding_surveys_referral ON onboarding_surveys (referral)"
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS onboarding_surveys")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed")
