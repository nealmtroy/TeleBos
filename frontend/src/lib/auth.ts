import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { sendEmail, getVerificationEmailHtml, getResetPasswordEmailHtml } from "./email";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_SYNC || process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
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
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const html = getResetPasswordEmailHtml(user.name, url);
      await sendEmail({
        to: user.email,
        subject: "Atur Ulang Kata Sandi - TeleBos",
        html,
      });
    },
    password: {
      // Use bcryptjs for hashing/verifying to match the FastAPI backend and support migrated legacy users
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ password, hash }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, token }) => {
      const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
      const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}&callbackURL=${baseUrl}/login?verified=true`;
      
      const html = getVerificationEmailHtml(user.name, verificationUrl);
      await sendEmail({
        to: user.email,
        subject: "Verifikasi Alamat Email Anda - TeleBos",
        html,
      });
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
               VALUES ($1::uuid, $2, $3, true, 'basic', 0, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [user.id, user.email, user.name || null]
            );
          } catch (err) {
            console.error("[Better Auth] Failed to sync user to legacy users table:", err);
          }
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          if (account.providerId === "credential" && account.password) {
            try {
              await pool.query(
                `UPDATE users SET password_hash = $1 WHERE id = $2::uuid`,
                [account.password, account.userId]
              );
            } catch (err) {
              console.error("[Better Auth] Failed to sync password_hash on account create:", err);
            }
          }
        },
      },
      update: {
        after: async (account) => {
          if (account.providerId === "credential" && account.password) {
            try {
              await pool.query(
                `UPDATE users SET password_hash = $1 WHERE id = $2::uuid`,
                [account.password, account.userId]
              );
            } catch (err) {
              console.error("[Better Auth] Failed to sync password_hash on account update:", err);
            }
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
