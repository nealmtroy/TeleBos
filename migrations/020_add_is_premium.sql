-- Migration 020: Add is_premium column to telegram_accounts
-- Run on production database before deploying code that references this column

-- Backup first
CREATE TABLE IF NOT EXISTS telegram_accounts_bak_20261011 AS SELECT * FROM telegram_accounts;

-- Add column
ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Add index
CREATE INDEX IF NOT EXISTS ix_telegram_accounts_is_premium ON telegram_accounts (is_premium);

-- Verify
\d telegram_accounts