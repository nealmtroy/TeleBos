"""Unit tests for Alembic revision 027 and performance index coverage (TASK-29).

Addresses:
- PERF-01 / DB-04: GIN indexes on JSONB account_ids in automation job tables (broadcast_jobs, invite_jobs, auto_join_jobs).
- PERF-02 / DB-06: B-Tree index and foreign key on orders.mass_parent_id.
"""

import importlib.util
from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.models.auto_join_job import AutoJoinJob
from app.models.broadcast_job import BroadcastJob
from app.models.invite_job import InviteJob
from app.models.order import Order

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "027_add_performance_indexes.py"
)


def load_migration_module():
    assert MIGRATION_PATH.exists(), f"Migration file not found at {MIGRATION_PATH}"
    spec = importlib.util.spec_from_file_location("migration_027", MIGRATION_PATH)
    assert spec is not None
    assert spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_027_metadata_and_chain():
    """Verify revision 027 exists and is properly chained to down_revision 026."""
    mod = load_migration_module()
    assert mod.revision == "027"
    assert mod.down_revision == "026"
    assert hasattr(mod, "upgrade")
    assert hasattr(mod, "downgrade")


def test_alembic_script_directory_head_is_027():
    """Verify Alembic script directory recognizes 027 as the single, linear head."""
    alembic_ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    config = Config(str(alembic_ini_path))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    assert heads == ["027"], f"Expected single head ['027'], got {heads}"


def test_models_declare_performance_indexes():
    """Verify SQLAlchemy model declarations include required B-Tree and GIN indexes."""
    # 1. Order mass_parent_id B-Tree index & FK
    order_indexes = {idx.name: idx for idx in Order.__table__.indexes}
    assert "ix_orders_mass_parent_id" in order_indexes
    assert list(order_indexes["ix_orders_mass_parent_id"].columns.keys()) == ["mass_parent_id"]

    mass_parent_col = Order.__table__.c.mass_parent_id
    fk_targets = [fk.target_fullname for fk in mass_parent_col.foreign_keys]
    assert "orders.id" in fk_targets

    # 2. BroadcastJob GIN index on account_ids
    broadcast_indexes = {idx.name: idx for idx in BroadcastJob.__table__.indexes}
    assert "ix_broadcast_jobs_account_ids_gin" in broadcast_indexes
    assert broadcast_indexes["ix_broadcast_jobs_account_ids_gin"].dialect_options.get("postgresql", {}).get("using") == "gin"

    # 3. InviteJob GIN index on account_ids
    invite_indexes = {idx.name: idx for idx in InviteJob.__table__.indexes}
    assert "ix_invite_jobs_account_ids_gin" in invite_indexes
    assert invite_indexes["ix_invite_jobs_account_ids_gin"].dialect_options.get("postgresql", {}).get("using") == "gin"

    # 4. AutoJoinJob GIN index on account_ids
    auto_join_indexes = {idx.name: idx for idx in AutoJoinJob.__table__.indexes}
    assert "ix_auto_join_jobs_account_ids_gin" in auto_join_indexes
    assert auto_join_indexes["ix_auto_join_jobs_account_ids_gin"].dialect_options.get("postgresql", {}).get("using") == "gin"


def test_migration_027_upgrade_and_downgrade_idempotency():
    """Verify revision 027 upgrade creates indexes and downgrade drops them cleanly."""
    mod = load_migration_module()
    engine: Engine = create_engine("sqlite:///:memory:")

    with engine.connect() as conn:
        # Pre-create tables
        conn.execute(
            text(
                "CREATE TABLE orders ("
                "  id VARCHAR(36) PRIMARY KEY,"
                "  user_id VARCHAR(36) NOT NULL,"
                "  mass_parent_id VARCHAR(36)"
                ")"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE broadcast_jobs ("
                "  id VARCHAR(36) PRIMARY KEY,"
                "  account_ids TEXT NOT NULL"
                ")"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE invite_jobs ("
                "  id VARCHAR(36) PRIMARY KEY,"
                "  account_ids TEXT NOT NULL"
                ")"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE auto_join_jobs ("
                "  id VARCHAR(36) PRIMARY KEY,"
                "  account_ids TEXT NOT NULL"
                ")"
            )
        )
        conn.commit()

        context = MigrationContext.configure(conn)
        op_proxy = Operations(context)
        original_op = mod.op
        mod.op = op_proxy

        try:
            # Upgrade
            mod.upgrade()
            conn.commit()

            inspector = inspect(conn)
            order_indexes = {idx["name"] for idx in inspector.get_indexes("orders")}
            assert "ix_orders_mass_parent_id" in order_indexes

            # Downgrade
            mod.downgrade()
            conn.commit()

            inspector = inspect(conn)
            order_indexes_after = {idx["name"] for idx in inspector.get_indexes("orders")}
            assert "ix_orders_mass_parent_id" not in order_indexes_after

            # Re-upgrade (idempotency check)
            mod.upgrade()
            conn.commit()

            inspector = inspect(conn)
            order_indexes_re = {idx["name"] for idx in inspector.get_indexes("orders")}
            assert "ix_orders_mass_parent_id" in order_indexes_re

        finally:
            mod.op = original_op


def test_database_migrator_idempotent_index_statements():
    """Verify database_migrator.py defines the required index statements for orders and automation tables."""
    from app import database_migrator
    import inspect as py_inspect

    source = py_inspect.getsource(database_migrator.run_migrations)
    assert "ix_orders_mass_parent_id" in source
    assert "ix_broadcast_jobs_account_ids_gin" in source
    assert "ix_invite_jobs_account_ids_gin" in source
    assert "ix_auto_join_jobs_account_ids_gin" in source
