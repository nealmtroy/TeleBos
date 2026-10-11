-- Migration 018: Add is_premium to telegram_accounts table
-- Fixes: PYTHON-FASTAPI-1B (column telegram_accounts.is_premium does not exist)
-- Date: 2026-10-12

BEGIN;

-- Backup
CREATE TABLE IF NOT EXISTS telegram_accounts_bak_20261012 AS SELECT * FROM telegram_accounts;

-- Add missing column
ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE telegram_accounts ALTER COLUMN is_premium SET DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS ix_telegram_accounts_is_premium ON telegram_accounts(is_premium);

-- Verify
\d telegram_accounts

COMMIT;