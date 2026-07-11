import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { Pool } from "pg";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { sendEmail, getVerificationEmailHtml, getResetPasswordEmailHtml, getUnknownSignupAlertEmailHtml } from "./email";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_SYNC || process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
  rateLimit: {
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": {
        window: 10,
        max: 3,    // 3 requests per 10 seconds per IP
      },
      "/sign-up/email": {
        window: 10,
        max: 3,    // 3 requests per 10 seconds per IP
      },
    },
  },
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
    // Notify existing users when someone tries to re-register their email.
    // With requireEmailVerification: true, Better Auth returns a synthetic success
    // response (no email sent) to prevent enumeration, but we can alert the real owner.
    onExistingUserSignUp: async ({ user }) => {
      const html = getUnknownSignupAlertEmailHtml(user.name, user.email);
      await sendEmail({
        to: user.email,
        subject: "Percobaan Pendaftaran Menggunakan Email Anda - TeleBos",
        html,
      });
    },
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
    session: {
      create: {
        before: async (session) => {
          // Hash the session token so it is not stored as plaintext.
          // The plaintext token still lives in the token column (Better Auth
          // needs it for internal operations), but token_hash lets the backend
          // validate sessions by hash instead of direct token comparison,
          // protecting tokens at rest in the database.
          const tokenHash = createHash("sha256").update(session.token).digest("hex");
          return { data: { token_hash: tokenHash } };
        },
      },
    },
    user: {
      create: {
        before: async (user, ctx) => {
          // Prevent duplicate email registration by checking both the
          // Better Auth "user" table and the legacy "users" table before
          // the DB insert.  Better Auth's own table has a UNIQUE(email)
          // constraint, but this explicit pre-check is defence-in-depth
          // and also catches stale entries in the legacy table that may
          // not have been backfilled into the BA table yet.
          const { rows } = await pool.query(
            `SELECT 1 FROM "user" WHERE LOWER(email) = LOWER($1)
             UNION ALL
             SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [user.email]
          );
          if (rows.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: "Email sudah terdaftar. Silakan login atau gunakan email lain.",
            });
          }
        },
        after: async (user) => {
          // Sync the new Better Auth user into the legacy "users" table
          // so the FastAPI backend (which still uses SQLAlchemy User model)
          // can find them.
          //
          // ON CONFLICT (id) guards against UUID collisions (extremely
          // unlikely with random UUIDs, but safe).  The before hook above
          // already prevents duplicate emails, so an email UNIQUE violation
          // here means something bypassed that check — surface it loudly.
          try {
            await pool.query(
              `INSERT INTO users (id, email, full_name, is_active, role, balance, created_at, updated_at)
               VALUES ($1::uuid, $2, $3, true, 'basic', 0, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [user.id, user.email, user.name || null]
            );
          } catch (err) {
            console.error("[Better Auth] Failed to sync user to legacy users table:", err);
            if (
              typeof err === "object" &&
              err !== null &&
              "code" in err &&
              (err as { code: string }).code === "23505"
            ) {
              // Email uniqueness conflict — the before hook should have caught
              // this.  Delete the just-created Better Auth user to stay consistent.
              console.error(
                "[Better Auth] UNIQUE violation syncing user %s (%s). Cleaning up BA user row.",
                user.id,
                user.email
              );
              try {
                await pool.query(`DELETE FROM "user" WHERE id = $1`, [user.id]);
              } catch (_cleanupErr) {
                console.error("[Better Auth] Cleanup delete also failed:", _cleanupErr);
              }
            }
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
