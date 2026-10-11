-- Migration 019: Add total_amount to wallet_transactions table
-- Fixes: PYTHON-FASTAPI-23 (column wallet_transactions.total_amount does not exist)
-- Date: 2026-10-12

BEGIN;

-- Backup
CREATE TABLE IF NOT EXISTS wallet_transactions_bak_20261012 AS SELECT * FROM wallet_transactions;

-- Add missing column
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS total_amount BIGINT;

-- Verify
\d wallet_transactions

COMMIT;