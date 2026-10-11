-- Migration 017: Add ban_reason and ban_expires to users table
-- Run on production database before deploying code that references these columns

-- Backup first
CREATE TABLE IF NOT EXISTS users_bak_20261011 AS SELECT * FROM users;

-- Add columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires TIMESTAMP WITH TIME ZONE;

-- Verify
\d users