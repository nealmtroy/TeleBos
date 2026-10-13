"""Unit tests validating WalletLedger foreign key immutability and RESTRICT constraint (DB-03 / TASK-05)."""

import importlib.util
from pathlib import Path
import pytest
from sqlalchemy import create_engine, delete, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from uuid import uuid4

from app.models.wallet_ledger import WalletLedger
from app.models.user import User


def test_wallet_ledger_model_foreign_key_has_restrict_ondelete():
    """Verify TASK-05 / DB-03: WalletLedger.user_id must specify ondelete='RESTRICT'."""
    fks = list(WalletLedger.__table__.c.user_id.foreign_keys)
    assert len(fks) == 1, "Expected exactly 1 foreign key on wallet_ledgers.user_id"
    fk = fks[0]
    assert fk.target_fullname == "users.id"
    assert fk.ondelete.upper() == "RESTRICT", f"Expected ondelete='RESTRICT', got {fk.ondelete}"


def test_alembic_migration_024_chain_and_targets():
    """Verify TASK-05: Migration 024 connects to 023 and alters foreign key."""
    migration_path = Path(__file__).resolve().parents[2] / "alembic" / "versions" / "024_restrict_wallet_ledger_user_foreign_key.py"
    assert migration_path.exists(), f"Migration file not found at {migration_path}"

    spec = importlib.util.spec_from_file_location("migration_024", migration_path)
    migration_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration_mod)

    assert migration_mod.revision == "024"
    assert migration_mod.down_revision == "023"
    assert hasattr(migration_mod, "upgrade")
    assert hasattr(migration_mod, "downgrade")


def test_database_level_restrict_enforcement():
    """Verify foreign key constraint rejects user deletion when child ledger rows exist."""
    from app.database import Base

    engine = create_engine("sqlite:///:memory:")

    # Ensure foreign keys are enforced on every SQLite connection from the pool
    @event.listens_for(engine, "connect")
    def _enable_fk(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine, tables=[User.__table__, WalletLedger.__table__])

    user_id = uuid4()
    with Session(engine) as session:
        user = User(id=user_id, email="ledger_owner@example.com", role="basic")
        session.add(user)
        session.commit()

        ledger = WalletLedger(
            id=uuid4(),
            user_id=user_id,
            entry_type="CREDIT",
            amount=50_000,
            balance_before=0,
            balance_after=50_000,
            category="topup",
            description="Initial deposit",
        )
        session.add(ledger)
        session.commit()

        # Attempt to delete user — must raise IntegrityError because of ON DELETE RESTRICT
        with pytest.raises(IntegrityError):
            session.execute(delete(User).where(User.id == user_id))
            session.commit()
