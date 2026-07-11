#!/usr/bin/env node
/**
 * TeleBos — Better Auth Database Setup
 *
 * Creates Better Auth's required tables (user, session, account, verification)
 * + twoFactor plugin table in PostgreSQL if they don't already exist.
 * Idempotent — safe to run on every container start.
 *
 * We use raw SQL via pg.Pool instead of the @better-auth/cli migrate command
 * because the CLI requires the TypeScript source file (auth.ts) + jiti/babel
 * transforms, which aren't available in the standalone production image.
 */

import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL_SYNC || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL_SYNC or DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const DDL = `

-- ── user table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user" (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image         TEXT,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── session table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "session" (
  id            TEXT PRIMARY KEY,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  token_hash    TEXT,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"("userId");
CREATE INDEX IF NOT EXISTS idx_session_token_hash ON "session"(token_hash);

-- ── account table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "account" (
  id                  TEXT PRIMARY KEY,
  "accountId"         TEXT NOT NULL,
  "providerId"        TEXT NOT NULL,
  "userId"            TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"       TEXT,
  "refreshToken"      TEXT,
  "idToken"           TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope               TEXT,
  password            TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_userId ON "account"("userId");

-- ── verification table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "verification" (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"(identifier);

-- ── twoFactor table (twoFactor plugin) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "twoFactor" (
  id          TEXT PRIMARY KEY,
  secret      TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId"    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_twoFactor_userId ON "twoFactor"("userId");
CREATE INDEX IF NOT EXISTS idx_twoFactor_secret ON "twoFactor"(secret);

`;

async function main() {
  const client = await pool.connect();
  try {
    console.log("→ Setting up Better Auth database tables...");
    await client.query(DDL);
    console.log("✓ Better Auth tables ready (created if they didn't exist).");
  } catch (err) {
    console.error("✗ Failed to create Better Auth tables:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
