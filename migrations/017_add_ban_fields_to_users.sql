-- Migration 017: Add ban_reason and ban_expires to users table
-- Fixes: PYTHON-FASTAPI-2K (column users.ban_reason does not exist)
-- Date: 2026-10-12

BEGIN;

-- Backup
CREATE TABLE IF NOT EXISTS users_bak_20261012 AS SELECT * FROM users;

-- Add missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires TIMESTAMP WITH TIME ZONE;

-- Verify
\d users

COMMIT;