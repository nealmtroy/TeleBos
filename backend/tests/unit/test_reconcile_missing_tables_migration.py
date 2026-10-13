"""Unit tests for Alembic revision 026: Reconcile 6 missing tables into official Alembic revision tree (DB-01 / ARCH-02 / TASK-25)."""

import importlib.util
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "026_reconcile_missing_tables.py"
)


def load_migration_module():
    assert MIGRATION_PATH.exists(), f"Migration file not found at {MIGRATION_PATH}"
    spec = importlib.util.spec_from_file_location("migration_026", MIGRATION_PATH)
    assert spec is not None
    assert spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_026_metadata_and_chain():
    """Verify revision 026 exists and is properly chained to down_revision 025."""
    mod = load_migration_module()
    assert mod.revision == "026"
    assert mod.down_revision == "025"
    assert hasattr(mod, "upgrade")
    assert hasattr(mod, "downgrade")


def test_alembic_script_directory_head_is_linear():
    """Verify Alembic script directory recognizes 026 in the linear history with a single unbranched head."""
    alembic_ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    config = Config(str(alembic_ini_path))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected single unbranched head, got {heads}"
    rev_026 = script.get_revision("026")
    assert rev_026 is not None
    assert rev_026.down_revision == "025"


def test_migration_026_upgrade_and_downgrade_idempotency():
    """Verify upgrade creates the 6 tables and downgrade drops them cleanly and idempotently."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    mod = load_migration_module()
    engine: Engine = create_engine("sqlite:///:memory:")

    with engine.connect() as conn:
        # Pre-create parent tables required for foreign key references in SQLite
        conn.execute(
            text(
                "CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(255))"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE telegram_accounts (id VARCHAR(36) PRIMARY KEY, phone VARCHAR(30))"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE orders (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36))"
            )
        )
        conn.commit()

        ctx = MigrationContext.configure(conn)
        mod.op._proxy = mod.op.Operations(ctx)

        # 1. First upgrade: all 6 tables should be created
        mod.upgrade()
        conn.commit()

        inspector = inspect(conn)
        tables = set(inspector.get_table_names())

        expected_tables = {
            "telegram_id_prefix_prices",
            "account_folders",
            "account_folder_members",
            "telegram_registration_datapoints",
            "support_tickets",
            "security_audit_logs",
        }
        for table in expected_tables:
            assert table in tables, f"Expected table '{table}' to be created by revision 026"

        # Check columns of a couple of key tables
        prefix_cols = {c["name"] for c in inspector.get_columns("telegram_id_prefix_prices")}
        assert "buy_price" in prefix_cols
        assert "sell_price" in prefix_cols
        assert "id_prefix" in prefix_cols

        ticket_cols = {c["name"] for c in inspector.get_columns("support_tickets")}
        assert "ticket_number" in ticket_cols
        assert "transcript" in ticket_cols
        assert "related_order_id" in ticket_cols

        audit_cols = {c["name"] for c in inspector.get_columns("security_audit_logs")}
        assert "actor_id" in audit_cols
        assert "action" in audit_cols
        assert "metadata" in audit_cols

        # 2. Second upgrade (idempotency check): should not raise error if tables already exist
        mod.upgrade()
        conn.commit()

        # 3. Downgrade: all 6 tables should be dropped cleanly
        mod.downgrade()
        conn.commit()

        inspector = inspect(conn)
        remaining_tables = set(inspector.get_table_names())
        for table in expected_tables:
            assert table not in remaining_tables, f"Expected table '{table}' to be dropped by downgrade"

        # 4. Second downgrade (idempotency check): should not raise error if tables are already dropped
        mod.downgrade()
        conn.commit()
