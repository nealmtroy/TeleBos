"""Add performance GIN indexes on automation JSONB account_ids and B-Tree index + FK on orders.mass_parent_id.

Revision ID: 027
Revises: 026
Create Date: 2026-10-14
Addresses: PERF-01 / DB-04 and PERF-02 / DB-06 (TASK-29 in REMEDIATION_ROADMAP.md)
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    is_pg = conn.dialect.name == "postgresql"

    # 1. orders: B-Tree index on mass_parent_id and FK constraint (PERF-02, DB-06)
    if "orders" in tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("orders")}
        if "ix_orders_mass_parent_id" not in existing_indexes:
            op.create_index(
                "ix_orders_mass_parent_id",
                "orders",
                ["mass_parent_id"],
            )

        existing_fks = {fk.get("name") for fk in inspector.get_foreign_keys("orders")}
        if "fk_orders_mass_parent_id_orders" not in existing_fks:
            try:
                op.create_foreign_key(
                    "fk_orders_mass_parent_id_orders",
                    "orders",
                    "orders",
                    ["mass_parent_id"],
                    ["id"],
                    ondelete="CASCADE",
                )
            except Exception:
                pass

    # 2. GIN indexes on automation job account_ids (JSONB) (PERF-01, DB-04)
    if is_pg:
        if "broadcast_jobs" in tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("broadcast_jobs")}
            if "ix_broadcast_jobs_account_ids_gin" not in existing_indexes:
                op.create_index(
                    "ix_broadcast_jobs_account_ids_gin",
                    "broadcast_jobs",
                    ["account_ids"],
                    postgresql_using="gin",
                )

        if "invite_jobs" in tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("invite_jobs")}
            if "ix_invite_jobs_account_ids_gin" not in existing_indexes:
                op.create_index(
                    "ix_invite_jobs_account_ids_gin",
                    "invite_jobs",
                    ["account_ids"],
                    postgresql_using="gin",
                )

        if "auto_join_jobs" in tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("auto_join_jobs")}
            if "ix_auto_join_jobs_account_ids_gin" not in existing_indexes:
                op.create_index(
                    "ix_auto_join_jobs_account_ids_gin",
                    "auto_join_jobs",
                    ["account_ids"],
                    postgresql_using="gin",
                )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    is_pg = conn.dialect.name == "postgresql"

    if is_pg:
        if "auto_join_jobs" in tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("auto_join_jobs")}
            if "ix_auto_join_jobs_account_ids_gin" in existing_indexes:
                op.drop_index("ix_auto_join_jobs_account_ids_gin", table_name="auto_join_jobs")

        if "invite_jobs" in tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("invite_jobs")}
            if "ix_invite_jobs_account_ids_gin" in existing_indexes:
                op.drop_index("ix_invite_jobs_account_ids_gin", table_name="invite_jobs")

        if "broadcast_jobs" in tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("broadcast_jobs")}
            if "ix_broadcast_jobs_account_ids_gin" in existing_indexes:
                op.drop_index("ix_broadcast_jobs_account_ids_gin", table_name="broadcast_jobs")

    if "orders" in tables:
        existing_fks = {fk.get("name") for fk in inspector.get_foreign_keys("orders")}
        if "fk_orders_mass_parent_id_orders" in existing_fks:
            op.drop_constraint("fk_orders_mass_parent_id_orders", "orders", type_="foreignkey")

        existing_indexes = {idx["name"] for idx in inspector.get_indexes("orders")}
        if "ix_orders_mass_parent_id" in existing_indexes:
            op.drop_index("ix_orders_mass_parent_id", table_name="orders")
