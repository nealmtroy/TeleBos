import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_SYNC || process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
  trustedOrigins: (() => {
    try {
      return JSON.parse(process.env.CORS_ORIGINS || "[]");
    } catch {
      return ["http://localhost:3000"];
    }
  })(),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      // TODO: Replace with real email sending (Resend, SendGrid, etc.)
      console.log(`[Better Auth] Password reset link for ${user.email}: ${url}`);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // TODO: Replace with real email sending
      console.log(`[Better Auth] Email verification for ${user.email}: ${url}`);
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Sync the new Better Auth user into the legacy "users" table
          // so the FastAPI backend (which still uses SQLAlchemy User model)
          // can find them.
          try {
            await pool.query(
              `INSERT INTO users (id, email, full_name, is_active, role, balance, created_at, updated_at)
               VALUES ($1, $2, $3, true, 'basic', 0, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [user.id, user.email, user.name || null]
            );
          } catch (err) {
            console.error("[Better Auth] Failed to sync user to legacy users table:", err);
          }
        },
      },
    },
  },
  plugins: [
    twoFactor(),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
