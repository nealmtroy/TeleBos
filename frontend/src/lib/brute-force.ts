/**
 * TeleBos — Account-Level Brute Force Protection (vuln-0007)
 *
 * Implements progressive account lockout for the Better Auth sign-in endpoint:
 *   - 5  consecutive failures → 15-minute lockout
 *   - 10 consecutive failures → 1-hour lockout
 *   - 15 consecutive failures → 24-hour lockout
 *
 * The counter resets to 0 on a successful sign-in.
 * Non-existent emails are silently handled (recordFailedAttempt is a no-op
 * when no matching user row exists).
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL_SYNC || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ brute-force.ts: DATABASE_URL_SYNC or DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: DATABASE_URL });

// ---------------------------------------------------------------------------
// Progressive lockout tiers
// ---------------------------------------------------------------------------

interface LockoutTier {
  threshold: number;
  durationSeconds: number;
}

const LOCKOUT_TIERS: LockoutTier[] = [
  { threshold: 5,  durationSeconds: 900 },    // 15 minutes
  { threshold: 10, durationSeconds: 3600 },   // 1 hour
  { threshold: 15, durationSeconds: 86400 },  // 24 hours
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CheckLockoutResult {
  locked: boolean;
  lockedUntil: Date | null;
  remainingSeconds: number | null;
}

export interface RecordFailedResult {
  failedAttempts: number;
  isNowLocked: boolean;
  lockDuration: number | null;   // seconds
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the given email address is currently locked out.
 * Returns `{ locked: false }` for unknown emails (they have no user row).
 */
export async function checkLockout(email: string): Promise<CheckLockoutResult> {
  try {
    const { rows } = await pool.query(
      `SELECT "lockedUntil" FROM "user" WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    if (rows.length === 0) return { locked: false, lockedUntil: null, remainingSeconds: null };

    const lockedUntil: Date | null = rows[0].lockedUntil;
    if (!lockedUntil) return { locked: false, lockedUntil: null, remainingSeconds: null };

    const now = new Date();
    if (lockedUntil.getTime() <= now.getTime()) {
      return { locked: false, lockedUntil: null, remainingSeconds: null };
    }

    const remainingSeconds = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
    return { locked: true, lockedUntil, remainingSeconds };
  } catch (err) {
    console.error("[brute-force] checkLockout error:", err);
    // Fail open — don't block legitimate logins because of a DB hiccup
    return { locked: false, lockedUntil: null, remainingSeconds: null };
  }
}

/**
 * Record a failed sign-in attempt for the given email.
 * Atomically increments the counter and applies a lockout if a tier
 * threshold is crossed.  Silently returns a zero-like result for
 * non-existent emails (the UPDATE affects zero rows).
 */
export async function recordFailedAttempt(email: string): Promise<RecordFailedResult> {
  try {
    const { rows } = await pool.query(
      `UPDATE "user"
       SET "failedLoginAttempts" = "failedLoginAttempts" + 1,
           "lastFailedLoginAt" = NOW(),
           "lockedUntil" = CASE
             WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" > NOW() THEN "lockedUntil"
             ELSE NULL
           END
       WHERE LOWER(email) = LOWER($1)
       RETURNING "failedLoginAttempts"`,
      [email],
    );

    if (rows.length === 0) {
      // Unknown email — silently no-op
      return { failedAttempts: 0, isNowLocked: false, lockDuration: null };
    }

    const attempts: number = rows[0].failedLoginAttempts;

    // Determine if a new lockout should be applied
    const tier = [...LOCKOUT_TIERS].reverse().find((t) => attempts >= t.threshold);
    if (tier) {
      // Only apply a fresh lockout if the account isn't already locked longer
      const { rows: existing } = await pool.query(
        `SELECT "lockedUntil" FROM "user" WHERE LOWER(email) = LOWER($1)`,
        [email],
      );
      const currentLockedUntil: Date | null = existing[0]?.lockedUntil;
      const now = new Date();

      if (!currentLockedUntil || currentLockedUntil.getTime() <= now.getTime()) {
        // No active lockout — apply new one
        await pool.query(
          `UPDATE "user" SET "lockedUntil" = NOW() + INTERVAL '1 second' * $1 WHERE LOWER(email) = LOWER($2)`,
          [tier.durationSeconds, email],
        );
        return { failedAttempts: attempts, isNowLocked: true, lockDuration: tier.durationSeconds };
      }
    }

    return { failedAttempts: attempts, isNowLocked: false, lockDuration: null };
  } catch (err) {
    console.error("[brute-force] recordFailedAttempt error:", err);
    return { failedAttempts: 0, isNowLocked: false, lockDuration: null };
  }
}

/**
 * Reset the failed-attempt counter and clear any lockout for the given email.
 * Called on a successful sign-in.
 */
export async function resetFailedAttempts(email: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE "user"
       SET "failedLoginAttempts" = 0,
           "lockedUntil" = NULL,
           "lastFailedLoginAt" = NULL
       WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
  } catch (err) {
    console.error("[brute-force] resetFailedAttempts error:", err);
  }
}

// ---------------------------------------------------------------------------
// Email notification helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the display name for a user by email.  Returns the email itself if
 * no row is found.
 */
export async function getUserName(email: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT name FROM "user" WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    return rows[0]?.name || email;
  } catch {
    return email;
  }
}
